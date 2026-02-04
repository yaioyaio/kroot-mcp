"""
Bottleneck Detector.

Automatically detects and analyzes bottlenecks in the development process.
"""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Callable

from ..events.engine import EventEngine, get_event_engine
from ..events.types.base import BaseEvent, EventCategory, EventSeverity
from .metrics_collector import MetricsCollector, get_metrics_collector
from .types.metrics import (
    Bottleneck,
    BottleneckType,
    MetricData,
    TrendDirection,
)


class BottleneckDetectorOptions:
    """Options for bottleneck detector."""

    def __init__(
        self,
        check_interval: int = 60000,  # 1 minute
        alert_threshold: float = 70.0,
        confidence_threshold: float = 70.0,
        enabled_detectors: list[BottleneckType] | None = None,
    ):
        """
        Initialize options.

        Args:
            check_interval: Interval between checks in ms.
            alert_threshold: Impact threshold for alerts.
            confidence_threshold: Minimum confidence to report.
            enabled_detectors: List of enabled detector types.
        """
        self.check_interval = check_interval
        self.alert_threshold = alert_threshold
        self.confidence_threshold = confidence_threshold
        self.enabled_detectors = enabled_detectors


class DetectionRule:
    """Detection rule interface."""

    def __init__(
        self,
        detect_fn: Callable[[dict[str, MetricData], list[BaseEvent]], Bottleneck | None],
    ):
        """
        Initialize detection rule.

        Args:
            detect_fn: Detection function.
        """
        self._detect_fn = detect_fn

    def detect(
        self,
        metrics: dict[str, MetricData],
        events: list[BaseEvent],
    ) -> Bottleneck | None:
        """Run detection."""
        return self._detect_fn(metrics, events)


