"""
Development Stage Analyzer.

Automatically detects and tracks the 13 development stages and
11 coding sub-stages in the software development process.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Callable

from ..events.engine import EventEngine, get_event_engine
from ..events.types.base import BaseEvent, EventCategory
from ..events.types.file import FileChangeAction, FileEvent, is_file_event
from ..events.types.git import GitEvent, is_git_event
from .types.stage import (
    STAGE_DESCRIPTIONS,
    STAGE_ORDER,
    CodingSubStage,
    DevelopmentStage,
    StageActivity,
    StageActivityIndicator,
    StageAnalysisResult,
    StageDetectionRule,
    StagePattern,
    StageTransition,
)


class StageAnalyzerConfig:
    """Stage analyzer configuration."""

    def __init__(
        self,
        confidence_threshold: float = 0.6,
        transition_cooldown: int = 5000,  # milliseconds
        history_size: int = 100,
        event_engine: EventEngine | None = None,
    ):
        """
        Initialize configuration.

        Args:
            confidence_threshold: Minimum confidence for stage detection.
            transition_cooldown: Cooldown between transitions in ms.
            history_size: Maximum transition history size.
            event_engine: Event engine instance.
        """
        self.confidence_threshold = confidence_threshold
        self.transition_cooldown = transition_cooldown
        self.history_size = history_size
        self.event_engine = event_engine or get_event_engine()


class StageAnalyzer:
    """
    Development stage analyzer.

    Automatically detects the current development stage based on
    file changes, git activity, and other events.

    Attributes:
        config: Analyzer configuration.
    """

    def __init__(self, config: StageAnalyzerConfig | None = None):
        """
        Initialize the stage analyzer.

        Args:
            config: Optional configuration.
        """
        self.config = config or StageAnalyzerConfig()
        self._current_stage: DevelopmentStage | None = None
        self._current_sub_stages: set[CodingSubStage] = set()
        self._stage_activities: dict[DevelopmentStage, list[StageActivity]] = {}
        self._recent_transitions: list[StageTransition] = []
        self._detection_rules: dict[DevelopmentStage, StageDetectionRule] = {}
        self._last_transition_time: datetime | None = None
        self._listeners: dict[str, list[Callable]] = {}
        self._subscription_id: str | None = None

        self._initialize_detection_rules()

    def start(self) -> None:
        """Start the stage analyzer and subscribe to events."""
        self._subscription_id = self.config.event_engine.subscribe(
            "*",
            self._handle_event,
        )

    def stop(self) -> None:
        """Stop the stage analyzer."""
        if self._subscription_id:
            self.config.event_engine.unsubscribe(self._subscription_id)
            self._subscription_id = None

    def on(self, event_type: str, handler: Callable) -> None:
        """Register an event listener."""
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(handler)

    def emit(self, event_type: str, *args: Any) -> None:
        """Emit an event to listeners."""
        if event_type in self._listeners:
            for handler in self._listeners[event_type]:
                try:
                    handler(*args)
                except Exception:
                    pass

    async def _handle_event(self, event: BaseEvent) -> None:
        """Handle incoming events."""
        if is_file_event(event):
            self._handle_file_event(event)
        elif is_git_event(event):
            self._handle_git_event(event)

    def _initialize_detection_rules(self) -> None:
        """Initialize stage detection rules."""
        # PRD stage
        self._detection_rules[DevelopmentStage.PRD] = StageDetectionRule(
            stage=DevelopmentStage.PRD,
            patterns=[
                StagePattern(
                    type="file",
                    pattern=r"/(PRD|prd)\.(md|txt|docx?)$",
                    weight=0.8,
                ),
                StagePattern(
                    type="content",
                    pattern=r"product\s+requirements?\s+document",
                    weight=0.6,
                ),
                StagePattern(
                    type="file",
                    pattern=r"requirements?\.(md|txt)$",
                    weight=0.5,
                ),
            ],
            required_confidence=0.7,
        )

        # Planning stage
        self._detection_rules[DevelopmentStage.PLANNING] = StageDetectionRule(
            stage=DevelopmentStage.PLANNING,
            patterns=[
                StagePattern(
                    type="file",
                    pattern=r"planning\.(md|txt|docx?)$",
                    weight=0.8,
                ),
                StagePattern(
                    type="file",
                    pattern=r"기획서\.(md|txt|docx?)$",
                    weight=0.8,
                ),
            ],
            required_confidence=0.7,
        )

        # ERD stage
        self._detection_rules[DevelopmentStage.ERD] = StageDetectionRule(
            stage=DevelopmentStage.ERD,
            patterns=[
                StagePattern(
                    type="file",
                    pattern=r"\.(erd|erdx|sql|ddl)$",
                    weight=0.8,
                ),
                StagePattern(
                    type="file",
                    pattern=r"schema\.(sql|json|yml)$",
                    weight=0.7,
                ),
                StagePattern(
                    type="content",
                    pattern=r"CREATE\s+TABLE|FOREIGN\s+KEY",
                    weight=0.6,
                ),
            ],
            required_confidence=0.6,
        )

        # Wireframe stage
        self._detection_rules[DevelopmentStage.WIREFRAME] = StageDetectionRule(
            stage=DevelopmentStage.WIREFRAME,
            patterns=[
                StagePattern(
                    type="file",
                    pattern=r"\.(fig|sketch|xd|wireframe)$",
                    weight=0.9,
                ),
                StagePattern(
                    type="file",
                    pattern=r"wireframe",
                    weight=0.7,
                ),
            ],
            required_confidence=0.7,
        )

        # Screen design stage
        self._detection_rules[DevelopmentStage.SCREEN_DESIGN] = StageDetectionRule(
            stage=DevelopmentStage.SCREEN_DESIGN,
            patterns=[
                StagePattern(
                    type="file",
                    pattern=r"screen[-_]?design|화면[-_]?기획",
                    weight=0.8,
                ),
                StagePattern(
                    type="file",
                    pattern=r"UI[-_]?spec|screen[-_]?spec",
                    weight=0.7,
                ),
            ],
            required_confidence=0.6,
        )

        # Design stage
        self._detection_rules[DevelopmentStage.DESIGN] = StageDetectionRule(
            stage=DevelopmentStage.DESIGN,
            patterns=[
                StagePattern(
                    type="file",
                    pattern=r"\.(psd|ai|fig|sketch|xd)$",
                    weight=0.9,
                ),
                StagePattern(
                    type="file",
                    pattern=r"design|mockup",
                    weight=0.6,
                ),
            ],
            required_confidence=0.6,
        )

        # Frontend stage
        self._detection_rules[DevelopmentStage.FRONTEND] = StageDetectionRule(
            stage=DevelopmentStage.FRONTEND,
            patterns=[
                StagePattern(
                    type="file",
                    pattern=r"\.(jsx?|tsx?|vue|svelte)$",
                    weight=0.8,
                ),
                StagePattern(
                    type="file",
                    pattern=r"/(components?|pages?|views?)/",
                    weight=0.7,
                ),
                StagePattern(
                    type="content",
                    pattern=r"import\s+React|Vue\.component|Angular",
                    weight=0.6,
                ),
            ],
            required_confidence=0.6,
        )

        # Backend stage
        self._detection_rules[DevelopmentStage.BACKEND] = StageDetectionRule(
            stage=DevelopmentStage.BACKEND,
            patterns=[
                StagePattern(
                    type="file",
                    pattern=r"/(api|server|backend|controllers?|models?|services?)/",
                    weight=0.8,
                ),
                StagePattern(
                    type="file",
                    pattern=r"\.(py|java|go|rs|rb|php)$",
                    weight=0.6,
                ),
                StagePattern(
                    type="content",
                    pattern=r"app\.(get|post|put|delete)|@RestController|router\.",
                    weight=0.7,
                ),
            ],
            required_confidence=0.6,
        )

        # AI collaboration stage
        self._detection_rules[DevelopmentStage.AI_COLLABORATION] = StageDetectionRule(
            stage=DevelopmentStage.AI_COLLABORATION,
            patterns=[
                StagePattern(
                    type="content",
                    pattern=r"claude|copilot|chatgpt|ai[-_]?prompt",
                    weight=0.8,
                ),
                StagePattern(
                    type="file",
                    pattern=r"prompt|claude|copilot",
                    weight=0.7,
                ),
            ],
            required_confidence=0.6,
        )

        # Coding stage
        self._detection_rules[DevelopmentStage.CODING] = StageDetectionRule(
            stage=DevelopmentStage.CODING,
            patterns=[
                StagePattern(
                    type="file",
                    pattern=r"\.(js|ts|py|java|go|rs|rb|php|cs|cpp|c)$",
                    weight=0.5,
                ),
                StagePattern(
                    type="git",
                    pattern=r"feat:|fix:|refactor:",
                    weight=0.7,
                ),
            ],
            required_confidence=0.5,
        )

        # Git management stage
        self._detection_rules[DevelopmentStage.GIT_MANAGEMENT] = StageDetectionRule(
            stage=DevelopmentStage.GIT_MANAGEMENT,
            patterns=[
                StagePattern(
                    type="git",
                    pattern=r"merge|branch|commit|push|pull",
                    weight=0.8,
                ),
                StagePattern(
                    type="file",
                    pattern=r"\.git/",
                    weight=0.5,
                ),
            ],
            required_confidence=0.6,
        )

        # Deployment stage
        self._detection_rules[DevelopmentStage.DEPLOYMENT] = StageDetectionRule(
            stage=DevelopmentStage.DEPLOYMENT,
            patterns=[
                StagePattern(
                    type="file",
                    pattern=r"Dockerfile|docker-compose",
                    weight=0.8,
                ),
                StagePattern(
                    type="file",
                    pattern=r"\.github/workflows",
                    weight=0.8,
                ),
                StagePattern(
                    type="git",
                    pattern=r"release:|deploy:",
                    weight=0.8,
                ),
            ],
            required_confidence=0.7,
        )

        # Operation stage
        self._detection_rules[DevelopmentStage.OPERATION] = StageDetectionRule(
            stage=DevelopmentStage.OPERATION,
            patterns=[
                StagePattern(
                    type="file",
                    pattern=r"monitoring|metrics|logs",
                    weight=0.7,
                ),
                StagePattern(
                    type="git",
                    pattern=r"hotfix:|patch:",
                    weight=0.8,
                ),
            ],
            required_confidence=0.7,
        )

    def _handle_file_event(self, event: BaseEvent) -> None:
        """Handle file events."""
        data = event.data
        action = data.get("action")
        if action not in (FileChangeAction.ADD.value, FileChangeAction.CHANGE.value):
            return

        new_file = data.get("new_file", {})
        file_path = new_file.get("path", "")
        if not file_path:
            return

        indicators: list[StageActivityIndicator] = []

        for stage, rule in self._detection_rules.items():
            confidence = 0.0

            for pattern in rule.patterns:
                if pattern.type == "file":
                    regex = re.compile(pattern.pattern, re.IGNORECASE)
                    if regex.search(file_path):
                        confidence += pattern.weight
                        indicators.append(
                            StageActivityIndicator(
                                type="file_pattern",
                                value=file_path,
                                source="file_event",
                            )
                        )

            if confidence >= rule.required_confidence:
                self._detect_stage(stage, confidence, indicators)

        self._detect_coding_sub_stage(event)

    def _handle_git_event(self, event: BaseEvent) -> None:
        """Handle git events."""
        data = event.data
        indicators: list[StageActivityIndicator] = []

        for stage, rule in self._detection_rules.items():
            confidence = 0.0

            for pattern in rule.patterns:
                if pattern.type == "git":
                    regex = re.compile(pattern.pattern, re.IGNORECASE)

                    # Check commit message
                    commit = data.get("commit", {})
                    message = commit.get("message", "")
                    if message and regex.search(message):
                        confidence += pattern.weight
                        indicators.append(
                            StageActivityIndicator(
                                type="git_commit",
                                value=message,
                                source="git_event",
                            )
                        )

                    # Check event type
                    if regex.search(event.type):
                        confidence += pattern.weight * 0.5

            if confidence >= rule.required_confidence:
                self._detect_stage(stage, confidence, indicators)

        self._detect_coding_sub_stage(event)

    def _detect_stage(
        self,
        stage: DevelopmentStage,
        confidence: float,
        indicators: list[StageActivityIndicator],
    ) -> None:
        """Detect and transition to a new stage."""
        now = datetime.utcnow()

        # Check cooldown
        if self._last_transition_time:
            cooldown_ms = self.config.transition_cooldown
            elapsed = (now - self._last_transition_time).total_seconds() * 1000
            if elapsed < cooldown_ms:
                return

        # Check confidence threshold
        if confidence < self.config.confidence_threshold:
            return

        # Transition if stage changed
        if self._current_stage != stage:
            transition = StageTransition(
                from_stage=self._current_stage,
                to_stage=stage,
                timestamp=now,
                confidence=confidence,
                reason=f"Detected {len(indicators)} indicators with confidence {confidence:.2f}",
            )

            self._current_stage = stage
            self._last_transition_time = now
            self._recent_transitions.append(transition)

            # Limit history size
            if len(self._recent_transitions) > self.config.history_size:
                self._recent_transitions.pop(0)

            # Emit events
            self.emit("stage:transition", transition)
            self.emit("stage:detected", stage, confidence)

        # Record activity
        self._record_activity(stage, indicators, confidence)

    def _record_activity(
        self,
        stage: DevelopmentStage,
        indicators: list[StageActivityIndicator],
        confidence: float,
    ) -> None:
        """Record stage activity."""
        if stage not in self._stage_activities:
            self._stage_activities[stage] = []

        activities = self._stage_activities[stage]
        now = datetime.utcnow()

        # Check if we should extend existing activity
        if activities:
            current = activities[-1]
            if current.end_time is None:
                elapsed = (now - current.start_time).total_seconds() * 1000
                if elapsed < 3600000:  # 1 hour
                    current.activities.extend(indicators)
                    current.confidence = max(current.confidence, confidence)
                    return

        # Create new activity
        activities.append(
            StageActivity(
                stage=stage,
                start_time=now,
                activities=indicators,
                confidence=confidence,
            )
        )

    def _detect_coding_sub_stage(self, event: BaseEvent) -> None:
        """Detect coding sub-stages."""
        if self._current_stage not in (
            DevelopmentStage.AI_COLLABORATION,
            DevelopmentStage.CODING,
        ):
            return

        sub_stage = self._identify_coding_sub_stage(event)
        if sub_stage and sub_stage not in self._current_sub_stages:
            self._current_sub_stages.add(sub_stage)
            self.emit("substage:detected", sub_stage)

    def _identify_coding_sub_stage(self, event: BaseEvent) -> CodingSubStage | None:
        """Identify the coding sub-stage from an event."""
        content = self._get_event_content(event)
        if not content:
            return None

        patterns: dict[CodingSubStage, list[str]] = {
            CodingSubStage.USE_CASE: [
                r"use[-_]?case",
                r"user[-_]?story",
                r"scenario",
                r"requirement",
            ],
            CodingSubStage.EVENT_STORMING: [
                r"event[-_]?storm",
                r"domain[-_]?event",
                r"aggregate",
                r"bounded[-_]?context",
            ],
            CodingSubStage.DOMAIN_MODELING: [
                r"domain[-_]?model",
                r"entity",
                r"value[-_]?object",
                r"repository",
            ],
            CodingSubStage.USE_CASE_DETAIL: [
                r"detail[-_]?design",
                r"sequence[-_]?diagram",
                r"flow[-_]?chart",
            ],
            CodingSubStage.AI_PROMPT_DESIGN: [
                r"ai[-_]?prompt",
                r"claude[-_]?prompt",
                r"gpt[-_]?prompt",
                r"prompt[-_]?engineering",
            ],
            CodingSubStage.INITIAL_IMPLEMENTATION: [
                r"scaffold",
                r"skeleton",
                r"boilerplate",
                r"initial[-_]?impl",
            ],
            CodingSubStage.BUSINESS_LOGIC: [
                r"business[-_]?logic",
                r"service[-_]?impl",
                r"controller",
                r"handler",
            ],
            CodingSubStage.REFACTORING: [
                r"refactor",
                r"cleanup",
                r"optimize",
                r"improve",
            ],
            CodingSubStage.UNIT_TEST: [
                r"unit[-_]?test",
                r"\.test\.[jt]sx?$",
                r"\.spec\.[jt]sx?$",
                r"describe\(",
            ],
            CodingSubStage.INTEGRATION_TEST: [
                r"integration[-_]?test",
                r"api[-_]?test",
            ],
            CodingSubStage.E2E_TEST: [
                r"e2e[-_]?test",
                r"end[-_]?to[-_]?end",
                r"cypress",
                r"playwright",
            ],
        }

        for sub_stage, stage_patterns in patterns.items():
            for pattern in stage_patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    return sub_stage

        return None

    def _get_event_content(self, event: BaseEvent) -> str | None:
        """Extract searchable content from an event."""
        if event.category == EventCategory.FILE:
            data = event.data
            new_file = data.get("new_file", {})
            path = new_file.get("path", "")
            context_type = data.get("context", {}).get("type", "")
            return f"{path} {context_type}"

        if event.category == EventCategory.GIT:
            commit = event.data.get("commit", {})
            message = commit.get("message", "")
            if message:
                return message
            branch = event.data.get("branch", {})
            name = branch.get("name", "")
            return name

        return None

    def analyze(self) -> StageAnalysisResult:
        """
        Analyze current development stage.

        Returns:
            Complete stage analysis result.
        """
        stage_progress = self._calculate_stage_progress()
        suggestions = self._generate_suggestions()

        result = StageAnalysisResult(
            current_stage=self._current_stage or DevelopmentStage.PRD,
            confidence=self._get_current_confidence(),
            active_sub_stages=list(self._current_sub_stages),
            recent_transitions=self._recent_transitions,
            stage_progress=stage_progress,
            suggestions=suggestions,
        )

        self.emit("analysis:complete", result)
        return result

    def _calculate_stage_progress(self) -> dict[DevelopmentStage, int]:
        """Calculate progress for each stage."""
        progress: dict[DevelopmentStage, int] = {}

        for stage in STAGE_ORDER:
            activities = self._stage_activities.get(stage, [])
            if not activities:
                progress[stage] = 0
                continue

            avg_confidence = sum(a.confidence for a in activities) / len(activities)
            activity_score = min(len(activities) / 10, 1.0)

            progress[stage] = round((avg_confidence * 0.7 + activity_score * 0.3) * 100)

        return progress

    def _get_current_confidence(self) -> float:
        """Get confidence for current stage."""
        if not self._current_stage:
            return 0.0

        activities = self._stage_activities.get(self._current_stage, [])
        if not activities:
            return 0.0

        return sum(a.confidence for a in activities) / len(activities)

    def _generate_suggestions(self) -> list[str]:
        """Generate suggestions based on current state."""
        suggestions: list[str] = []

        if not self._current_stage:
            suggestions.append("Start the project by writing a PRD document.")
            return suggestions

        current_index = STAGE_ORDER.index(self._current_stage)

        # Suggest next stage
        if current_index < len(STAGE_ORDER) - 1:
            next_stage = STAGE_ORDER[current_index + 1]
            description = STAGE_DESCRIPTIONS.get(next_stage, str(next_stage))
            suggestions.append(f"Next stage: {description}")

        # Suggest completing current stage
        progress = self._calculate_stage_progress()
        current_progress = progress.get(self._current_stage, 0)
        if current_progress < 80:
            description = STAGE_DESCRIPTIONS.get(
                self._current_stage, str(self._current_stage)
            )
            suggestions.append(
                f"Complete the current {description} stage. (Progress: {current_progress}%)"
            )

        return suggestions

    def get_current_stage(self, project_id: str | None = None) -> DevelopmentStage:
        """Get the current development stage."""
        return self._current_stage or DevelopmentStage.PRD

    def get_coding_sub_stage_progress(self) -> dict[CodingSubStage, int]:
        """Get progress for each coding sub-stage."""
        progress: dict[CodingSubStage, int] = {}
        for sub_stage in CodingSubStage:
            progress[sub_stage] = 100 if sub_stage in self._current_sub_stages else 0
        return progress

    def get_transition_history(self, limit: int = 10) -> list[StageTransition]:
        """Get recent stage transitions."""
        return self._recent_transitions[-limit:]

    def get_stage_time_spent(self, stage: DevelopmentStage) -> int:
        """Get time spent in a stage (milliseconds)."""
        activities = self._stage_activities.get(stage, [])
        if not activities:
            return 0

        total = 0
        for activity in activities:
            duration = activity.calculate_duration()
            total += duration

        return total

    def dispose(self) -> None:
        """Clean up resources."""
        self.stop()
        self._stage_activities.clear()
        self._recent_transitions.clear()
        self._current_sub_stages.clear()
        self._listeners.clear()


# Singleton instance
_stage_analyzer: StageAnalyzer | None = None


def get_stage_analyzer() -> StageAnalyzer:
    """Get the singleton stage analyzer instance."""
    global _stage_analyzer
    if _stage_analyzer is None:
        _stage_analyzer = StageAnalyzer()
    return _stage_analyzer
