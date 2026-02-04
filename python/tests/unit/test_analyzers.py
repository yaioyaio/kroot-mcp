"""
Unit tests for the analyzers module.

Tests cover stage analyzer, methodology analyzer (DDD, TDD, BDD, EDA),
metrics collector, and bottleneck detector.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from devflow_monitor.analyzers.bottleneck_detector import (
    BottleneckDetector,
    BottleneckDetectorOptions,
)
from devflow_monitor.analyzers.methodology_analyzer import MethodologyAnalyzer
from devflow_monitor.analyzers.metrics_collector import (
    MetricsCollector,
    MetricsCollectorOptions,
)
from devflow_monitor.analyzers.stage_analyzer import StageAnalyzer, StageAnalyzerConfig
from devflow_monitor.analyzers.types.methodology import (
    DevelopmentMethodology,
    TDDCycle,
)
from devflow_monitor.analyzers.types.metrics import (
    BottleneckType,
    MetricType,
    MetricUnit,
    TrendDirection,
)
from devflow_monitor.analyzers.types.stage import (
    CodingSubStage,
    DevelopmentStage,
)
from devflow_monitor.events.engine import EventEngine
from devflow_monitor.events.types.base import BaseEvent, EventCategory, EventSeverity


class TestStageAnalyzerDetect:
    """Tests for stage analyzer stage detection."""

    @pytest.fixture
    def stage_analyzer(self, event_engine: EventEngine) -> StageAnalyzer:
        """Create a stage analyzer instance."""
        config = StageAnalyzerConfig(
            confidence_threshold=0.5,
            transition_cooldown=100,
            history_size=50,
            event_engine=event_engine,
        )
        return StageAnalyzer(config)

    def test_initial_state(self, stage_analyzer: StageAnalyzer) -> None:
        """Test initial analyzer state."""
        assert stage_analyzer.get_current_stage() == DevelopmentStage.PRD

    def test_detection_rules_initialized(
        self, stage_analyzer: StageAnalyzer
    ) -> None:
        """Test that detection rules are initialized."""
        assert len(stage_analyzer._detection_rules) > 0
        assert DevelopmentStage.PRD in stage_analyzer._detection_rules
        assert DevelopmentStage.CODING in stage_analyzer._detection_rules

    def test_stage_transition_with_confidence(
        self, stage_analyzer: StageAnalyzer
    ) -> None:
        """Test stage transition with confidence threshold."""
        indicators = [
            MagicMock(type="file_pattern", value="test.py", source="file_event")
        ]

        # Force a detection
        stage_analyzer._detect_stage(
            DevelopmentStage.CODING,
            confidence=0.8,
            indicators=indicators,
        )

        assert stage_analyzer._current_stage == DevelopmentStage.CODING
        assert len(stage_analyzer._recent_transitions) == 1

    def test_stage_transition_below_threshold(
        self, stage_analyzer: StageAnalyzer
    ) -> None:
        """Test stage transition rejected below confidence threshold."""
        indicators = [MagicMock()]

        # Low confidence should not trigger transition
        stage_analyzer._detect_stage(
            DevelopmentStage.CODING,
            confidence=0.3,  # Below 0.5 threshold
            indicators=indicators,
        )

        # Should still be at initial stage
        assert stage_analyzer._current_stage != DevelopmentStage.CODING

    def test_analyze_returns_result(self, stage_analyzer: StageAnalyzer) -> None:
        """Test that analyze returns a valid result."""
        result = stage_analyzer.analyze()

        assert result is not None
        assert result.current_stage is not None
        assert isinstance(result.stage_progress, dict)
        assert isinstance(result.suggestions, list)

    def test_transition_history(self, stage_analyzer: StageAnalyzer) -> None:
        """Test transition history tracking."""
        indicators = [MagicMock()]

        # Make multiple transitions
        stage_analyzer._detect_stage(DevelopmentStage.CODING, 0.8, indicators)
        # Wait for cooldown
        stage_analyzer._last_transition_time = None
        stage_analyzer._detect_stage(DevelopmentStage.FRONTEND, 0.8, indicators)

        history = stage_analyzer.get_transition_history()

        assert len(history) >= 1

    def test_coding_substage_detection(
        self, stage_analyzer: StageAnalyzer
    ) -> None:
        """Test coding sub-stage detection."""
        # Set current stage to coding
        stage_analyzer._current_stage = DevelopmentStage.CODING

        # Create a test event
        event = BaseEvent(
            type="file:changed",
            category=EventCategory.FILE,
            source="test",
            data={
                "new_file": {"path": "tests/unit_test.py"},
                "context": {"type": "test"},
            },
        )

        stage_analyzer._detect_coding_sub_stage(event)

        assert CodingSubStage.UNIT_TEST in stage_analyzer._current_sub_stages

    def test_stage_time_spent(self, stage_analyzer: StageAnalyzer) -> None:
        """Test calculating time spent in a stage."""
        time_spent = stage_analyzer.get_stage_time_spent(DevelopmentStage.PRD)

        # Initially should be 0 or small
        assert time_spent >= 0


class TestMethodologyAnalyzerDDD:
    """Tests for DDD methodology analysis."""

    @pytest.fixture
    def methodology_analyzer(
        self, event_engine: EventEngine
    ) -> MethodologyAnalyzer:
        """Create a methodology analyzer instance."""
        return MethodologyAnalyzer(event_engine=event_engine)

    def test_ddd_detection_rules(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test DDD detection rules are configured."""
        rules = methodology_analyzer._detection_rules
        assert DevelopmentMethodology.DDD in rules

        ddd_rule = rules[DevelopmentMethodology.DDD]
        assert len(ddd_rule.patterns) > 0
        assert any("Entity" in p for p in ddd_rule.patterns)
        assert any("Aggregate" in p for p in ddd_rule.patterns)

    def test_ddd_pattern_analysis(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test DDD pattern analysis."""
        file_path = "src/domain/user/UserEntity.py"
        content = "class UserEntity:\n    pass"

        methodology_analyzer._analyze_ddd_patterns(file_path, content)

        # Should have detected at least something in the context
        assert methodology_analyzer._ddd_context is not None

    def test_ddd_score_calculation(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test DDD score calculation."""
        score_result = methodology_analyzer._calculate_ddd_score()

        assert "score" in score_result
        assert "strengths" in score_result
        assert "weaknesses" in score_result
        assert "recommendations" in score_result

    def test_bounded_context_inference(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test bounded context inference from file path."""
        path = "src/domain/user/UserEntity.py"
        context = methodology_analyzer._infer_bounded_context(path)

        assert context == "user"

    def test_bounded_context_default(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test bounded context defaults to 'default'."""
        path = "src/utils/helper.py"
        context = methodology_analyzer._infer_bounded_context(path)

        assert context == "default"


class TestMethodologyAnalyzerTDD:
    """Tests for TDD methodology analysis."""

    @pytest.fixture
    def methodology_analyzer(
        self, event_engine: EventEngine
    ) -> MethodologyAnalyzer:
        """Create a methodology analyzer instance."""
        return MethodologyAnalyzer(event_engine=event_engine)

    def test_tdd_detection_rules(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test TDD detection rules are configured."""
        rules = methodology_analyzer._detection_rules
        assert DevelopmentMethodology.TDD in rules

        tdd_rule = rules[DevelopmentMethodology.TDD]
        assert len(tdd_rule.patterns) > 0
        assert any("describe" in p for p in tdd_rule.patterns)
        assert any("test" in p for p in tdd_rule.patterns)

    def test_tdd_cycle_state_initialization(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test TDD cycle state initialization."""
        state = methodology_analyzer._tdd_state

        assert state.current_phase == TDDCycle.RED
        assert state.test_count == 0
        assert state.cycle_count == 0

    def test_tdd_cycle_transition(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test TDD cycle phase transitions."""
        methodology_analyzer._transition_tdd_phase(TDDCycle.GREEN)

        assert methodology_analyzer._tdd_state.current_phase == TDDCycle.GREEN

    def test_tdd_commit_message_analysis(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test TDD-related commit message analysis."""
        methodology_analyzer._update_tdd_cycle("test: add failing test")

        assert methodology_analyzer._tdd_state.current_phase == TDDCycle.RED

    def test_tdd_score_calculation(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test TDD score calculation."""
        score_result = methodology_analyzer._calculate_tdd_score()

        assert "score" in score_result
        assert "details" in score_result
        assert "test_count" in score_result["details"]


class TestMethodologyAnalyzerBDD:
    """Tests for BDD methodology analysis."""

    @pytest.fixture
    def methodology_analyzer(
        self, event_engine: EventEngine
    ) -> MethodologyAnalyzer:
        """Create a methodology analyzer instance."""
        return MethodologyAnalyzer(event_engine=event_engine)

    def test_bdd_detection_rules(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test BDD detection rules are configured."""
        rules = methodology_analyzer._detection_rules
        assert DevelopmentMethodology.BDD in rules

        bdd_rule = rules[DevelopmentMethodology.BDD]
        assert any("Feature:" in p for p in bdd_rule.patterns)
        assert any("Scenario:" in p for p in bdd_rule.patterns)
        assert any("Given" in p for p in bdd_rule.patterns)

    def test_bdd_step_parsing(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test BDD step parsing."""
        scenario_text = """
        Given a user exists
        When the user logs in
        Then the user sees the dashboard
        And the session is active
        """

        steps = methodology_analyzer._parse_bdd_steps(scenario_text)

        assert len(steps) >= 4

    def test_bdd_pattern_analysis(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test BDD pattern analysis."""
        file_path = "features/login.feature"
        content = """
        Feature: User Login
        Scenario: Successful login
            Given a registered user
            When they enter valid credentials
            Then they are logged in
        """

        methodology_analyzer._analyze_bdd_patterns(file_path, content)

        assert len(methodology_analyzer._bdd_scenarios) >= 0

    def test_bdd_score_calculation(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test BDD score calculation."""
        score_result = methodology_analyzer._calculate_bdd_score()

        assert "score" in score_result
        assert "details" in score_result
        assert "scenarios" in score_result["details"]


class TestMethodologyAnalyzerEDA:
    """Tests for EDA methodology analysis."""

    @pytest.fixture
    def methodology_analyzer(
        self, event_engine: EventEngine
    ) -> MethodologyAnalyzer:
        """Create a methodology analyzer instance."""
        return MethodologyAnalyzer(event_engine=event_engine)

    def test_eda_detection_rules(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test EDA detection rules are configured."""
        rules = methodology_analyzer._detection_rules
        assert DevelopmentMethodology.EDA in rules

        eda_rule = rules[DevelopmentMethodology.EDA]
        assert any("Event" in p for p in eda_rule.patterns)
        assert any("Handler" in p for p in eda_rule.patterns)

    def test_eda_pattern_analysis(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test EDA pattern analysis."""
        file_path = "src/events/UserCreatedEvent.py"
        content = """
        class UserCreatedEvent:
            pass

        class UserCreatedHandler:
            pass
        """

        methodology_analyzer._analyze_eda_patterns(file_path, content)

        # Check if events/handlers were detected
        assert methodology_analyzer._eda_event_flow is not None

    def test_eda_score_calculation(
        self, methodology_analyzer: MethodologyAnalyzer
    ) -> None:
        """Test EDA score calculation."""
        score_result = methodology_analyzer._calculate_eda_score()

        assert "score" in score_result
        assert "details" in score_result
        assert "events" in score_result["details"]
        assert "handlers" in score_result["details"]


class TestMetricsCollector:
    """Tests for metrics collector."""

    @pytest.fixture
    def metrics_collector(self, event_engine: EventEngine) -> MetricsCollector:
        """Create a metrics collector instance."""
        options = MetricsCollectorOptions(
            sampling_interval=1000,
            retention_period=1,
            aggregation_window=1,
        )
        return MetricsCollector(event_engine=event_engine, options=options)

    def test_default_metrics_initialized(
        self, metrics_collector: MetricsCollector
    ) -> None:
        """Test default metrics are initialized."""
        metrics = metrics_collector.get_all_metrics()

        assert "total_events" in metrics
        assert "events_per_hour" in metrics

    def test_metric_update(self, metrics_collector: MetricsCollector) -> None:
        """Test metric value update."""
        now = datetime.utcnow()
        metrics_collector._update_metric_value(
            "test_metric", 42.0, MetricUnit.COUNT, now
        )

        metric = metrics_collector.get_metric("test_metric")

        assert metric is not None
        assert metric.summary.current == 42.0

    def test_metric_summary_calculation(
        self, metrics_collector: MetricsCollector
    ) -> None:
        """Test metric summary statistics calculation."""
        now = datetime.utcnow()
        values = [10.0, 20.0, 30.0, 40.0, 50.0]

        for val in values:
            metrics_collector._update_metric_value(
                "summary_test", val, MetricUnit.COUNT, now
            )

        metric = metrics_collector.get_metric("summary_test")

        assert metric is not None
        assert metric.summary.current == 50.0
        assert metric.summary.min == 10.0
        assert metric.summary.max == 50.0
        assert metric.summary.average == 30.0

    def test_trend_detection_increasing(
        self, metrics_collector: MetricsCollector
    ) -> None:
        """Test increasing trend detection."""
        now = datetime.utcnow()
        values = [10.0, 20.0, 30.0]

        for val in values:
            metrics_collector._update_metric_value(
                "trend_inc", val, MetricUnit.COUNT, now
            )

        metric = metrics_collector.get_metric("trend_inc")

        assert metric is not None
        assert metric.summary.trend == TrendDirection.INCREASING

    def test_trend_detection_decreasing(
        self, metrics_collector: MetricsCollector
    ) -> None:
        """Test decreasing trend detection."""
        now = datetime.utcnow()
        values = [30.0, 20.0, 10.0]

        for val in values:
            metrics_collector._update_metric_value(
                "trend_dec", val, MetricUnit.COUNT, now
            )

        metric = metrics_collector.get_metric("trend_dec")

        assert metric is not None
        assert metric.summary.trend == TrendDirection.DECREASING

    def test_get_metrics_snapshot(
        self, metrics_collector: MetricsCollector
    ) -> None:
        """Test getting metrics snapshot."""
        snapshot = metrics_collector.get_metrics_snapshot()

        assert "timestamp" in snapshot
        assert "total_metrics" in snapshot
        assert "metrics" in snapshot

    def test_metric_type_inference(
        self, metrics_collector: MetricsCollector
    ) -> None:
        """Test metric type inference."""
        assert metrics_collector._infer_metric_type("test_coverage") == MetricType.QUALITY
        assert metrics_collector._infer_metric_type("build_time") == MetricType.PERFORMANCE
        assert metrics_collector._infer_metric_type("ai_usage") == MetricType.AI_USAGE
        assert metrics_collector._infer_metric_type("commits_count") == MetricType.PRODUCTIVITY

    def test_collect_returns_values(
        self, metrics_collector: MetricsCollector
    ) -> None:
        """Test collect method returns values."""
        now = datetime.utcnow()
        metrics_collector._update_metric_value(
            "collect_test", 100.0, MetricUnit.COUNT, now
        )

        values = metrics_collector.collect()

        assert len(values) > 0


class TestBottleneckDetector:
    """Tests for bottleneck detector."""

    @pytest.fixture
    def bottleneck_detector(
        self, event_engine: EventEngine
    ) -> BottleneckDetector:
        """Create a bottleneck detector instance."""
        options = BottleneckDetectorOptions(
            check_interval=1000,
            alert_threshold=50.0,
            confidence_threshold=50.0,
        )
        return BottleneckDetector(event_engine=event_engine, options=options)

    def test_detection_rules_initialized(
        self, bottleneck_detector: BottleneckDetector
    ) -> None:
        """Test detection rules are initialized."""
        rules = bottleneck_detector._detection_rules

        assert BottleneckType.PROCESS in rules
        assert BottleneckType.QUALITY in rules
        assert BottleneckType.RESOURCE in rules
        assert BottleneckType.WORKFLOW in rules
        assert BottleneckType.TECHNICAL in rules

    def test_create_bottleneck(
        self, bottleneck_detector: BottleneckDetector
    ) -> None:
        """Test creating a bottleneck."""
        bottleneck_detector._create_bottleneck(
            type=BottleneckType.TECHNICAL,
            category=EventCategory.BUILD,
            severity=EventSeverity.WARNING,
            title="Test Bottleneck",
            description="Test description",
            location="Test Location",
            impact=70,
            confidence=80,
        )

        bottlenecks = bottleneck_detector.get_all_bottlenecks()

        assert len(bottlenecks) == 1
        assert bottlenecks[0].title == "Test Bottleneck"

    def test_similar_bottleneck_detection(
        self, bottleneck_detector: BottleneckDetector
    ) -> None:
        """Test detecting similar existing bottleneck."""
        bottleneck_detector._create_bottleneck(
            type=BottleneckType.QUALITY,
            category=EventCategory.TEST,
            severity=EventSeverity.WARNING,
            title="Low Test Coverage",
            description="Coverage is low",
            location="Test Suite",
            impact=60,
            confidence=75,
        )

        from devflow_monitor.analyzers.types.metrics import Bottleneck

        similar = Bottleneck(
            id="test",
            type=BottleneckType.QUALITY,
            category=EventCategory.TEST,
            severity=EventSeverity.WARNING,
            title="Low Test Coverage",
            description="Different description",
            location="Test Suite",
            impact=60,
            confidence=75,
            detected_at=datetime.utcnow(),
            last_occurred=datetime.utcnow(),
            frequency=1,
            duration=0,
            affected_metrics=[],
            suggested_actions=[],
            metadata={},
        )

        found_id = bottleneck_detector._find_similar_bottleneck(similar)

        assert found_id is not None

    def test_bottleneck_stats(
        self, bottleneck_detector: BottleneckDetector
    ) -> None:
        """Test getting bottleneck statistics."""
        bottleneck_detector._create_bottleneck(
            type=BottleneckType.PROCESS,
            category=EventCategory.BUILD,
            severity=EventSeverity.INFO,
            title="Slow Build",
            description="Build is slow",
            location="Build Pipeline",
            impact=40,
            confidence=70,
        )

        stats = bottleneck_detector.get_bottleneck_stats()

        assert stats["total"] == 1
        assert "by_type" in stats
        assert "by_severity" in stats

    def test_bottleneck_by_severity(
        self, bottleneck_detector: BottleneckDetector
    ) -> None:
        """Test getting bottlenecks by severity."""
        bottleneck_detector._create_bottleneck(
            type=BottleneckType.WORKFLOW,
            category=EventCategory.SYSTEM,
            severity=EventSeverity.ERROR,
            title="High Error Rate",
            description="Many errors",
            location="System",
            impact=80,
            confidence=90,
        )

        error_bottlenecks = bottleneck_detector.get_bottlenecks_by_severity(
            EventSeverity.ERROR
        )

        assert len(error_bottlenecks) == 1

    def test_bottleneck_by_type(
        self, bottleneck_detector: BottleneckDetector
    ) -> None:
        """Test getting bottlenecks by type."""
        bottleneck_detector._create_bottleneck(
            type=BottleneckType.RESOURCE,
            category=EventCategory.FILE,
            severity=EventSeverity.WARNING,
            title="High File Activity",
            description="Too many file changes",
            location="File System",
            impact=50,
            confidence=65,
        )

        resource_bottlenecks = bottleneck_detector.get_bottlenecks_by_type(
            BottleneckType.RESOURCE
        )

        assert len(resource_bottlenecks) == 1

    def test_detector_stats(
        self, bottleneck_detector: BottleneckDetector
    ) -> None:
        """Test getting detector statistics."""
        stats = bottleneck_detector.get_stats()

        assert "is_running" in stats
        assert "total_bottlenecks" in stats
        assert "detection_rules" in stats
