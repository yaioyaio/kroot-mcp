"""
DevFlow Monitor - Feedback System.

Provides user feedback collection, analysis, A/B testing,
and preference learning capabilities.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from ..storage.database import DatabaseManager
from ..utils.logger import Logger
from .ab_test_manager import ABTestManager, ABTestManagerConfig
from .analyzer import FeedbackAnalyzer, FeedbackAnalyzerConfig
from .collector import FeedbackCollector, FeedbackCollectorConfig, FeedbackSubmitOptions
from .preference_learner import PreferenceLearner, PreferenceLearnerConfig
from .types import (
    ABMetricType,
    ABTestAudience,
    ABTestConfig,
    ABTestMetric,
    ABTestResult,
    ABTestStatus,
    ABTestVariant,
    ABTestWinner,
    Feedback,
    FeedbackAnalysis,
    FeedbackEvent,
    FeedbackEventType,
    FeedbackFilter,
    FeedbackPriority,
    FeedbackSource,
    FeedbackStats,
    FeedbackStatus,
    FeedbackType,
    ImprovementSuggestion,
    ImprovementStatus,
    MetricEvent,
    UserBehaviorEvent,
    UserPreference,
)

logger = Logger("FeedbackSystem")


@dataclass
class FeedbackSystemConfig:
    """Configuration for the feedback system."""

    auto_analyze: bool = True
    enable_preference_learning: bool = True
    enable_ab_testing: bool = True
    collector_config: FeedbackCollectorConfig | None = None
    analyzer_config: FeedbackAnalyzerConfig | None = None
    preference_learner_config: PreferenceLearnerConfig | None = None
    ab_test_config: ABTestManagerConfig | None = None


@dataclass
class ImprovementSuggestionSummary:
    """Summary of an improvement suggestion for external use."""

    id: str
    title: str
    description: str
    type: str
    impact_users: int
    impact_severity: str
    status: str
    feedback_count: int


class FeedbackSystem:
    """
    Integrated feedback system combining collection, analysis, A/B testing,
    and preference learning.

    Example:
        async with DatabaseManager() as db:
            feedback_system = FeedbackSystem(db)
            await feedback_system.initialize()
            await feedback_system.start()

            # Submit feedback
            feedback = await feedback_system.submit_feedback(
                FeedbackSubmitOptions(
                    type=FeedbackType.BUG_REPORT,
                    title="Issue with login",
                    description="Cannot login after update"
                )
            )

            # Get improvement suggestions
            suggestions = await feedback_system.get_improvement_suggestions()
    """

    def __init__(
        self,
        database: DatabaseManager,
        config: FeedbackSystemConfig | None = None,
    ) -> None:
        """
        Initialize the feedback system.

        Args:
            database: Database manager instance.
            config: System configuration.
        """
        self._db = database
        self._config = config or FeedbackSystemConfig()
        self._event_handlers: dict[str, list[Callable]] = {}

        # Initialize components
        self._collector = FeedbackCollector(
            database,
            self._config.collector_config,
        )

        self._analyzer = FeedbackAnalyzer(
            database,
            self._config.analyzer_config,
        )

        self._preference_learner: PreferenceLearner | None = None
        if self._config.enable_preference_learning:
            self._preference_learner = PreferenceLearner(
                database,
                self._config.preference_learner_config,
            )

        self._ab_test_manager: ABTestManager | None = None
        if self._config.enable_ab_testing:
            self._ab_test_manager = ABTestManager(
                database,
                self._config.ab_test_config,
            )

    async def initialize(self) -> None:
        """Initialize all system components."""
        await self._collector.initialize()
        await self._analyzer.initialize()

        if self._preference_learner:
            await self._preference_learner.initialize()

        if self._ab_test_manager:
            await self._ab_test_manager.initialize()

        self._setup_event_handlers()
        logger.info("Feedback system initialized")

    async def start(self) -> None:
        """Start the feedback system."""
        logger.info("Starting feedback system")

        if self._preference_learner:
            self._preference_learner.start()

        if self._ab_test_manager:
            await self._ab_test_manager.start()

        logger.info("Feedback system started")

    def stop(self) -> None:
        """Stop the feedback system."""
        logger.info("Stopping feedback system")

        if self._preference_learner:
            self._preference_learner.stop()

        if self._ab_test_manager:
            self._ab_test_manager.stop()

        logger.info("Feedback system stopped")

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

    def _setup_event_handlers(self) -> None:
        """Set up internal event handlers."""
        # Auto-analyze on feedback submission
        async def on_feedback_submitted(event: FeedbackEvent) -> None:
            if self._config.auto_analyze and event.feedback_id:
                try:
                    feedback = await self._collector.get_feedback(event.feedback_id)
                    if feedback:
                        await self._analyzer.analyze(feedback)
                except Exception as e:
                    logger.error(f"Failed to auto-analyze feedback: {e}")

            self._emit("feedback_submitted", event)

        self._collector.on("feedback_submitted", lambda e: on_feedback_submitted(e))

        # Forward analyzer events
        self._analyzer.on(
            "feedback_analyzed",
            lambda e: self._emit("feedback_analyzed", e),
        )
        self._analyzer.on(
            "improvement_suggested",
            lambda e: self._emit("improvement_suggested", e),
        )

        # Forward preference learner events
        if self._preference_learner:
            self._preference_learner.on(
                "preference_learned",
                lambda e: self._emit("preference_learned", e),
            )

        # Forward A/B test manager events
        if self._ab_test_manager:
            self._ab_test_manager.on(
                "test_started",
                lambda e: self._emit("ab_test_started", e),
            )
            self._ab_test_manager.on(
                "test_completed",
                lambda e: self._emit("ab_test_completed", e),
            )

    # Feedback methods

    async def submit_feedback(self, options: FeedbackSubmitOptions) -> Feedback:
        """Submit new feedback."""
        return await self._collector.submit(options)

    async def get_feedback(self, feedback_id: str) -> Feedback | None:
        """Get feedback by ID."""
        return await self._collector.get_feedback(feedback_id)

    async def list_feedback(
        self,
        filters: FeedbackFilter | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Feedback]:
        """List feedbacks with optional filters."""
        return await self._collector.list_feedbacks(filters, limit, offset)

    async def update_feedback_status(
        self, feedback_id: str, status: FeedbackStatus
    ) -> Feedback | None:
        """Update feedback status."""
        return await self._collector.update_status(feedback_id, status)

    async def update_feedback_priority(
        self, feedback_id: str, priority: FeedbackPriority
    ) -> Feedback | None:
        """Update feedback priority."""
        return await self._collector.update_priority(feedback_id, priority)

    async def get_feedback_stats(self, project_id: str | None = None) -> FeedbackStats:
        """Get feedback statistics."""
        return await self._collector.get_stats(project_id)

    # Analysis methods

    async def analyze_feedback(self, feedback_id: str) -> FeedbackAnalysis | None:
        """Analyze a specific feedback."""
        feedback = await self._collector.get_feedback(feedback_id)
        if feedback:
            return await self._analyzer.analyze(feedback)
        return None

    async def get_feedback_analysis(self, feedback_id: str) -> FeedbackAnalysis | None:
        """Get existing analysis for a feedback."""
        return await self._analyzer.get_analysis(feedback_id)

    async def get_improvement_suggestions(
        self, status: ImprovementStatus | None = None
    ) -> list[ImprovementSuggestion]:
        """Get improvement suggestions."""
        return await self._analyzer.list_improvement_suggestions(status)

    # User behavior and preferences

    async def record_user_behavior(self, event: UserBehaviorEvent) -> None:
        """Record a user behavior event."""
        if self._preference_learner:
            await self._preference_learner.record_behavior(event)

    async def get_user_preferences(self, user_id: str) -> UserPreference | None:
        """Get learned preferences for a user."""
        if self._preference_learner:
            return await self._preference_learner.get_preferences(user_id)
        return None

    # A/B testing methods

    async def create_ab_test(self, config: ABTestConfig) -> ABTestConfig:
        """Create a new A/B test."""
        if not self._ab_test_manager:
            raise RuntimeError("A/B testing is not enabled")
        return await self._ab_test_manager.create_test(config)

    async def start_ab_test(self, test_id: str) -> bool:
        """Start an A/B test."""
        if not self._ab_test_manager:
            raise RuntimeError("A/B testing is not enabled")
        return await self._ab_test_manager.start_test(test_id)

    async def pause_ab_test(self, test_id: str) -> bool:
        """Pause an A/B test."""
        if not self._ab_test_manager:
            raise RuntimeError("A/B testing is not enabled")
        return await self._ab_test_manager.pause_test(test_id)

    async def complete_ab_test(self, test_id: str) -> ABTestResult:
        """Complete an A/B test."""
        if not self._ab_test_manager:
            raise RuntimeError("A/B testing is not enabled")
        return await self._ab_test_manager.complete_test(test_id)

    async def assign_ab_test_variant(self, test_id: str, user_id: str) -> str:
        """Assign a user to an A/B test variant."""
        if not self._ab_test_manager:
            raise RuntimeError("A/B testing is not enabled")
        return await self._ab_test_manager.assign_variant(test_id, user_id)

    async def record_ab_test_metric(self, event: MetricEvent) -> None:
        """Record an A/B test metric event."""
        if not self._ab_test_manager:
            raise RuntimeError("A/B testing is not enabled")
        await self._ab_test_manager.record_metric(event)

    async def get_ab_test_results(self, test_id: str) -> ABTestResult:
        """Get A/B test results."""
        if not self._ab_test_manager:
            raise RuntimeError("A/B testing is not enabled")
        return await self._ab_test_manager.get_results(test_id)

    async def list_active_ab_tests(self) -> list[ABTestConfig]:
        """List active A/B tests."""
        if not self._ab_test_manager:
            return []
        return await self._ab_test_manager.list_active_tests()

    # Helper methods

    async def submit_bug_report(
        self,
        title: str,
        description: str,
        project_id: str | None = None,
        submitter_id: str | None = None,
        submitter_email: str | None = None,
        submitter_name: str | None = None,
    ) -> Feedback:
        """Quick helper to submit a bug report."""
        from .types import Submitter

        return await self.submit_feedback(
            FeedbackSubmitOptions(
                type=FeedbackType.BUG_REPORT,
                title=title,
                description=description,
                project_id=project_id,
                submitter=Submitter(
                    id=submitter_id,
                    email=submitter_email,
                    name=submitter_name,
                ),
            )
        )

    async def submit_feature_request(
        self,
        title: str,
        description: str,
        project_id: str | None = None,
        submitter_id: str | None = None,
        submitter_email: str | None = None,
        submitter_name: str | None = None,
    ) -> Feedback:
        """Quick helper to submit a feature request."""
        from .types import Submitter

        return await self.submit_feedback(
            FeedbackSubmitOptions(
                type=FeedbackType.FEATURE_REQUEST,
                title=title,
                description=description,
                project_id=project_id,
                submitter=Submitter(
                    id=submitter_id,
                    email=submitter_email,
                    name=submitter_name,
                ),
            )
        )

    async def submit_usability_issue(
        self,
        title: str,
        description: str,
        project_id: str | None = None,
        submitter_id: str | None = None,
        submitter_email: str | None = None,
        submitter_name: str | None = None,
    ) -> Feedback:
        """Quick helper to submit a usability issue."""
        from .types import Submitter

        return await self.submit_feedback(
            FeedbackSubmitOptions(
                type=FeedbackType.USABILITY_ISSUE,
                title=title,
                description=description,
                project_id=project_id,
                submitter=Submitter(
                    id=submitter_id,
                    email=submitter_email,
                    name=submitter_name,
                ),
            )
        )


# Export all public types and classes
__all__ = [
    # Main system
    "FeedbackSystem",
    "FeedbackSystemConfig",
    # Components
    "FeedbackCollector",
    "FeedbackCollectorConfig",
    "FeedbackSubmitOptions",
    "FeedbackAnalyzer",
    "FeedbackAnalyzerConfig",
    "ABTestManager",
    "ABTestManagerConfig",
    "PreferenceLearner",
    "PreferenceLearnerConfig",
    # Types - Enums
    "FeedbackType",
    "FeedbackStatus",
    "FeedbackPriority",
    "FeedbackSource",
    "FeedbackEventType",
    "ABMetricType",
    "ABTestStatus",
    "ImprovementStatus",
    # Types - Models
    "Feedback",
    "FeedbackAnalysis",
    "FeedbackFilter",
    "FeedbackStats",
    "FeedbackEvent",
    "ImprovementSuggestion",
    "UserPreference",
    "UserBehaviorEvent",
    "ABTestAudience",
    "ABTestConfig",
    "ABTestMetric",
    "ABTestVariant",
    "ABTestWinner",
    "ABTestResult",
    "MetricEvent",
]