class BottleneckDetector:
    """
    Bottleneck detector.

    Automatically detects and analyzes bottlenecks in the development process.
    """

    def __init__(
        self,
        event_engine: EventEngine | None = None,
        metrics_collector: MetricsCollector | None = None,
        options: BottleneckDetectorOptions | None = None,
    ):
        """
        Initialize the bottleneck detector.

        Args:
            event_engine: Optional event engine instance.
            metrics_collector: Optional metrics collector instance.
            options: Optional detector options.
        """
        self._event_engine = event_engine or get_event_engine()
        self._metrics_collector = metrics_collector or get_metrics_collector()
        self._options = options or BottleneckDetectorOptions()
        self._is_running = False
        self._subscription_id: str | None = None
        self._bottlenecks: dict[str, Bottleneck] = {}
        self._detection_rules: dict[BottleneckType, DetectionRule] = {}
        self._event_history: list[BaseEvent] = []
        self._listeners: dict[str, list[Callable]] = {}

        self._initialize_detection_rules()

    def start(self) -> None:
        """Start bottleneck detection."""
        if self._is_running:
            return

        self._is_running = True

        # Subscribe to events
        self._subscription_id = self._event_engine.subscribe(
            "*",
            self._handle_event,
        )

    def stop(self) -> None:
        """Stop bottleneck detection."""
        if not self._is_running:
            return

        self._is_running = False

        if self._subscription_id:
            self._event_engine.unsubscribe(self._subscription_id)
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
        self._event_history.append(event)

        # Memory management: keep only recent events
        if len(self._event_history) > 1000:
            self._event_history = self._event_history[-500:]

        # Real-time bottleneck detection for critical events
        if event.severity in (EventSeverity.ERROR, EventSeverity.CRITICAL):
            self._detect_real_time_bottlenecks(event)

    def _detect_real_time_bottlenecks(self, event: BaseEvent) -> None:
        """Detect bottlenecks in real-time for critical events."""
        # Build failure detection
        if (
            event.category == EventCategory.BUILD
            and event.data.get("success") is False
        ):
            self._create_bottleneck(
                type=BottleneckType.TECHNICAL,
                category=EventCategory.BUILD,
                severity=EventSeverity.ERROR,
                title="Build Failure",
                description=f"Build failed: {event.data.get('error', 'Unknown error')}",
                location=event.source,
                impact=70,
                confidence=85,
                metadata=event.data,
            )

        # Test failure detection
        if (
            event.category == EventCategory.TEST
            and event.data.get("passed") is False
        ):
            self._create_bottleneck(
                type=BottleneckType.QUALITY,
                category=EventCategory.TEST,
                severity=EventSeverity.WARNING,
                title="Test Failure",
                description=f"Test failed: {event.data.get('test_name', 'Unknown test')}",
                location=event.source,
                impact=50,
                confidence=90,
                metadata=event.data,
            )

    def _create_bottleneck(
        self,
        type: BottleneckType,
        category: EventCategory,
        severity: EventSeverity,
        title: str,
        description: str,
        location: str,
        impact: int,
        confidence: int,
        metadata: dict[str, Any] | None = None,
        affected_metrics: list[str] | None = None,
        suggested_actions: list[str] | None = None,
    ) -> None:
        """Create a new bottleneck."""
        now = datetime.utcnow()
        bottleneck_id = f"{type.value}_{int(time.time() * 1000)}"

        bottleneck = Bottleneck(
            id=bottleneck_id,
            type=type,
            category=category,
            severity=severity,
            title=title,
            description=description,
            location=location,
            impact=impact,
            confidence=confidence,
            detected_at=now,
            last_occurred=now,
            frequency=1,
            duration=0,
            affected_metrics=affected_metrics or [],
            suggested_actions=suggested_actions or [],
            metadata=metadata or {},
        )

        self._bottlenecks[bottleneck_id] = bottleneck
        self.emit("bottleneck-detected", bottleneck)

    def _update_bottleneck(self, new_bottleneck: Bottleneck) -> None:
        """Update an existing bottleneck or create a new one."""
        existing_id = self._find_similar_bottleneck(new_bottleneck)

        if existing_id:
            existing = self._bottlenecks[existing_id]
            existing.last_occurred = datetime.utcnow()
            existing.frequency += 1
            existing.confidence = min(100, existing.confidence + 5)
            existing.duration = int(
                (existing.last_occurred - existing.detected_at).total_seconds() * 1000
            )
            self._bottlenecks[existing_id] = existing
            self.emit("bottleneck-updated", existing)
        else:
            self._bottlenecks[new_bottleneck.id] = new_bottleneck
            self.emit("bottleneck-detected", new_bottleneck)

    def _find_similar_bottleneck(self, bottleneck: Bottleneck) -> str | None:
        """Find a similar existing bottleneck."""
        for existing_id, existing in self._bottlenecks.items():
            if (
                existing.type == bottleneck.type
                and existing.category == bottleneck.category
                and existing.location == bottleneck.location
                and self._is_similar_title(existing.title, bottleneck.title)
            ):
                return existing_id
        return None

    def _is_similar_title(self, title1: str, title2: str) -> bool:
        """Check if two titles are similar."""
        words1 = set(title1.lower().split())
        words2 = set(title2.lower().split())

        common_words = words1 & words2
        similarity = len(common_words) / max(len(words1), len(words2))

        return similarity > 0.6

    def _cleanup_resolved_bottlenecks(self) -> None:
        """Remove bottlenecks that haven't occurred recently."""
        now_ms = int(time.time() * 1000)
        stale_threshold = 5 * 60 * 1000  # 5 minutes

        to_remove = []
        for bottleneck_id, bottleneck in self._bottlenecks.items():
            last_ms = int(bottleneck.last_occurred.timestamp() * 1000)
            if now_ms - last_ms > stale_threshold:
                to_remove.append(bottleneck_id)

        for bottleneck_id in to_remove:
            bottleneck = self._bottlenecks.pop(bottleneck_id)
            self.emit("bottleneck-resolved", bottleneck)

    def _initialize_detection_rules(self) -> None:
        """Initialize detection rules for each bottleneck type."""
        # Process bottleneck detection
        def detect_process(
            metrics: dict[str, MetricData],
            _events: list[BaseEvent],
        ) -> Bottleneck | None:
            build_time = metrics.get("build_time")
            if build_time and build_time.summary.trend == TrendDirection.INCREASING:
                return Bottleneck(
                    id=f"process_{int(time.time() * 1000)}",
                    type=BottleneckType.PROCESS,
                    category=EventCategory.BUILD,
                    severity=EventSeverity.WARNING,
                    title="Increasing Build Time",
                    description=(
                        f"Build time has been increasing: "
                        f"{build_time.summary.change_percentage:.1f}% change"
                    ),
                    location="Build Process",
                    impact=min(80, int(abs(build_time.summary.change_percentage))),
                    confidence=75,
                    detected_at=datetime.utcnow(),
                    last_occurred=datetime.utcnow(),
                    frequency=1,
                    duration=0,
                    affected_metrics=["build_time"],
                    suggested_actions=[
                        "Review build configuration",
                        "Check for dependency issues",
                        "Optimize build scripts",
                    ],
                    metadata={"metric": build_time.definition.id},
                )
            return None

        self._detection_rules[BottleneckType.PROCESS] = DetectionRule(detect_process)

        # Quality bottleneck detection
        def detect_quality(
            metrics: dict[str, MetricData],
            _events: list[BaseEvent],
        ) -> Bottleneck | None:
            test_coverage = metrics.get("test_coverage")
            if (
                test_coverage
                and test_coverage.summary.trend == TrendDirection.DECREASING
            ):
                return Bottleneck(
                    id=f"quality_{int(time.time() * 1000)}",
                    type=BottleneckType.QUALITY,
                    category=EventCategory.TEST,
                    severity=EventSeverity.WARNING,
                    title="Decreasing Test Coverage",
                    description=(
                        f"Test coverage has been decreasing: "
                        f"{abs(test_coverage.summary.change_percentage):.1f}% drop"
                    ),
                    location="Test Suite",
                    impact=min(70, int(abs(test_coverage.summary.change_percentage))),
                    confidence=80,
                    detected_at=datetime.utcnow(),
                    last_occurred=datetime.utcnow(),
                    frequency=1,
                    duration=0,
                    affected_metrics=["test_coverage"],
                    suggested_actions=[
                        "Add more unit tests",
                        "Review uncovered code paths",
                        "Implement integration tests",
                    ],
                    metadata={"metric": test_coverage.definition.id},
                )
            return None

        self._detection_rules[BottleneckType.QUALITY] = DetectionRule(detect_quality)

        # Resource bottleneck detection
        def detect_resource(
            metrics: dict[str, MetricData],
            _events: list[BaseEvent],
        ) -> Bottleneck | None:
            file_changes = metrics.get("file_changes_per_hour")
            if file_changes and file_changes.summary.current > 100:
                return Bottleneck(
                    id=f"resource_{int(time.time() * 1000)}",
                    type=BottleneckType.RESOURCE,
                    category=EventCategory.FILE,
                    severity=EventSeverity.INFO,
                    title="High File Change Rate",
                    description=(
                        f"Unusually high file change rate: "
                        f"{file_changes.summary.current} changes/hour"
                    ),
                    location="File System",
                    impact=40,
                    confidence=60,
                    detected_at=datetime.utcnow(),
                    last_occurred=datetime.utcnow(),
                    frequency=1,
                    duration=0,
                    affected_metrics=["file_changes_per_hour"],
                    suggested_actions=[
                        "Review file watching patterns",
                        "Check for infinite loops in file operations",
                        "Optimize file processing",
                    ],
                    metadata={"metric": file_changes.definition.id},
                )
            return None

        self._detection_rules[BottleneckType.RESOURCE] = DetectionRule(detect_resource)

        # Workflow bottleneck detection
        def detect_workflow(
            _metrics: dict[str, MetricData],
            events: list[BaseEvent],
        ) -> Bottleneck | None:
            now_ms = int(time.time() * 1000)
            ten_min_ago = now_ms - (10 * 60 * 1000)

            recent_events = [
                e for e in events
                if int(e.timestamp.timestamp() * 1000) > ten_min_ago
            ]
            error_events = [
                e for e in recent_events
                if e.severity == EventSeverity.ERROR
            ]

            if len(error_events) > 5:
                return Bottleneck(
                    id=f"workflow_{int(time.time() * 1000)}",
                    type=BottleneckType.WORKFLOW,
                    category=EventCategory.SYSTEM,
                    severity=EventSeverity.WARNING,
                    title="High Error Rate",
                    description=(
                        f"High number of errors in the last 10 minutes: "
                        f"{len(error_events)} errors"
                    ),
                    location="Development Workflow",
                    impact=min(90, len(error_events) * 10),
                    confidence=85,
                    detected_at=datetime.utcnow(),
                    last_occurred=datetime.utcnow(),
                    frequency=1,
                    duration=0,
                    affected_metrics=["error_rate"],
                    suggested_actions=[
                        "Review recent changes",
                        "Check system logs",
                        "Validate configuration",
                    ],
                    metadata={"error_count": len(error_events)},
                )
            return None

        self._detection_rules[BottleneckType.WORKFLOW] = DetectionRule(detect_workflow)

        # Technical bottleneck detection
        def detect_technical(
            _metrics: dict[str, MetricData],
            _events: list[BaseEvent],
        ) -> Bottleneck | None:
            import sys

            # Get memory usage
            try:
                import resource
                mem_info = resource.getrusage(resource.RUSAGE_SELF)
                memory_usage_percent = min(100, mem_info.ru_maxrss / (1024 * 1024) * 10)
            except ImportError:
                memory_usage_percent = sys.getsizeof([]) / 100  # Fallback

            if memory_usage_percent > 85:
                return Bottleneck(
                    id=f"technical_{int(time.time() * 1000)}",
                    type=BottleneckType.TECHNICAL,
                    category=EventCategory.SYSTEM,
                    severity=EventSeverity.WARNING,
                    title="High Memory Usage",
                    description=f"Memory usage is {memory_usage_percent:.1f}%",
                    location="System Resources",
                    impact=min(95, int(memory_usage_percent)),
                    confidence=90,
                    detected_at=datetime.utcnow(),
                    last_occurred=datetime.utcnow(),
                    frequency=1,
                    duration=0,
                    affected_metrics=["memory_usage"],
                    suggested_actions=[
                        "Check for memory leaks",
                        "Optimize data structures",
                        "Implement garbage collection",
                    ],
                    metadata={"memory_usage_percent": memory_usage_percent},
                )
            return None

        self._detection_rules[BottleneckType.TECHNICAL] = DetectionRule(detect_technical)

    def detect_bottlenecks(self) -> None:
        """Run periodic bottleneck detection."""
        metrics = self._metrics_collector.get_all_metrics()

        for bottleneck_type, rule in self._detection_rules.items():
            if (
                self._options.enabled_detectors
                and bottleneck_type not in self._options.enabled_detectors
            ):
                continue

            try:
                bottleneck = rule.detect(metrics, self._event_history)
                if (
                    bottleneck
                    and bottleneck.confidence >= self._options.confidence_threshold
                ):
                    self._update_bottleneck(bottleneck)
            except Exception as e:
                print(f"Error detecting {bottleneck_type.value} bottleneck: {e}")

        # Cleanup resolved bottlenecks
        self._cleanup_resolved_bottlenecks()

        self.emit("bottlenecks-updated", list(self._bottlenecks.values()))

    def analyze_bottlenecks(self) -> list[Bottleneck]:
        """Analyze and return all bottlenecks."""
        self.detect_bottlenecks()
        return self.get_all_bottlenecks()

    def get_all_bottlenecks(self) -> list[Bottleneck]:
        """Get all detected bottlenecks."""
        return list(self._bottlenecks.values())

    def get_bottlenecks_by_severity(
        self,
        severity: EventSeverity,
    ) -> list[Bottleneck]:
        """Get bottlenecks by severity level."""
        return [b for b in self._bottlenecks.values() if b.severity == severity]

    def get_bottlenecks_by_type(
        self,
        bottleneck_type: BottleneckType,
    ) -> list[Bottleneck]:
        """Get bottlenecks by type."""
        return [b for b in self._bottlenecks.values() if b.type == bottleneck_type]

    def get_active_bottleneck_count(self) -> int:
        """Get the count of active bottlenecks."""
        return len(self._bottlenecks)

    def get_bottleneck_stats(self) -> dict[str, Any]:
        """Get bottleneck statistics."""
        bottlenecks = list(self._bottlenecks.values())

        by_type: dict[str, int] = {}
        for b in bottlenecks:
            by_type[b.type.value] = by_type.get(b.type.value, 0) + 1

        by_severity: dict[str, int] = {}
        for b in bottlenecks:
            by_severity[b.severity.value] = by_severity.get(b.severity.value, 0) + 1

        avg_impact = (
            sum(b.impact for b in bottlenecks) / len(bottlenecks)
            if bottlenecks
            else 0
        )

        avg_confidence = (
            sum(b.confidence for b in bottlenecks) / len(bottlenecks)
            if bottlenecks
            else 0
        )

        sorted_by_frequency = sorted(bottlenecks, key=lambda b: b.frequency, reverse=True)
        sorted_by_impact = sorted(bottlenecks, key=lambda b: b.impact, reverse=True)

        return {
            "total": len(bottlenecks),
            "by_type": by_type,
            "by_severity": by_severity,
            "average_impact": round(avg_impact),
            "average_confidence": round(avg_confidence),
            "most_frequent": sorted_by_frequency[0] if sorted_by_frequency else None,
            "highest_impact": sorted_by_impact[0] if sorted_by_impact else None,
        }

    def get_stats(self) -> dict[str, Any]:
        """Get detector statistics."""
        return {
            "is_running": self._is_running,
            "total_bottlenecks": len(self._bottlenecks),
            "total_events": len(self._event_history),
            "detection_rules": len(self._detection_rules),
            "bottleneck_stats": self.get_bottleneck_stats(),
        }


# Singleton instance
_bottleneck_detector: BottleneckDetector | None = None


def get_bottleneck_detector() -> BottleneckDetector:
    """Get the singleton bottleneck detector instance."""
    global _bottleneck_detector
    if _bottleneck_detector is None:
        _bottleneck_detector = BottleneckDetector()
    return _bottleneck_detector


# Alias for compatibility
bottleneck_detector = get_bottleneck_detector()
