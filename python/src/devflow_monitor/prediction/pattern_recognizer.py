"""
Pattern Recognition Engine.

Identifies recurring patterns in development workflow including
workflow patterns, velocity patterns, collaboration patterns,
and quality patterns.
"""

from __future__ import annotations

from collections import deque
from datetime import datetime
from typing import Any, Callable

from ..events.engine import EventEngine, get_event_engine
from ..events.types.base import BaseEvent, EventCategory
from .types import (
    Pattern,
    PatternCategory,
    PatternDetectionEvent,
    PatternIndicator,
    WorkflowPattern,
    WorkflowStep,
)


class PatternRecognizer:
    """
    Pattern recognition engine.

    Identifies recurring patterns in development workflow by analyzing
    event history. Supports 13 different pattern types across 5 categories.

    Attributes:
        max_history_size: Maximum number of events to keep in history.
    """

    def __init__(
        self,
        event_engine: EventEngine | None = None,
        max_history_size: int = 10000,
    ):
        """
        Initialize the pattern recognizer.

        Args:
            event_engine: Optional event engine instance.
            max_history_size: Maximum number of events to keep in history.
        """
        self._event_engine = event_engine or get_event_engine()
        self._max_history_size = max_history_size

        self._patterns: dict[str, Pattern] = {}
        self._workflow_patterns: dict[str, WorkflowPattern] = {}
        self._event_history: deque[BaseEvent] = deque(maxlen=max_history_size)
        self._listeners: dict[str, list[Callable]] = {}
        self._is_running = False
        self._subscription_id: str | None = None

    def start(self) -> None:
        """Start pattern recognition (subscribes to events)."""
        if self._is_running:
            return

        self._is_running = True
        self._subscription_id = self._event_engine.subscribe(
            "*",
            self._handle_event,
        )

    def stop(self) -> None:
        """Stop pattern recognition."""
        if not self._is_running:
            return

        self._is_running = False
        if self._subscription_id:
            self._event_engine.unsubscribe(self._subscription_id)
            self._subscription_id = None

    def on(self, event_type: str, handler: Callable) -> None:
        """
        Register an event listener.

        Args:
            event_type: Event type to listen for.
            handler: Handler function.
        """
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(handler)

    def emit(self, event_type: str, data: Any) -> None:
        """
        Emit an event to listeners.

        Args:
            event_type: Event type.
            data: Event data.
        """
        if event_type in self._listeners:
            for handler in self._listeners[event_type]:
                try:
                    handler(data)
                except Exception:
                    pass  # Silently ignore handler errors

    async def _handle_event(self, event: BaseEvent) -> None:
        """Handle incoming events for pattern detection."""
        self.process_event(event)

    def process_event(self, event: BaseEvent) -> None:
        """
        Process a new event for pattern detection.

        Args:
            event: Development event to process.
        """
        self._event_history.append(event)

        # Check for immediate patterns
        self._detect_immediate_patterns(event)

    def _detect_immediate_patterns(self, event: BaseEvent) -> None:
        """
        Detect patterns that can be identified from single events.

        Args:
            event: Current event.
        """
        category = event.category
        if isinstance(category, str):
            category_value = category
        else:
            category_value = category.value

        # Rapid file changes pattern
        if category_value == "file":
            self._detect_rapid_file_changes()

        # Test-driven development pattern
        if category_value == "test":
            self._detect_tdd_pattern()

        # Debugging pattern
        if (
            event.data.get("action") == "debug"
            or event.data.get("tool") == "debugger"
        ):
            self._detect_debugging_pattern()

    def _detect_rapid_file_changes(self) -> None:
        """Detect rapid file change pattern."""
        recent_file_events = [
            e for e in list(self._event_history)[-10:]
            if self._get_category_value(e) == "file"
        ]

        if len(recent_file_events) < 5:
            return

        first_event = recent_file_events[0]
        last_event = recent_file_events[-1]

        first_time = first_event.timestamp.timestamp() * 1000
        last_time = last_event.timestamp.timestamp() * 1000
        time_span = last_time - first_time

        if time_span <= 0:
            return

        changes_per_minute = (len(recent_file_events) / time_span) * 60000

        if changes_per_minute > 10:
            self.emit(
                "pattern-detected",
                PatternDetectionEvent(
                    type="rapid-changes",
                    description="Rapid file changes detected",
                    rate=changes_per_minute,
                ),
            )

    def _detect_tdd_pattern(self) -> None:
        """Detect test-driven development pattern."""
        recent_events = list(self._event_history)[-20:]
        test_events = [
            e for e in recent_events
            if self._get_category_value(e) == "test"
        ]
        file_events = [
            e for e in recent_events
            if self._get_category_value(e) == "file"
        ]

        if len(file_events) > 0 and len(test_events) > len(file_events) * 0.4:
            self.emit(
                "pattern-detected",
                PatternDetectionEvent(
                    type="tdd",
                    description="Test-Driven Development pattern detected",
                ),
            )

    def _detect_debugging_pattern(self) -> None:
        """Detect active debugging session pattern."""
        recent_events = list(self._event_history)[-5:]
        debug_events = [
            e for e in recent_events
            if (
                e.data.get("action") == "debug"
                or e.data.get("tool") == "debugger"
            )
        ]

        if len(debug_events) >= 3:
            self.emit(
                "pattern-detected",
                PatternDetectionEvent(
                    type="debugging",
                    description="Active debugging session detected",
                ),
            )

    def analyze_patterns(self) -> list[Pattern]:
        """
        Analyze and return all recognized patterns.

        Performs comprehensive pattern analysis including:
        - Workflow patterns
        - Velocity patterns
        - Collaboration patterns
        - Quality patterns

        Returns:
            List of recognized patterns.
        """
        # Analyze different pattern categories
        self._analyze_workflow_patterns()
        self._analyze_velocity_patterns()
        self._analyze_collaboration_patterns()
        self._analyze_quality_patterns()

        return list(self._patterns.values())

    def _analyze_workflow_patterns(self) -> None:
        """Analyze workflow patterns from event sequences."""
        sequences = self._extract_event_sequences()

        for sequence in sequences:
            pattern = self._identify_workflow_pattern(sequence)
            if pattern and pattern.frequency > 3:
                self._workflow_patterns[pattern.id] = pattern

    def _extract_event_sequences(self) -> list[list[BaseEvent]]:
        """
        Extract meaningful event sequences from history.

        Returns:
            List of event sequences grouped by session.
        """
        sequences: list[list[BaseEvent]] = []
        session_gap = 30 * 60 * 1000  # 30 minutes in milliseconds

        current_sequence: list[BaseEvent] = []
        last_event_time = 0.0

        for event in self._event_history:
            event_time = event.timestamp.timestamp() * 1000

            if event_time - last_event_time > session_gap and len(current_sequence) > 0:
                sequences.append(list(current_sequence))
                current_sequence = []

            current_sequence.append(event)
            last_event_time = event_time

        if len(current_sequence) > 0:
            sequences.append(current_sequence)

        return sequences

    def _identify_workflow_pattern(
        self,
        sequence: list[BaseEvent],
    ) -> WorkflowPattern | None:
        """
        Identify workflow pattern from event sequence.

        Args:
            sequence: Event sequence to analyze.

        Returns:
            Identified workflow pattern or None.
        """
        if len(sequence) < 3:
            return None

        steps: list[WorkflowStep] = []
        for i, event in enumerate(sequence):
            category = self._get_category_value(event)
            action = event.data.get("action", "unknown")

            avg_duration = 0.0
            if i > 0:
                prev_time = sequence[i - 1].timestamp.timestamp() * 1000
                curr_time = event.timestamp.timestamp() * 1000
                avg_duration = curr_time - prev_time

            step = WorkflowStep(
                name=f"{category}:{action}",
                type=category,
                avg_duration=avg_duration,
                dependencies=[f"step-{i - 1}"] if i > 0 else [],
                metadata=dict(event.data),
            )
            steps.append(step)

        pattern_id = self._generate_pattern_id(steps)
        existing_pattern = self._workflow_patterns.get(pattern_id)

        if existing_pattern:
            # Update existing pattern
            new_duration = self._calculate_sequence_duration(sequence)
            updated_avg = (
                existing_pattern.avg_duration * existing_pattern.frequency + new_duration
            ) / (existing_pattern.frequency + 1)

            return WorkflowPattern(
                id=existing_pattern.id,
                name=existing_pattern.name,
                steps=existing_pattern.steps,
                frequency=existing_pattern.frequency + 1,
                avg_duration=updated_avg,
                success_rate=existing_pattern.success_rate,
            )

        return WorkflowPattern(
            id=pattern_id,
            name=self._generate_pattern_name(steps),
            steps=steps,
            frequency=1,
            avg_duration=self._calculate_sequence_duration(sequence),
            success_rate=1.0,
        )

    def _analyze_velocity_patterns(self) -> None:
        """Analyze development velocity patterns."""
        commit_pattern = self._analyze_commit_frequency()
        if commit_pattern:
            self._patterns["commit-frequency"] = commit_pattern

        productivity_pattern = self._analyze_productivity_cycles()
        if productivity_pattern:
            self._patterns["productivity-cycles"] = productivity_pattern

    def _analyze_commit_frequency(self) -> Pattern | None:
        """
        Analyze commit frequency patterns.

        Returns:
            Commit frequency pattern or None.
        """
        git_events = [
            e for e in self._event_history
            if (
                self._get_category_value(e) == "git"
                and e.data.get("action") == "commit"
            )
        ]

        if len(git_events) < 10:
            return None

        hourly_distribution = [0] * 24
        daily_distribution = [0] * 7

        for event in git_events:
            hour = event.timestamp.hour
            day = event.timestamp.weekday()
            hourly_distribution[hour] += 1
            daily_distribution[day] += 1

        peak_hour = hourly_distribution.index(max(hourly_distribution))
        peak_day = daily_distribution.index(max(daily_distribution))

        return Pattern(
            id="commit-frequency",
            name="Commit Frequency Pattern",
            description=f"Most active at {peak_hour}:00, peak day: {self._get_day_name(peak_day)}",
            category=PatternCategory.DEVELOPMENT,
            indicators=[
                PatternIndicator(type="peak_hour", value=peak_hour, weight=0.7),
                PatternIndicator(type="peak_day", value=peak_day, weight=0.3),
            ],
            confidence=0.8,
            frequency=len(git_events),
            last_seen=datetime.utcnow(),
        )

    def _analyze_productivity_cycles(self) -> Pattern | None:
        """
        Analyze productivity cycle patterns.

        Returns:
            Productivity cycles pattern or None.
        """
        file_events = [
            e for e in self._event_history
            if self._get_category_value(e) == "file"
        ]

        if len(file_events) < 50:
            return None

        hourly_activity = [0] * 24
        for event in file_events:
            hour = event.timestamp.hour
            hourly_activity[hour] += 1

        # Find productive hours (1.5x above average)
        avg_activity = len(file_events) / 24
        productive_hours = [
            hour for hour, count in enumerate(hourly_activity)
            if count > avg_activity * 1.5
        ]

        if len(productive_hours) == 0:
            return None

        return Pattern(
            id="productivity-cycles",
            name="Productivity Cycles",
            description=f"High productivity hours: {', '.join(map(str, productive_hours))}",
            category=PatternCategory.WORKFLOW,
            indicators=[
                PatternIndicator(
                    type="productive_hour",
                    value=hour,
                    weight=1.0 / len(productive_hours),
                )
                for hour in productive_hours
            ],
            confidence=0.75,
            frequency=len(file_events),
            last_seen=datetime.utcnow(),
        )

    def _analyze_collaboration_patterns(self) -> None:
        """Analyze collaboration patterns."""
        ai_events = [
            e for e in self._event_history
            if self._get_category_value(e) == "ai"
        ]
        git_events = [
            e for e in self._event_history
            if self._get_category_value(e) == "git"
        ]

        if len(ai_events) > 20:
            ai_pattern = self._analyze_ai_usage_pattern(ai_events)
            if ai_pattern:
                self._patterns["ai-collaboration"] = ai_pattern

        if len(git_events) > 10:
            branch_pattern = self._analyze_branching_pattern(git_events)
            if branch_pattern:
                self._patterns["branching-strategy"] = branch_pattern

    def _analyze_ai_usage_pattern(self, ai_events: list[BaseEvent]) -> Pattern | None:
        """
        Analyze AI usage patterns.

        Args:
            ai_events: List of AI-related events.

        Returns:
            AI collaboration pattern or None.
        """
        tool_usage: dict[str, int] = {}
        task_types: dict[str, int] = {}

        for event in ai_events:
            tool = event.data.get("tool", "unknown")
            task = event.data.get("task_type", "unknown")

            tool_usage[tool] = tool_usage.get(tool, 0) + 1
            task_types[task] = task_types.get(task, 0) + 1

        preferred_tool = max(tool_usage.items(), key=lambda x: x[1])[0] if tool_usage else "unknown"
        primary_task = max(task_types.items(), key=lambda x: x[1])[0] if task_types else "unknown"

        return Pattern(
            id="ai-collaboration",
            name="AI Collaboration Pattern",
            description=f"Primary tool: {preferred_tool}, Main use: {primary_task}",
            category=PatternCategory.COLLABORATION,
            indicators=[
                PatternIndicator(type="preferred_tool", value=preferred_tool, weight=0.6),
                PatternIndicator(type="primary_task", value=primary_task, weight=0.4),
            ],
            confidence=0.85,
            frequency=len(ai_events),
            last_seen=datetime.utcnow(),
        )

    def _analyze_branching_pattern(self, git_events: list[BaseEvent]) -> Pattern | None:
        """
        Analyze branching strategy patterns.

        Args:
            git_events: List of git-related events.

        Returns:
            Branching strategy pattern or None.
        """
        branch_events = [
            e for e in git_events
            if e.data.get("action") in ("branch_create", "branch_switch")
        ]

        if len(branch_events) < 5:
            return None

        branch_types: dict[str, int] = {}
        for event in branch_events:
            branch_name = event.data.get("branch", "")
            branch_type = self._detect_branch_type(branch_name)
            branch_types[branch_type] = branch_types.get(branch_type, 0) + 1

        primary_strategy = max(branch_types.items(), key=lambda x: x[1])[0] if branch_types else "custom"

        return Pattern(
            id="branching-strategy",
            name="Branching Strategy Pattern",
            description=f"Primary strategy: {primary_strategy}",
            category=PatternCategory.WORKFLOW,
            indicators=[
                PatternIndicator(
                    type="branch_strategy",
                    value=primary_strategy,
                    weight=1.0,
                ),
            ],
            confidence=0.7,
            frequency=len(branch_events),
            last_seen=datetime.utcnow(),
        )

    def _analyze_quality_patterns(self) -> None:
        """Analyze code quality patterns."""
        test_pattern = self._analyze_testing_pattern()
        if test_pattern:
            self._patterns["testing-pattern"] = test_pattern

        refactoring_pattern = self._analyze_refactoring_pattern()
        if refactoring_pattern:
            self._patterns["refactoring-pattern"] = refactoring_pattern

    def _analyze_testing_pattern(self) -> Pattern | None:
        """
        Analyze testing patterns.

        Returns:
            Testing pattern or None.
        """
        test_events = [
            e for e in self._event_history
            if self._get_category_value(e) == "test"
        ]
        file_events = [
            e for e in self._event_history
            if self._get_category_value(e) == "file"
        ]

        if len(test_events) < 10 or len(file_events) < 20:
            return None

        test_to_code_ratio = len(test_events) / len(file_events)
        test_first = self._detect_test_first_development()

        return Pattern(
            id="testing-pattern",
            name="Testing Pattern",
            description="Test-First Development" if test_first else "Test-After Development",
            category=PatternCategory.QUALITY,
            indicators=[
                PatternIndicator(type="test_ratio", value=test_to_code_ratio, weight=0.5),
                PatternIndicator(type="test_first", value=1 if test_first else 0, weight=0.5),
            ],
            confidence=0.8,
            frequency=len(test_events),
            last_seen=datetime.utcnow(),
        )

    def _detect_test_first_development(self) -> bool:
        """
        Detect test-first development pattern.

        Returns:
            True if test-first development is detected.
        """
        sequences = self._extract_event_sequences()
        test_first_count = 0
        total_sequences = 0

        for sequence in sequences:
            has_test = any(
                self._get_category_value(e) == "test"
                for e in sequence
            )
            has_code = any(
                self._get_category_value(e) == "file"
                and "test" not in (e.source or "").lower()
                for e in sequence
            )

            if has_test and has_code:
                total_sequences += 1
                first_test_index = next(
                    (i for i, e in enumerate(sequence)
                     if self._get_category_value(e) == "test"),
                    -1,
                )
                first_code_index = next(
                    (i for i, e in enumerate(sequence)
                     if self._get_category_value(e) == "file"
                     and "test" not in (e.source or "").lower()),
                    -1,
                )

                if first_test_index >= 0 and first_code_index >= 0:
                    if first_test_index < first_code_index:
                        test_first_count += 1

        return total_sequences > 0 and (test_first_count / total_sequences) > 0.6

    def _analyze_refactoring_pattern(self) -> Pattern | None:
        """
        Analyze refactoring patterns.

        Returns:
            Refactoring pattern or None.
        """
        file_events = [
            e for e in self._event_history
            if self._get_category_value(e) == "file"
        ]

        refactoring_indicators = [
            e for e in file_events
            if (
                e.data.get("action") == "rename"
                or "refactor" in str(e.data.get("changes", "")).lower()
                or "refactor" in str(e.data.get("_message", "")).lower()
            )
        ]

        if len(refactoring_indicators) < 5:
            return None

        refactoring_rate = len(refactoring_indicators) / len(file_events)

        return Pattern(
            id="refactoring-pattern",
            name="Refactoring Pattern",
            description=f"{refactoring_rate * 100:.1f}% of changes involve refactoring",
            category=PatternCategory.QUALITY,
            indicators=[
                PatternIndicator(
                    type="refactoring_rate",
                    value=refactoring_rate,
                    weight=1.0,
                ),
            ],
            confidence=0.75,
            frequency=len(refactoring_indicators),
            last_seen=datetime.utcnow(),
        )

    # Helper methods

    def _get_category_value(self, event: BaseEvent) -> str:
        """Get category value as string."""
        category = event.category
        if isinstance(category, str):
            return category
        return category.value

    def _generate_pattern_id(self, steps: list[WorkflowStep]) -> str:
        """Generate pattern ID from workflow steps."""
        return "-".join(s.type for s in steps)

    def _generate_pattern_name(self, steps: list[WorkflowStep]) -> str:
        """Generate pattern name from workflow steps."""
        types = [s.type for s in steps]
        if "test" in types and "file" in types:
            return "Test-Code Cycle"
        if "git" in types and "file" in types:
            return "Code-Commit Cycle"
        return "Custom Workflow"

    def _calculate_sequence_duration(self, sequence: list[BaseEvent]) -> float:
        """Calculate total duration of event sequence."""
        if len(sequence) < 2:
            return 0.0

        start = sequence[0].timestamp.timestamp() * 1000
        end = sequence[-1].timestamp.timestamp() * 1000
        return end - start

    def _detect_branch_type(self, branch_name: str) -> str:
        """Detect branch type from branch name."""
        lowercased = branch_name.lower()

        if "feature/" in lowercased:
            return "feature-branch"
        if "bugfix/" in lowercased or "fix/" in lowercased:
            return "bugfix-branch"
        if "hotfix/" in lowercased:
            return "hotfix-branch"
        if "release/" in lowercased:
            return "release-branch"
        if lowercased in ("main", "master"):
            return "main-branch"
        if lowercased in ("develop", "dev"):
            return "develop-branch"

        return "custom-branch"

    def _get_day_name(self, day: int) -> str:
        """Get day name from weekday number."""
        days = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        ]
        return days[day] if 0 <= day < 7 else "Unknown"

    def get_patterns(self) -> list[Pattern]:
        """
        Get all recognized patterns.

        Returns:
            List of recognized patterns.
        """
        return list(self._patterns.values())

    def get_workflow_patterns(self) -> list[WorkflowPattern]:
        """
        Get all workflow patterns.

        Returns:
            List of workflow patterns.
        """
        return list(self._workflow_patterns.values())

    def get_stats(self) -> dict[str, Any]:
        """
        Get pattern recognizer statistics.

        Returns:
            Statistics dictionary.
        """
        return {
            "is_running": self._is_running,
            "event_history_size": len(self._event_history),
            "max_history_size": self._max_history_size,
            "patterns_count": len(self._patterns),
            "workflow_patterns_count": len(self._workflow_patterns),
            "patterns_by_category": self._count_patterns_by_category(),
        }

    def _count_patterns_by_category(self) -> dict[str, int]:
        """Count patterns by category."""
        counts: dict[str, int] = {}
        for pattern in self._patterns.values():
            category = pattern.category.value
            counts[category] = counts.get(category, 0) + 1
        return counts


# Singleton instance
_pattern_recognizer: PatternRecognizer | None = None


def get_pattern_recognizer() -> PatternRecognizer:
    """Get the singleton pattern recognizer instance."""
    global _pattern_recognizer
    if _pattern_recognizer is None:
        _pattern_recognizer = PatternRecognizer()
    return _pattern_recognizer


# Alias for compatibility
pattern_recognizer = get_pattern_recognizer()
