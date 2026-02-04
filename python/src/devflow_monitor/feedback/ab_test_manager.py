"""
DevFlow Monitor - A/B Test Manager.

Manages A/B tests for feature experimentation and data-driven decisions.
"""

from __future__ import annotations

import hashlib
import json
import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from ..storage.database import DatabaseManager
from ..utils.logger import Logger
from .types import (
    ABMetricType,
    ABTestAudience,
    ABTestConfig,
    ABTestResult,
    ABTestStatus,
    ABTestVariant,
    ABTestWinner,
    FeedbackEvent,
    FeedbackEventType,
    MetricEvent,
    VariantResult,
)

logger = Logger("ABTestManager")


@dataclass
class ABTestManagerConfig:
    """Configuration for A/B test manager."""

    min_sample_size: int = 100
    confidence_level: float = 0.95
    auto_complete: bool = True
    metrics_interval: int = 5 * 60 * 1000  # 5 minutes


class ABTestManager:
    """
    Manages A/B tests for feature experimentation.

    Provides test creation, variant assignment, metric tracking,
    and statistical analysis of test results.

    Example:
        manager = ABTestManager(db)
        await manager.initialize()

        test = await manager.create_test(config)
        await manager.start_test(test.id)

        variant_id = await manager.assign_variant(test.id, user_id)
        await manager.record_metric(metric_event)

        results = await manager.get_results(test.id)
    """

    def __init__(
        self,
        database: DatabaseManager,
        config: ABTestManagerConfig | None = None,
    ) -> None:
        """
        Initialize A/B test manager.

        Args:
            database: Database manager instance.
            config: Manager configuration.
        """
        self._db = database
        self._config = config or ABTestManagerConfig()
        self._active_tests: dict[str, ABTestConfig] = {}
        self._user_assignments: dict[str, dict[str, str]] = {}  # test_id -> user_id -> variant_id
        self._event_handlers: dict[str, list[Callable]] = {}
        self._metrics_timer: Any = None

    async def initialize(self) -> None:
        """Initialize database tables for A/B testing."""
        # A/B tests table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS ab_tests (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                audience_percentage REAL NOT NULL,
                audience_criteria TEXT,
                start_time INTEGER,
                end_time INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )
        """)
        await self._db.commit()

        # Variants table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS ab_test_variants (
                id TEXT PRIMARY KEY,
                test_id TEXT NOT NULL,
                name TEXT NOT NULL,
                traffic_percentage REAL NOT NULL,
                changes TEXT NOT NULL,
                is_control INTEGER NOT NULL,
                FOREIGN KEY (test_id) REFERENCES ab_tests(id) ON DELETE CASCADE
            )
        """)
        await self._db.commit()

        # Metrics definition table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS ab_test_metrics (
                test_id TEXT NOT NULL,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                goal REAL,
                calculation TEXT NOT NULL,
                PRIMARY KEY (test_id, name),
                FOREIGN KEY (test_id) REFERENCES ab_tests(id) ON DELETE CASCADE
            )
        """)
        await self._db.commit()

        # User assignments table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS ab_test_assignments (
                test_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                variant_id TEXT NOT NULL,
                assigned_at INTEGER NOT NULL,
                PRIMARY KEY (test_id, user_id),
                FOREIGN KEY (test_id) REFERENCES ab_tests(id) ON DELETE CASCADE,
                FOREIGN KEY (variant_id) REFERENCES ab_test_variants(id) ON DELETE CASCADE
            )
        """)
        await self._db.commit()

        # Metric events table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS ab_test_events (
                id TEXT PRIMARY KEY,
                test_id TEXT NOT NULL,
                variant_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                metric TEXT NOT NULL,
                value REAL NOT NULL,
                timestamp INTEGER NOT NULL,
                FOREIGN KEY (test_id) REFERENCES ab_tests(id) ON DELETE CASCADE,
                FOREIGN KEY (variant_id) REFERENCES ab_test_variants(id) ON DELETE CASCADE
            )
        """)
        await self._db.commit()

        # Create indexes
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_test_assignments ON ab_test_assignments(test_id, user_id)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_test_events ON ab_test_events(test_id, metric, timestamp)"
        )
        await self._db.commit()

        logger.info("A/B test manager initialized")

    async def start(self) -> None:
        """Start the A/B test manager."""
        await self._load_active_tests()
        logger.info("A/B test manager started", {"active_tests": len(self._active_tests)})

    def stop(self) -> None:
        """Stop the A/B test manager."""
        self._active_tests.clear()
        self._user_assignments.clear()
        logger.info("A/B test manager stopped")

    def on(self, event: str, handler: Callable) -> None:
        """Register an event handler."""
        if event not in self._event_handlers:
            self._event_handlers[event] = []
        self._event_handlers[event].append(handler)

    def _emit(self, event: str, data: Any) -> None:
        """Emit an event to registered handlers."""
        if event in self._event_handlers:
            for handler in self._event_handlers[event]:
                try:
                    handler(data)
                except Exception as e:
                    logger.error(f"Event handler error: {e}")

    async def create_test(self, config: ABTestConfig) -> ABTestConfig:
        """
        Create a new A/B test.

        Args:
            config: Test configuration.

        Returns:
            Created test configuration.

        Raises:
            ValueError: If validation fails.
        """
        # Validate configuration
        self._validate_test_config(config)

        # Assign IDs to variants if not present
        for variant in config.variants:
            if not variant.id:
                variant.id = str(uuid.uuid4())

        # Ensure test has an ID
        if not config.id:
            config.id = str(uuid.uuid4())

        # Save to database
        await self._save_test(config)

        logger.info("A/B test created", {"test_id": config.id, "name": config.name})

        return config

    async def start_test(self, test_id: str) -> bool:
        """
        Start an A/B test.

        Args:
            test_id: Test ID.

        Returns:
            True if started successfully.

        Raises:
            ValueError: If test not found or not in draft status.
        """
        test = await self._get_test(test_id)

        if not test:
            raise ValueError(f"Test {test_id} not found")

        if test.status != ABTestStatus.DRAFT:
            raise ValueError(f"Test {test_id} is not in draft status")

        # Update status
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        test.status = ABTestStatus.RUNNING
        test.start_time = now

        await self._db.execute(
            "UPDATE ab_tests SET status = ?, start_time = ?, updated_at = ? WHERE id = ?",
            (ABTestStatus.RUNNING.value, now, now, test_id),
        )
        await self._db.commit()

        # Add to active tests
        self._active_tests[test_id] = test

        # Emit event
        event = FeedbackEvent(
            type=FeedbackEventType.AB_TEST_STARTED,
            timestamp=now,
            details={"test_id": test_id, "name": test.name},
        )
        self._emit("test_started", event)

        logger.info("A/B test started", {"test_id": test_id, "name": test.name})

        return True

    async def pause_test(self, test_id: str) -> bool:
        """
        Pause an A/B test.

        Args:
            test_id: Test ID.

        Returns:
            True if paused successfully.
        """
        test = self._active_tests.get(test_id)

        if not test or test.status != ABTestStatus.RUNNING:
            raise ValueError(f"Active test {test_id} not found")

        # Update status
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        test.status = ABTestStatus.PAUSED

        await self._db.execute(
            "UPDATE ab_tests SET status = ?, updated_at = ? WHERE id = ?",
            (ABTestStatus.PAUSED.value, now, test_id),
        )
        await self._db.commit()

        # Remove from active tests
        del self._active_tests[test_id]

        logger.info("A/B test paused", {"test_id": test_id, "name": test.name})

        return True

    async def complete_test(self, test_id: str) -> ABTestResult:
        """
        Complete an A/B test and get final results.

        Args:
            test_id: Test ID.

        Returns:
            Final test results.
        """
        test = await self._get_test(test_id)

        if not test:
            raise ValueError(f"Test {test_id} not found")

        if test.status == ABTestStatus.COMPLETED:
            raise ValueError(f"Test {test_id} is already completed")

        # Get final results
        result = await self.get_results(test_id)

        # Update status
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        test.status = ABTestStatus.COMPLETED
        test.end_time = now

        await self._db.execute(
            "UPDATE ab_tests SET status = ?, end_time = ?, updated_at = ? WHERE id = ?",
            (ABTestStatus.COMPLETED.value, now, now, test_id),
        )
        await self._db.commit()

        # Remove from active tests
        if test_id in self._active_tests:
            del self._active_tests[test_id]

        # Emit event
        event = FeedbackEvent(
            type=FeedbackEventType.AB_TEST_COMPLETED,
            timestamp=now,
            details={
                "test_id": test_id,
                "name": test.name,
                "winner": result.winner.model_dump() if result.winner else None,
            },
        )
        self._emit("test_completed", event)

        logger.info(
            "A/B test completed",
            {"test_id": test_id, "name": test.name, "winner": result.winner},
        )

        return result

    async def assign_variant(self, test_id: str, user_id: str) -> str:
        """
        Assign a user to a test variant.

        Args:
            test_id: Test ID.
            user_id: User ID.

        Returns:
            Assigned variant ID.

        Raises:
            ValueError: If test not active.
        """
        test = self._active_tests.get(test_id)

        if not test or test.status != ABTestStatus.RUNNING:
            raise ValueError(f"Active test {test_id} not found")

        # Check existing assignment
        variant_id = self._get_user_assignment(test_id, user_id)

        if not variant_id:
            # New assignment
            variant_id = self._select_variant(test, user_id)

            # Save assignment
            await self._save_user_assignment(test_id, user_id, variant_id)

            # Update memory cache
            if test_id not in self._user_assignments:
                self._user_assignments[test_id] = {}
            self._user_assignments[test_id][user_id] = variant_id

        return variant_id

    async def record_metric(self, event: MetricEvent) -> None:
        """
        Record a metric event.

        Args:
            event: Metric event to record.
        """
        # Check if test is active
        test = self._active_tests.get(event.test_id)
        if not test:
            return  # Ignore for inactive tests

        # Verify user assignment
        assigned_variant = self._get_user_assignment(event.test_id, event.user_id)
        if assigned_variant != event.variant_id:
            logger.warn(
                "Metric event variant mismatch",
                {
                    "test_id": event.test_id,
                    "user_id": event.user_id,
                    "expected": assigned_variant,
                    "actual": event.variant_id,
                },
            )
            return

        # Save event
        await self._db.execute(
            """
            INSERT INTO ab_test_events (
                id, test_id, variant_id, user_id, metric, value, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                event.test_id,
                event.variant_id,
                event.user_id,
                event.metric,
                event.value,
                event.timestamp,
            ),
        )
        await self._db.commit()

    async def get_results(self, test_id: str) -> ABTestResult:
        """
        Get test results.

        Args:
            test_id: Test ID.

        Returns:
            Test results.
        """
        test = await self._get_test(test_id)

        if not test:
            raise ValueError(f"Test {test_id} not found")

        # Calculate variant results
        variant_results = []
        for variant in test.variants:
            stats = await self._calculate_variant_stats(test_id, variant.id, test.metrics)
            variant_results.append(
                VariantResult(
                    variant_id=variant.id,
                    participants=stats["participants"],
                    metrics=stats["metrics"],
                    confidence=stats["confidence"],
                )
            )

        # Determine winner
        winner = self._determine_winner(test, variant_results)

        return ABTestResult(
            test_id=test_id,
            variant_results=variant_results,
            winner=winner,
            analyzed_at=int(datetime.now(timezone.utc).timestamp() * 1000),
        )

    async def _calculate_variant_stats(
        self, test_id: str, variant_id: str, metrics: list
    ) -> dict:
        """Calculate statistics for a variant."""
        # Participant count
        participant_row = await self._db.fetch_one(
            """
            SELECT COUNT(DISTINCT user_id) as count
            FROM ab_test_assignments
            WHERE test_id = ? AND variant_id = ?
            """,
            (test_id, variant_id),
        )
        participants = participant_row["count"] if participant_row else 0

        # Calculate each metric
        metric_values = {}
        for metric in metrics:
            value = await self._calculate_metric_value(test_id, variant_id, metric)
            metric_values[metric.name] = value

        # Calculate confidence
        confidence = 0.95 if participants >= self._config.min_sample_size else (
            participants / self._config.min_sample_size
        )

        return {
            "participants": participants,
            "metrics": metric_values,
            "confidence": confidence,
        }

    async def _calculate_metric_value(
        self, test_id: str, variant_id: str, metric
    ) -> float:
        """Calculate metric value for a variant."""
        if metric.type == ABMetricType.CONVERSION:
            # Conversion rate
            row = await self._db.fetch_one(
                """
                SELECT
                    COUNT(DISTINCT CASE WHEN e.value > 0 THEN e.user_id END) as conversions,
                    COUNT(DISTINCT a.user_id) as total
                FROM ab_test_assignments a
                LEFT JOIN ab_test_events e ON
                    a.test_id = e.test_id AND
                    a.user_id = e.user_id AND
                    a.variant_id = e.variant_id AND
                    e.metric = ?
                WHERE a.test_id = ? AND a.variant_id = ?
                """,
                (metric.name, test_id, variant_id),
            )
            if row and row["total"] > 0:
                return (row["conversions"] / row["total"]) * 100
            return 0.0

        elif metric.type in (ABMetricType.ENGAGEMENT, ABMetricType.PERFORMANCE):
            # Average value
            row = await self._db.fetch_one(
                """
                SELECT AVG(value) as avg_value
                FROM ab_test_events
                WHERE test_id = ? AND variant_id = ? AND metric = ?
                """,
                (test_id, variant_id, metric.name),
            )
            return row["avg_value"] if row and row["avg_value"] else 0.0

        return 0.0

    def _determine_winner(
        self, test: ABTestConfig, results: list[VariantResult]
    ) -> ABTestWinner | None:
        """Determine the winning variant."""
        # Check if all variants have enough data
        all_have_enough_data = all(
            r.participants >= self._config.min_sample_size for r in results
        )

        if not all_have_enough_data:
            return None

        # Find control variant
        control_variant = next((v for v in test.variants if v.is_control), None)
        if not control_variant:
            return None

        control_result = next(
            (r for r in results if r.variant_id == control_variant.id), None
        )
        if not control_result:
            return None

        # Compare each variant to control
        best_variant = control_variant.id
        best_improvement = 0.0
        best_confidence = 0.0

        for result in results:
            if result.variant_id == control_variant.id:
                continue

            # Use first metric as primary
            if test.metrics:
                primary_metric = test.metrics[0]
                control_value = control_result.metrics.get(primary_metric.name, 0)
                variant_value = result.metrics.get(primary_metric.name, 0)

                improvement = 0.0
                if control_value != 0:
                    improvement = ((variant_value - control_value) / control_value) * 100

                # Check statistical significance (simplified)
                is_significant = (
                    abs(improvement) > 5 and result.confidence >= self._config.confidence_level
                )

                if is_significant and improvement > best_improvement:
                    best_variant = result.variant_id
                    best_improvement = improvement
                    best_confidence = result.confidence

        # No improvement found
        if best_variant == control_variant.id:
            return None

        return ABTestWinner(
            variant_id=best_variant,
            confidence=best_confidence,
            improvement=best_improvement,
        )

    def _select_variant(self, test: ABTestConfig, user_id: str) -> str:
        """Select a variant for a user using hash-based assignment."""
        # Hash user ID for consistent assignment
        hash_input = f"{test.id}:{user_id}"
        hash_bytes = hashlib.md5(hash_input.encode()).digest()
        hash_value = int.from_bytes(hash_bytes[:4], byteorder="big") / 0xFFFFFFFF

        # Check audience percentage
        if hash_value * 100 > test.audience.percentage:
            # Not in test audience - assign to control
            control_variant = next((v for v in test.variants if v.is_control), None)
            return control_variant.id if control_variant else test.variants[0].id

        # Select variant based on traffic percentage
        cumulative = 0.0
        for variant in test.variants:
            cumulative += variant.traffic_percentage / 100
            if hash_value <= cumulative:
                return variant.id

        # Fallback to last variant
        return test.variants[-1].id if test.variants else ""

    def _validate_test_config(self, config: ABTestConfig) -> None:
        """Validate test configuration."""
        # Need at least 2 variants
        if len(config.variants) < 2:
            raise ValueError("At least 2 variants are required")

        # Traffic percentages must sum to 100
        total_traffic = sum(v.traffic_percentage for v in config.variants)
        if abs(total_traffic - 100) > 0.01:
            raise ValueError("Variant traffic percentages must sum to 100")

        # Exactly one control variant
        control_count = sum(1 for v in config.variants if v.is_control)
        if control_count != 1:
            raise ValueError("Exactly one control variant is required")

        # Need at least one metric
        if not config.metrics:
            raise ValueError("At least one metric is required")

        # Valid audience percentage
        if config.audience.percentage <= 0 or config.audience.percentage > 100:
            raise ValueError("Audience percentage must be between 0 and 100")

    async def _load_active_tests(self) -> None:
        """Load active tests from database."""
        rows = await self._db.fetch_all(
            "SELECT * FROM ab_tests WHERE status = ?",
            (ABTestStatus.RUNNING.value,),
        )

        for row in rows:
            test = await self._get_test(row["id"])
            if test:
                self._active_tests[test.id] = test
                await self._load_user_assignments(test.id)

    async def _load_user_assignments(self, test_id: str) -> None:
        """Load user assignments for a test."""
        rows = await self._db.fetch_all(
            "SELECT user_id, variant_id FROM ab_test_assignments WHERE test_id = ?",
            (test_id,),
        )

        self._user_assignments[test_id] = {
            row["user_id"]: row["variant_id"] for row in rows
        }

    async def _save_test(self, test: ABTestConfig) -> None:
        """Save test to database."""
        async with self._db.transaction():
            now = int(datetime.now(timezone.utc).timestamp() * 1000)

            # Save test
            await self._db.execute(
                """
                INSERT INTO ab_tests (
                    id, name, description, status, audience_percentage,
                    audience_criteria, start_time, end_time, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    test.id,
                    test.name,
                    test.description,
                    test.status.value,
                    test.audience.percentage,
                    json.dumps(test.audience.criteria) if test.audience.criteria else None,
                    test.start_time,
                    test.end_time,
                    test.created_at,
                    now,
                ),
            )

            # Save variants
            for variant in test.variants:
                await self._db.execute(
                    """
                    INSERT INTO ab_test_variants (
                        id, test_id, name, traffic_percentage, changes, is_control
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        variant.id,
                        test.id,
                        variant.name,
                        variant.traffic_percentage,
                        json.dumps(variant.changes),
                        1 if variant.is_control else 0,
                    ),
                )

            # Save metrics
            for metric in test.metrics:
                await self._db.execute(
                    """
                    INSERT INTO ab_test_metrics (
                        test_id, name, type, goal, calculation
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        test.id,
                        metric.name,
                        metric.type.value,
                        metric.goal,
                        metric.calculation,
                    ),
                )

    async def _get_test(self, test_id: str) -> ABTestConfig | None:
        """Get test from database."""
        test_row = await self._db.fetch_one(
            "SELECT * FROM ab_tests WHERE id = ?", (test_id,)
        )

        if not test_row:
            return None

        # Get variants
        variant_rows = await self._db.fetch_all(
            "SELECT * FROM ab_test_variants WHERE test_id = ?", (test_id,)
        )

        # Get metrics
        metric_rows = await self._db.fetch_all(
            "SELECT * FROM ab_test_metrics WHERE test_id = ?", (test_id,)
        )

        return ABTestConfig(
            id=test_row["id"],
            name=test_row["name"],
            description=test_row["description"] or "",
            status=ABTestStatus(test_row["status"]),
            variants=[
                ABTestVariant(
                    id=v["id"],
                    name=v["name"],
                    traffic_percentage=v["traffic_percentage"],
                    changes=json.loads(v["changes"]),
                    is_control=bool(v["is_control"]),
                )
                for v in variant_rows
            ],
            audience=ABTestAudience(
                percentage=test_row["audience_percentage"],
                criteria=(
                    json.loads(test_row["audience_criteria"])
                    if test_row.get("audience_criteria")
                    else None
                ),
            ),
            metrics=[
                # Import ABTestMetric from types
                ABTestMetric(
                    name=m["name"],
                    type=ABMetricType(m["type"]),
                    goal=m["goal"],
                    calculation=m["calculation"],
                )
                for m in metric_rows
            ],
            start_time=test_row.get("start_time"),
            end_time=test_row.get("end_time"),
            created_at=test_row["created_at"],
        )

    def _get_user_assignment(self, test_id: str, user_id: str) -> str | None:
        """Get user's variant assignment from cache."""
        test_assignments = self._user_assignments.get(test_id, {})
        return test_assignments.get(user_id)

    async def _save_user_assignment(
        self, test_id: str, user_id: str, variant_id: str
    ) -> None:
        """Save user assignment to database."""
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        await self._db.execute(
            """
            INSERT INTO ab_test_assignments (test_id, user_id, variant_id, assigned_at)
            VALUES (?, ?, ?, ?)
            """,
            (test_id, user_id, variant_id, now),
        )
        await self._db.commit()

    async def list_active_tests(self) -> list[ABTestConfig]:
        """List all active tests."""
        return list(self._active_tests.values())

    def _weighted_random_choice(self, weights: list[float]) -> int:
        """Select random index based on weights."""
        total = sum(weights)
        r = random.random() * total
        cumulative = 0.0
        for i, weight in enumerate(weights):
            cumulative += weight
            if r <= cumulative:
                return i
        return len(weights) - 1

    def _calculate_statistical_significance(
        self,
        control_conversions: int,
        control_total: int,
        variant_conversions: int,
        variant_total: int,
    ) -> float:
        """
        Calculate statistical significance using simplified z-test.

        Returns confidence level (0-1).
        """
        if control_total == 0 or variant_total == 0:
            return 0.0

        control_rate = control_conversions / control_total
        variant_rate = variant_conversions / variant_total

        # Pooled proportion
        pooled = (control_conversions + variant_conversions) / (control_total + variant_total)

        # Standard error
        se = (pooled * (1 - pooled) * (1 / control_total + 1 / variant_total)) ** 0.5

        if se == 0:
            return 0.0

        # Z-score
        z = abs(variant_rate - control_rate) / se

        # Simplified confidence (approximation)
        # z=1.96 -> 95% confidence, z=2.58 -> 99% confidence
        if z >= 2.58:
            return 0.99
        elif z >= 1.96:
            return 0.95
        elif z >= 1.645:
            return 0.90
        else:
            return min(0.9, z / 1.96 * 0.95)


# Import ABTestMetric for _get_test method
from .types import ABTestMetric
