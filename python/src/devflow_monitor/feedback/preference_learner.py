"""
DevFlow Monitor - Preference Learner.

Analyzes user behavior patterns to learn preferences and personalize experience.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from ..storage.database import DatabaseManager
from ..utils.logger import Logger
from .types import (
    FeedbackEvent,
    FeedbackEventType,
    NotificationPreference,
    PreferredFeature,
    UIPreferences,
    UserBehaviorEvent,
    UserBehaviorType,
    UserPreference,
    WorkflowPattern,
)

logger = Logger("PreferenceLearner")


@dataclass
class PreferenceLearnerConfig:
    """Configuration for preference learner."""

    min_data_points: int = 10
    learning_interval: int = 60 * 60 * 1000  # 1 hour in milliseconds
    data_expiration: int = 30 * 24 * 60 * 60 * 1000  # 30 days in milliseconds
    confidence_threshold: float = 0.6


class PreferenceLearner:
    """
    Learns user preferences from behavior patterns.

    Analyzes usage patterns, workflow preferences, and behavior
    to personalize the user experience.

    Example:
        learner = PreferenceLearner(db)
        await learner.initialize()

        await learner.record_behavior(behavior_event)
        preferences = await learner.get_preferences(user_id)
    """

    def __init__(
        self,
        database: DatabaseManager,
        config: PreferenceLearnerConfig | None = None,
    ) -> None:
        """
        Initialize preference learner.

        Args:
            database: Database manager instance.
            config: Learner configuration.
        """
        self._db = database
        self._config = config or PreferenceLearnerConfig()
        self._behavior_buffer: dict[str, list[UserBehaviorEvent]] = {}
        self._event_handlers: dict[str, list[Callable]] = {}
        self._learning_timer: Any = None
        self._running = False

    async def initialize(self) -> None:
        """Initialize database tables for preference learning."""
        # User behaviors table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS user_behaviors (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL,
                feature TEXT,
                workflow TEXT,
                duration INTEGER,
                satisfaction INTEGER,
                metadata TEXT,
                timestamp INTEGER NOT NULL
            )
        """)
        await self._db.commit()

        # User preferences table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id TEXT PRIMARY KEY,
                preferred_features TEXT,
                workflow_patterns TEXT,
                ui_preferences TEXT,
                notification_preferences TEXT,
                learned_at INTEGER NOT NULL,
                confidence REAL NOT NULL,
                updated_at INTEGER NOT NULL
            )
        """)
        await self._db.commit()

        # Create indexes
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_behaviors_user ON user_behaviors(user_id)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_behaviors_timestamp ON user_behaviors(timestamp)"
        )
        await self._db.commit()

        logger.info("Preference learner initialized")

    def start(self) -> None:
        """Start the preference learner."""
        if self._running:
            return

        self._running = True

        # Run initial learning cycle
        # In a real implementation, we'd use asyncio task scheduling
        logger.info("Preference learner started")

    def stop(self) -> None:
        """Stop the preference learner."""
        self._running = False

        # Flush any buffered behaviors
        # This would be done async in a real implementation

        logger.info("Preference learner stopped")

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

    async def record_behavior(self, event: UserBehaviorEvent) -> None:
        """
        Record a user behavior event.

        Args:
            event: Behavior event to record.
        """
        # Add to buffer
        user_events = self._behavior_buffer.get(event.user_id, [])
        user_events.append(event)
        self._behavior_buffer[event.user_id] = user_events

        # Flush if buffer is large
        if len(user_events) >= 100:
            await self._flush_user_behaviors(event.user_id)

    async def get_preferences(self, user_id: str) -> UserPreference | None:
        """
        Get learned preferences for a user.

        Args:
            user_id: User ID.

        Returns:
            User preferences or None if not learned yet.
        """
        row = await self._db.fetch_one(
            "SELECT * FROM user_preferences WHERE user_id = ?",
            (user_id,),
        )

        if not row:
            return None

        return UserPreference(
            user_id=row["user_id"],
            preferred_features=[
                PreferredFeature(**f)
                for f in json.loads(row["preferred_features"] or "[]")
            ],
            workflow_patterns=[
                WorkflowPattern(**w)
                for w in json.loads(row["workflow_patterns"] or "[]")
            ],
            ui_preferences=UIPreferences(**json.loads(row["ui_preferences"] or "{}")),
            notification_preferences=[
                NotificationPreference(**n)
                for n in json.loads(row["notification_preferences"] or "[]")
            ],
            learned_at=row["learned_at"],
            confidence=row["confidence"],
        )

    async def learn(self, user_id: str) -> list[UserPreference]:
        """
        Trigger learning for a specific user.

        Args:
            user_id: User ID to learn preferences for.

        Returns:
            List of learned preferences (typically one for the user).
        """
        await self._learn_user_preferences(user_id)
        preferences = await self.get_preferences(user_id)
        return [preferences] if preferences else []

    async def run_learning_cycle(self) -> None:
        """Run a full learning cycle for all active users."""
        logger.info("Running preference learning cycle")

        # Flush all buffers
        await self._flush_behavior_buffer()

        # Clean up expired data
        await self._cleanup_expired_data()

        # Get active users
        users = await self._get_active_users()

        # Learn preferences for each user
        for user_id in users:
            await self._learn_user_preferences(user_id)

        logger.info("Preference learning cycle completed", {"user_count": len(users)})

    async def _learn_user_preferences(self, user_id: str) -> None:
        """Learn preferences for a specific user."""
        try:
            # Get user behaviors
            behaviors = await self._get_user_behaviors(user_id)

            if len(behaviors) < self._config.min_data_points:
                return  # Not enough data

            # Analyze feature preferences
            preferred_features = self._analyze_feature_preferences(behaviors)

            # Analyze workflow patterns
            workflow_patterns = self._analyze_workflow_patterns(behaviors)

            # Infer UI preferences
            ui_preferences = self._infer_ui_preferences(behaviors)

            # Infer notification preferences
            notification_preferences = self._infer_notification_preferences(behaviors)

            # Calculate confidence
            confidence = self._calculate_confidence(behaviors)

            if confidence < self._config.confidence_threshold:
                return  # Not confident enough

            # Save preferences
            now = int(datetime.now(timezone.utc).timestamp() * 1000)
            preference = UserPreference(
                user_id=user_id,
                preferred_features=preferred_features,
                workflow_patterns=workflow_patterns,
                ui_preferences=ui_preferences,
                notification_preferences=notification_preferences,
                learned_at=now,
                confidence=confidence,
            )

            await self._save_user_preference(preference)

            # Emit event
            event = FeedbackEvent(
                type=FeedbackEventType.PREFERENCE_LEARNED,
                timestamp=now,
                details={"user_id": user_id, "confidence": confidence},
            )
            self._emit("preference_learned", event)

            logger.info("User preferences learned", {"user_id": user_id, "confidence": confidence})

        except Exception as e:
            logger.error(f"Failed to learn user preferences: {e}", {"user_id": user_id})

    def _analyze_feature_preferences(
        self, behaviors: list[UserBehaviorEvent]
    ) -> list[PreferredFeature]:
        """Analyze feature usage to determine preferences."""
        feature_stats: dict[str, dict[str, Any]] = {}

        for behavior in behaviors:
            if behavior.type == UserBehaviorType.FEATURE_USE and behavior.feature:
                if behavior.feature not in feature_stats:
                    feature_stats[behavior.feature] = {
                        "count": 0,
                        "total_satisfaction": 0,
                    }
                feature_stats[behavior.feature]["count"] += 1
                if behavior.satisfaction is not None:
                    feature_stats[behavior.feature]["total_satisfaction"] += behavior.satisfaction

        # Convert to PreferredFeature list
        preferences = [
            PreferredFeature(
                feature=feature,
                usage=stats["count"],
                satisfaction=(
                    stats["total_satisfaction"] / stats["count"]
                    if stats["count"] > 0
                    else 5.0
                ),
            )
            for feature, stats in feature_stats.items()
        ]

        # Sort by usage and return top 10
        preferences.sort(key=lambda x: x.usage, reverse=True)
        return preferences[:10]

    def _analyze_workflow_patterns(
        self, behaviors: list[UserBehaviorEvent]
    ) -> list[WorkflowPattern]:
        """Analyze workflow patterns from behavior data."""
        workflow_stats: dict[str, dict[str, Any]] = {}

        for behavior in behaviors:
            if behavior.type == UserBehaviorType.WORKFLOW_COMPLETE and behavior.workflow:
                if behavior.workflow not in workflow_stats:
                    workflow_stats[behavior.workflow] = {"count": 0, "total_duration": 0}
                workflow_stats[behavior.workflow]["count"] += 1
                if behavior.duration:
                    workflow_stats[behavior.workflow]["total_duration"] += behavior.duration

        # Convert to WorkflowPattern list
        patterns = [
            WorkflowPattern(
                pattern=workflow,
                frequency=stats["count"],
                duration=(
                    stats["total_duration"] / stats["count"]
                    if stats["count"] > 0
                    else 0.0
                ),
            )
            for workflow, stats in workflow_stats.items()
        ]

        # Sort by frequency
        patterns.sort(key=lambda x: x.frequency, reverse=True)
        return patterns

    def _infer_ui_preferences(
        self, behaviors: list[UserBehaviorEvent]
    ) -> UIPreferences:
        """Infer UI preferences from behavior patterns."""
        preferences = UIPreferences()

        # Analyze time-of-day usage to infer theme preference
        hourly_usage = [0] * 24
        for behavior in behaviors:
            hour = datetime.fromtimestamp(behavior.timestamp / 1000).hour
            hourly_usage[hour] += 1

        # Calculate night usage ratio (8PM - 6AM)
        night_hours = list(range(20, 24)) + list(range(0, 6))
        night_usage = sum(hourly_usage[h] for h in night_hours)
        total_usage = sum(hourly_usage)

        if total_usage > 0:
            night_ratio = night_usage / total_usage
            if night_ratio > 0.6:
                preferences.theme = "dark"
            elif night_ratio < 0.2:
                preferences.theme = "light"
            else:
                preferences.theme = "auto"

        # Infer shortcuts from frequently used features
        feature_counts: dict[str, int] = {}
        for behavior in behaviors:
            if behavior.type == UserBehaviorType.FEATURE_USE and behavior.feature:
                feature_counts[behavior.feature] = feature_counts.get(behavior.feature, 0) + 1

        # Assign shortcuts to top 5 features
        sorted_features = sorted(feature_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        shortcut_keys = ["Ctrl+1", "Ctrl+2", "Ctrl+3", "Ctrl+4", "Ctrl+5"]

        if sorted_features:
            preferences.shortcuts = {
                feature: shortcut_keys[i]
                for i, (feature, _) in enumerate(sorted_features)
                if i < len(shortcut_keys)
            }

        return preferences

    def _infer_notification_preferences(
        self, behaviors: list[UserBehaviorEvent]
    ) -> list[NotificationPreference]:
        """Infer notification preferences from activity patterns."""
        # Analyze activity by hour
        activity_by_hour = [0] * 24
        for behavior in behaviors:
            hour = datetime.fromtimestamp(behavior.timestamp / 1000).hour
            activity_by_hour[hour] += 1

        # Find active hours
        avg_activity = sum(activity_by_hour) / 24 if any(activity_by_hour) else 0
        active_hours = [h for h, count in enumerate(activity_by_hour) if count > avg_activity * 0.5]

        # Default preferences
        preferences = [
            NotificationPreference(
                channel="dashboard",
                enabled=True,
                frequency="realtime",
            )
        ]

        # If activity is concentrated, suggest email summary
        if len(active_hours) < 12:
            preferences.append(
                NotificationPreference(
                    channel="email",
                    enabled=True,
                    frequency="daily",
                )
            )

        return preferences

    def _calculate_confidence(self, behaviors: list[UserBehaviorEvent]) -> float:
        """Calculate confidence score for learned preferences."""
        # Factor 1: Data point count (30% weight)
        data_point_score = min(len(behaviors) / 100, 1.0) * 0.3

        # Factor 2: Data diversity (30% weight)
        unique_features = len(set(b.feature for b in behaviors if b.feature))
        diversity_score = min(unique_features / 20, 1.0) * 0.3

        # Factor 3: Time range (20% weight)
        if behaviors:
            timestamps = [b.timestamp for b in behaviors]
            time_range = max(timestamps) - min(timestamps)
            seven_days = 7 * 24 * 60 * 60 * 1000
            time_range_score = min(time_range / seven_days, 1.0) * 0.2
        else:
            time_range_score = 0

        # Factor 4: Recency (20% weight)
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        seven_days_ago = now - (7 * 24 * 60 * 60 * 1000)
        recent_behaviors = [b for b in behaviors if b.timestamp > seven_days_ago]
        recency_score = (len(recent_behaviors) / len(behaviors) if behaviors else 0) * 0.2

        return data_point_score + diversity_score + time_range_score + recency_score

    async def _flush_behavior_buffer(self) -> None:
        """Flush all buffered behaviors to database."""
        for user_id in list(self._behavior_buffer.keys()):
            await self._flush_user_behaviors(user_id)

    async def _flush_user_behaviors(self, user_id: str) -> None:
        """Flush behaviors for a specific user to database."""
        behaviors = self._behavior_buffer.get(user_id, [])
        if not behaviors:
            return

        for behavior in behaviors:
            await self._db.execute(
                """
                INSERT INTO user_behaviors (
                    id, user_id, type, feature, workflow, duration,
                    satisfaction, metadata, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    behavior.user_id,
                    behavior.type.value,
                    behavior.feature,
                    behavior.workflow,
                    behavior.duration,
                    behavior.satisfaction,
                    json.dumps(behavior.metadata) if behavior.metadata else None,
                    behavior.timestamp,
                ),
            )

        await self._db.commit()

        # Clear buffer
        self._behavior_buffer[user_id] = []

    async def _get_active_users(self) -> list[str]:
        """Get list of users with recent activity."""
        expiration_time = int(datetime.now(timezone.utc).timestamp() * 1000) - self._config.data_expiration

        rows = await self._db.fetch_all(
            "SELECT DISTINCT user_id FROM user_behaviors WHERE timestamp > ?",
            (expiration_time,),
        )

        return [row["user_id"] for row in rows]

    async def _get_user_behaviors(self, user_id: str) -> list[UserBehaviorEvent]:
        """Get behaviors for a user."""
        expiration_time = int(datetime.now(timezone.utc).timestamp() * 1000) - self._config.data_expiration

        rows = await self._db.fetch_all(
            """
            SELECT * FROM user_behaviors
            WHERE user_id = ? AND timestamp > ?
            ORDER BY timestamp DESC
            """,
            (user_id, expiration_time),
        )

        return [
            UserBehaviorEvent(
                type=UserBehaviorType(row["type"]),
                user_id=row["user_id"],
                feature=row.get("feature"),
                workflow=row.get("workflow"),
                duration=row.get("duration"),
                satisfaction=row.get("satisfaction"),
                metadata=json.loads(row["metadata"]) if row.get("metadata") else None,
                timestamp=row["timestamp"],
            )
            for row in rows
        ]

    async def _save_user_preference(self, preference: UserPreference) -> None:
        """Save user preference to database."""
        now = int(datetime.now(timezone.utc).timestamp() * 1000)

        await self._db.execute(
            """
            INSERT OR REPLACE INTO user_preferences (
                user_id, preferred_features, workflow_patterns,
                ui_preferences, notification_preferences,
                learned_at, confidence, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                preference.user_id,
                json.dumps([f.model_dump() for f in preference.preferred_features]),
                json.dumps([w.model_dump() for w in preference.workflow_patterns]),
                json.dumps(preference.ui_preferences.model_dump()),
                json.dumps([n.model_dump() for n in preference.notification_preferences]),
                preference.learned_at,
                preference.confidence,
                now,
            ),
        )
        await self._db.commit()

    async def _cleanup_expired_data(self) -> None:
        """Clean up expired behavior data."""
        expiration_time = int(datetime.now(timezone.utc).timestamp() * 1000) - self._config.data_expiration

        cursor = await self._db.execute(
            "DELETE FROM user_behaviors WHERE timestamp < ?",
            (expiration_time,),
        )
        await self._db.commit()

        if cursor.rowcount > 0:
            logger.info("Cleaned up expired behavior data", {"deleted": cursor.rowcount})

    def _analyze_patterns(self, behaviors: list[UserBehaviorEvent]) -> dict[str, Any]:
        """
        Analyze patterns in user behavior.

        Returns dictionary with pattern analysis results.
        """
        patterns: dict[str, Any] = {
            "time_of_day": {},
            "day_of_week": {},
            "session_lengths": [],
            "feature_sequences": [],
        }

        # Time of day patterns
        for behavior in behaviors:
            hour = datetime.fromtimestamp(behavior.timestamp / 1000).hour
            patterns["time_of_day"][hour] = patterns["time_of_day"].get(hour, 0) + 1

        # Day of week patterns
        for behavior in behaviors:
            day = datetime.fromtimestamp(behavior.timestamp / 1000).weekday()
            patterns["day_of_week"][day] = patterns["day_of_week"].get(day, 0) + 1

        return patterns

    def _extract_preferences(
        self, patterns: dict[str, Any], behaviors: list[UserBehaviorEvent]
    ) -> dict[str, Any]:
        """
        Extract preferences from analyzed patterns.

        Returns dictionary with extracted preferences.
        """
        preferences: dict[str, Any] = {}

        # Peak usage hours
        time_patterns = patterns.get("time_of_day", {})
        if time_patterns:
            peak_hours = sorted(time_patterns.items(), key=lambda x: x[1], reverse=True)[:3]
            preferences["peak_hours"] = [h for h, _ in peak_hours]

        # Preferred day of week
        day_patterns = patterns.get("day_of_week", {})
        if day_patterns:
            preferred_days = sorted(day_patterns.items(), key=lambda x: x[1], reverse=True)[:3]
            preferences["preferred_days"] = [d for d, _ in preferred_days]

        return preferences
