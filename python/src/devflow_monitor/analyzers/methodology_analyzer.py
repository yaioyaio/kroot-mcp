"""
Development Methodology Analyzer.

Analyzes codebase for DDD, TDD, BDD, and EDA methodology compliance.
Provides scoring, pattern detection, and recommendations.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Callable

from ..events.engine import EventEngine, get_event_engine
from ..events.types.base import BaseEvent, EventCategory
from ..events.types.file import FileChangeAction
from ..events.types.git import GitEventType
from .types.methodology import (
    AggregateInfo,
    BDDElement,
    BDDScenario,
    BDDStep,
    BoundedContextInfo,
    DDDContextMap,
    DDDPattern,
    DevelopmentMethodology,
    EDAEventFlow,
    EDAPattern,
    EventFlowEdge,
    EventInfo,
    HandlerInfo,
    MethodologyAnalysisResult,
    MethodologyDetection,
    MethodologyDetectionRule,
    MethodologyScore,
    MethodologyTrend,
    SagaInfo,
    TDDCycle,
    TDDCycleState,
)


class MethodologyAnalyzer:
    """
    Methodology analyzer.

    Detects and scores DDD, TDD, BDD, and EDA patterns in the codebase.
    """

    DETECTION_WINDOW = 3600000  # 1 hour in milliseconds
    CONFIDENCE_THRESHOLD = 0.6

    def __init__(self, event_engine: EventEngine | None = None):
        """
        Initialize the methodology analyzer.

        Args:
            event_engine: Optional event engine instance.
        """
        self._event_engine = event_engine or get_event_engine()
        self._detections: list[MethodologyDetection] = []
        self._detection_rules: dict[DevelopmentMethodology, MethodologyDetectionRule] = {}
        self._tdd_state = self._initialize_tdd_state()
        self._ddd_context = self._initialize_ddd_context()
        self._bdd_scenarios: dict[str, BDDScenario] = {}
        self._eda_event_flow = self._initialize_eda_event_flow()
        self._methodology_scores: dict[DevelopmentMethodology, MethodologyScore] = {}
        self._listeners: dict[str, list[Callable]] = {}
        self._subscription_id: str | None = None

        self._initialize_detection_rules()
        self._initialize_scores()

    def start(self) -> None:
        """Start the analyzer and subscribe to events."""
        self._subscription_id = self._event_engine.subscribe(
            "*",
            self._handle_event,
        )

    def stop(self) -> None:
        """Stop the analyzer."""
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

    def _initialize_detection_rules(self) -> None:
        """Initialize methodology detection rules."""
        # DDD detection rules
        self._detection_rules[DevelopmentMethodology.DDD] = MethodologyDetectionRule(
            methodology=DevelopmentMethodology.DDD,
            patterns=[
                r"class\s+\w+Entity",
                r"class\s+\w+Aggregate",
                r"class\s+\w+ValueObject",
                r"class\s+\w+Repository",
                r"class\s+\w+DomainService",
                r"interface\s+\w+Repository",
                r"BoundedContext",
                r"DomainEvent",
                r"AggregateRoot",
            ],
            file_patterns=[
                "**/domain/**",
                "**/entities/**",
                "**/aggregates/**",
                "**/value-objects/**",
            ],
            required_keywords=["domain", "entity", "aggregate", "valueObject", "repository"],
            min_confidence=0.7,
        )

        # TDD detection rules
        self._detection_rules[DevelopmentMethodology.TDD] = MethodologyDetectionRule(
            methodology=DevelopmentMethodology.TDD,
            patterns=[
                r"describe\s*\(",
                r"test\s*\(",
                r"it\s*\(",
                r"expect\s*\(",
                r"assert\.",
                r"should\.",
                r"\.to\.",
            ],
            file_patterns=[
                "**/*.test.*",
                "**/*.spec.*",
                "**/test/**",
                "**/tests/**",
                "**/__tests__/**",
            ],
            required_keywords=["test", "expect", "assert", "describe"],
            min_confidence=0.6,
        )

        # BDD detection rules
        self._detection_rules[DevelopmentMethodology.BDD] = MethodologyDetectionRule(
            methodology=DevelopmentMethodology.BDD,
            patterns=[
                r"Feature:",
                r"Scenario:",
                r"Given\s+",
                r"When\s+",
                r"Then\s+",
                r"And\s+",
                r"But\s+",
                r"@given",
                r"@when",
                r"@then",
            ],
            file_patterns=[
                "**/*.feature",
                "**/*.story",
                "**/features/**",
                "**/stories/**",
            ],
            required_keywords=["feature", "scenario", "given", "when", "then"],
            min_confidence=0.8,
        )

        # EDA detection rules
        self._detection_rules[DevelopmentMethodology.EDA] = MethodologyDetectionRule(
            methodology=DevelopmentMethodology.EDA,
            patterns=[
                r"class\s+\w+Event",
                r"class\s+\w+Handler",
                r"class\s+\w+Saga",
                r"EventStore",
                r"EventBus",
                r"CommandHandler",
                r"QueryHandler",
                r"emit\s*\(",
                r"publish\s*\(",
                r"subscribe\s*\(",
            ],
            file_patterns=[
                "**/events/**",
                "**/handlers/**",
                "**/sagas/**",
                "**/cqrs/**",
            ],
            required_keywords=["event", "handler", "saga", "command", "query"],
            min_confidence=0.7,
        )

    def _initialize_tdd_state(self) -> TDDCycleState:
        """Initialize TDD cycle state."""
        return TDDCycleState(
            current_phase=TDDCycle.RED,
            phase_start_time=datetime.utcnow(),
            test_count=0,
            failing_tests=0,
            passing_tests=0,
            coverage=0.0,
            cycle_count=0,
            average_cycle_time=0,
        )

    def _initialize_ddd_context(self) -> DDDContextMap:
        """Initialize DDD context map."""
        return DDDContextMap(
            bounded_contexts={},
            relationships=[],
            ubiquitous_terms=set(),
            aggregates={},
        )

    def _initialize_eda_event_flow(self) -> EDAEventFlow:
        """Initialize EDA event flow."""
        return EDAEventFlow(
            events={},
            handlers={},
            sagas={},
            event_flows=[],
        )

    def _initialize_scores(self) -> None:
        """Initialize methodology scores."""
        for methodology in DevelopmentMethodology:
            self._methodology_scores[methodology] = MethodologyScore(
                methodology=methodology,
                score=0,
                strengths=[],
                weaknesses=[],
                recommendations=[],
                details={},
            )

    async def _handle_event(self, event: BaseEvent) -> None:
        """Handle incoming events."""
        await self.analyze_event(event)

    async def analyze_event(self, event: BaseEvent) -> None:
        """
        Analyze an event for methodology patterns.

        Args:
            event: The event to analyze.
        """
        if event.category == EventCategory.FILE:
            await self._analyze_file_event(event)
        elif event.category == EventCategory.GIT:
            await self._analyze_git_event(event)
        elif event.category == EventCategory.TEST:
            await self._analyze_test_event(event)

        self._update_scores()

    async def _analyze_file_event(self, event: BaseEvent) -> None:
        """Analyze file event for methodology patterns."""
        data = event.data
        action = data.get("action")
        if action not in (FileChangeAction.ADD.value, FileChangeAction.CHANGE.value):
            return

        new_file = data.get("new_file", {})
        file_path = new_file.get("path", "")
        if not file_path:
            return

        # Note: In real implementation, content would be read from file system
        content = ""

        for methodology, rule in self._detection_rules.items():
            detection = self._detect_methodology(file_path, content, rule)
            if detection and detection.confidence >= self.CONFIDENCE_THRESHOLD:
                self._add_detection(detection)
                self.emit("methodology_detected", detection)

                # Methodology-specific analysis
                if methodology == DevelopmentMethodology.DDD:
                    self._analyze_ddd_patterns(file_path, content)
                elif methodology == DevelopmentMethodology.TDD:
                    self._analyze_tdd_patterns(file_path, content)
                elif methodology == DevelopmentMethodology.BDD:
                    self._analyze_bdd_patterns(file_path, content)
                elif methodology == DevelopmentMethodology.EDA:
                    self._analyze_eda_patterns(file_path, content)

    async def _analyze_git_event(self, event: BaseEvent) -> None:
        """Analyze git event for methodology patterns."""
        if event.type == GitEventType.COMMIT_CREATED.value:
            commit = event.data.get("commit", {})
            message = commit.get("message", "")

            # TDD commit patterns
            if re.search(r"test|spec|failing|passing|refactor", message, re.IGNORECASE):
                self._update_tdd_cycle(message)

            # BDD commit patterns
            if re.search(r"feature|scenario|given|when|then", message, re.IGNORECASE):
                detection = MethodologyDetection(
                    methodology=DevelopmentMethodology.BDD,
                    confidence=0.6,
                    evidence=[f"Commit message: {message}"],
                )
                self._add_detection(detection)

    async def _analyze_test_event(self, event: BaseEvent) -> None:
        """Analyze test event for TDD cycle."""
        data = event.data
        passed = data.get("passed")
        failed = data.get("failed")

        if passed is not None and failed is not None:
            self._tdd_state.passing_tests = passed
            self._tdd_state.failing_tests = failed
            self._tdd_state.test_count = passed + failed

            # TDD cycle transition
            if self._tdd_state.current_phase == TDDCycle.RED and failed == 0:
                self._transition_tdd_phase(TDDCycle.GREEN)
            elif self._tdd_state.current_phase == TDDCycle.GREEN and failed > 0:
                self._transition_tdd_phase(TDDCycle.RED)

    def _detect_methodology(
        self,
        file_path: str,
        content: str,
        rule: MethodologyDetectionRule,
    ) -> MethodologyDetection | None:
        """Detect methodology from file."""
        confidence = 0.0
        evidence: list[str] = []

        # File pattern check
        if rule.file_patterns:
            for pattern in rule.file_patterns:
                if self._match_glob_pattern(file_path, pattern):
                    confidence += 0.2
                    evidence.append(f"File path matches: {pattern}")
                    break

        # Content pattern check
        pattern_matches = 0
        for pattern in rule.patterns:
            if re.search(pattern, content):
                pattern_matches += 1
                evidence.append(f"Pattern found: {pattern}")

        if pattern_matches > 0:
            confidence += min(0.6, pattern_matches * 0.15)

        # Keyword check
        if rule.required_keywords:
            keyword_matches = 0
            content_lower = content.lower()
            for keyword in rule.required_keywords:
                if keyword.lower() in content_lower:
                    keyword_matches += 1
            confidence += min(0.2, keyword_matches * 0.05)

        # Exclude keyword check
        if rule.exclude_keywords:
            content_lower = content.lower()
            for keyword in rule.exclude_keywords:
                if keyword.lower() in content_lower:
                    confidence -= 0.1

        if confidence < rule.min_confidence:
            return None

        return MethodologyDetection(
            methodology=rule.methodology,
            confidence=confidence,
            evidence=evidence,
            file_path=file_path,
        )

    def _analyze_ddd_patterns(self, file_path: str, content: str) -> None:
        """Analyze DDD patterns in content."""
        # Entity detection
        entity_matches = re.findall(r"class\s+(\w+)Entity", content)
        for match in entity_matches:
            self._update_ddd_context("entity", match, file_path)

        # Aggregate detection
        aggregate_matches = re.findall(r"class\s+(\w+)Aggregate", content)
        for match in aggregate_matches:
            self._update_ddd_context("aggregate", match, file_path)

        # Repository detection
        repo_matches = re.findall(r"(?:class|interface)\s+(\w+)Repository", content)
        for match in repo_matches:
            self._update_ddd_context("repository", match, file_path)

        self.emit("ddd_pattern_found", DDDPattern.DOMAIN_MODEL, self._ddd_context)

    def _analyze_tdd_patterns(self, file_path: str, content: str) -> None:
        """Analyze TDD patterns in content."""
        # Test count
        test_matches = re.findall(r"(?:test|it|describe)\s*\(", content)
        if test_matches:
            self._tdd_state.test_count += len(test_matches)

        # Coverage from comments
        coverage_match = re.search(r"coverage:\s*(\d+)%", content)
        if coverage_match:
            self._tdd_state.coverage = float(coverage_match.group(1))

    def _analyze_bdd_patterns(self, file_path: str, content: str) -> None:
        """Analyze BDD patterns in content."""
        feature_match = re.search(r"Feature:\s*(.+)", content)
        if feature_match:
            feature_name = feature_match.group(1).strip()

            # Parse scenarios
            scenarios = content.split("Scenario:")
            for scenario_text in scenarios[1:]:
                lines = scenario_text.split("\n")
                scenario_name = lines[0].strip() if lines else ""
                steps = self._parse_bdd_steps(scenario_text)

                scenario = BDDScenario(
                    feature=feature_name,
                    scenario=scenario_name,
                    steps=steps,
                    tags=[],
                    status="pending",
                    file_path=file_path,
                )

                key = f"{feature_name}:{scenario_name}"
                self._bdd_scenarios[key] = scenario
                self.emit("bdd_scenario_updated", scenario)

    def _analyze_eda_patterns(self, file_path: str, content: str) -> None:
        """Analyze EDA patterns in content."""
        # Event class detection
        event_matches = re.findall(r"class\s+(\w+Event)", content)
        for event_name in event_matches:
            self._eda_event_flow.events[event_name] = EventInfo(
                name=event_name,
                type="domain_event",
                producers=[],
                consumers=[],
            )

        # Handler class detection
        handler_matches = re.findall(r"class\s+(\w+Handler)", content)
        for handler_name in handler_matches:
            self._eda_event_flow.handlers[handler_name] = HandlerInfo(
                name=handler_name,
                event_types=[],
                handler_type="sync",
                file_path=file_path,
            )

        # Saga class detection
        saga_matches = re.findall(r"class\s+(\w+Saga)", content)
        for saga_name in saga_matches:
            self._eda_event_flow.sagas[saga_name] = SagaInfo(
                name=saga_name,
                steps=[],
                compensations=[],
                status="active",
            )

        self.emit("eda_event_flow_changed", self._eda_event_flow)

    def _parse_bdd_steps(self, scenario_text: str) -> list[BDDStep]:
        """Parse BDD steps from scenario text."""
        steps: list[BDDStep] = []
        step_patterns = [
            (BDDElement.GIVEN, r"Given\s+(.+)"),
            (BDDElement.WHEN, r"When\s+(.+)"),
            (BDDElement.THEN, r"Then\s+(.+)"),
            (BDDElement.AND, r"And\s+(.+)"),
            (BDDElement.BUT, r"But\s+(.+)"),
        ]

        for line in scenario_text.split("\n"):
            for step_type, pattern in step_patterns:
                match = re.search(pattern, line)
                if match:
                    steps.append(
                        BDDStep(
                            type=step_type,
                            text=match.group(1).strip(),
                        )
                    )
                    break

        return steps

    def _update_ddd_context(
        self,
        element_type: str,
        name: str,
        file_path: str,
    ) -> None:
        """Update DDD context with new element."""
        context_name = self._infer_bounded_context(file_path)

        if context_name not in self._ddd_context.bounded_contexts:
            context_path = "/".join(file_path.split("/")[:-1])
            self._ddd_context.bounded_contexts[context_name] = BoundedContextInfo(
                name=context_name,
                path=context_path,
                entities=[],
                value_objects=[],
                services=[],
                repositories=[],
            )

        context = self._ddd_context.bounded_contexts[context_name]
        if element_type == "entity" and name not in context.entities:
            context.entities.append(name)
        elif element_type == "repository" and name not in context.repositories:
            context.repositories.append(name)
        elif element_type == "service" and name not in context.services:
            context.services.append(name)

        # Extract ubiquitous language terms
        words = re.findall(r"[A-Z][a-z]+", name)
        self._ddd_context.ubiquitous_terms.update(words)

    def _infer_bounded_context(self, file_path: str) -> str:
        """Infer bounded context from file path."""
        parts = file_path.split("/")
        for i, part in enumerate(parts):
            if part in ("domain", "domains") and i < len(parts) - 1:
                return parts[i + 1]
        return "default"

    def _transition_tdd_phase(self, new_phase: TDDCycle) -> None:
        """Transition TDD phase."""
        old_phase = self._tdd_state.current_phase
        now = datetime.utcnow()
        phase_duration = int(
            (now - self._tdd_state.phase_start_time).total_seconds() * 1000
        )

        self._tdd_state.current_phase = new_phase
        self._tdd_state.phase_start_time = now

        # Cycle completion detection
        if old_phase == TDDCycle.REFACTOR and new_phase == TDDCycle.RED:
            self._tdd_state.cycle_count += 1
            total_time = (
                self._tdd_state.average_cycle_time * (self._tdd_state.cycle_count - 1)
                + phase_duration
            )
            self._tdd_state.average_cycle_time = (
                total_time // self._tdd_state.cycle_count
            )

        self.emit("tdd_cycle_changed", self._tdd_state)

    def _update_tdd_cycle(self, message: str) -> None:
        """Update TDD cycle based on commit message."""
        if re.search(r"failing test|red", message, re.IGNORECASE):
            self._transition_tdd_phase(TDDCycle.RED)
        elif re.search(r"passing test|green", message, re.IGNORECASE):
            self._transition_tdd_phase(TDDCycle.GREEN)
        elif re.search(r"refactor", message, re.IGNORECASE):
            self._transition_tdd_phase(TDDCycle.REFACTOR)

    def _add_detection(self, detection: MethodologyDetection) -> None:
        """Add a methodology detection."""
        self._detections.append(detection)

        # Remove old detections
        cutoff = datetime.utcnow().timestamp() * 1000 - self.DETECTION_WINDOW
        self._detections = [
            d for d in self._detections
            if d.timestamp.timestamp() * 1000 > cutoff
        ]

    def _update_scores(self) -> None:
        """Update methodology scores."""
        for methodology in DevelopmentMethodology:
            score = self._calculate_methodology_score(methodology)
            self._methodology_scores[methodology] = score

        self.emit("score_updated", self._methodology_scores)

    def _calculate_methodology_score(
        self,
        methodology: DevelopmentMethodology,
    ) -> MethodologyScore:
        """Calculate score for a methodology."""
        cutoff = datetime.utcnow().timestamp() * 1000 - self.DETECTION_WINDOW
        recent_detections = [
            d for d in self._detections
            if d.methodology == methodology
            and d.timestamp.timestamp() * 1000 > cutoff
        ]

        score = 0
        strengths: list[str] = []
        weaknesses: list[str] = []
        recommendations: list[str] = []
        details: dict[str, Any] = {}

        if methodology == DevelopmentMethodology.DDD:
            result = self._calculate_ddd_score()
        elif methodology == DevelopmentMethodology.TDD:
            result = self._calculate_tdd_score()
        elif methodology == DevelopmentMethodology.BDD:
            result = self._calculate_bdd_score()
        elif methodology == DevelopmentMethodology.EDA:
            result = self._calculate_eda_score()
        else:
            result = {"score": 0, "strengths": [], "weaknesses": [], "recommendations": [], "details": {}}

        score = result["score"]
        strengths = result["strengths"]
        weaknesses = result["weaknesses"]
        recommendations = result["recommendations"]
        details = result["details"]

        # Detection frequency factor
        detection_frequency = len(recent_detections) / 10
        score = min(100, int(score * (0.7 + 0.3 * min(1, detection_frequency))))

        return MethodologyScore(
            methodology=methodology,
            score=score,
            strengths=strengths,
            weaknesses=weaknesses,
            recommendations=recommendations,
            details=details,
        )

    def _calculate_ddd_score(self) -> dict[str, Any]:
        """Calculate DDD score."""
        score = 0
        strengths: list[str] = []
        weaknesses: list[str] = []
        recommendations: list[str] = []

        # Bounded context evaluation
        context_count = len(self._ddd_context.bounded_contexts)
        if context_count > 0:
            score += min(20, context_count * 5)
            strengths.append(f"{context_count} bounded contexts defined")
        else:
            weaknesses.append("No bounded contexts identified")
            recommendations.append("Define clear bounded contexts for your domains")

        # Ubiquitous language evaluation
        term_count = len(self._ddd_context.ubiquitous_terms)
        if term_count > 10:
            score += 15
            strengths.append(f"Rich ubiquitous language with {term_count} terms")
        elif term_count > 5:
            score += 10
        else:
            weaknesses.append("Limited ubiquitous language")
            recommendations.append("Develop a comprehensive ubiquitous language")

        # Entity/Aggregate evaluation
        total_entities = 0
        for context in self._ddd_context.bounded_contexts.values():
            total_entities += len(context.entities)
        total_aggregates = len(self._ddd_context.aggregates)

        if total_entities > 0:
            score += min(20, total_entities * 2)
            strengths.append(f"{total_entities} entities modeled")

        if total_aggregates > 0:
            score += min(15, total_aggregates * 5)
            strengths.append(f"{total_aggregates} aggregates defined")
        else:
            weaknesses.append("No aggregate roots identified")
            recommendations.append("Define aggregate roots to maintain consistency boundaries")

        return {
            "score": score,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "recommendations": recommendations,
            "details": {
                "bounded_contexts": context_count,
                "entities": total_entities,
                "aggregates": total_aggregates,
                "ubiquitous_terms": term_count,
            },
        }

    def _calculate_tdd_score(self) -> dict[str, Any]:
        """Calculate TDD score."""
        score = 0
        strengths: list[str] = []
        weaknesses: list[str] = []
        recommendations: list[str] = []

        # Test count evaluation
        if self._tdd_state.test_count > 0:
            score += min(20, self._tdd_state.test_count // 5)
            strengths.append(f"{self._tdd_state.test_count} tests written")
        else:
            weaknesses.append("No tests found")
            recommendations.append("Start writing tests for your code")

        # Pass rate evaluation
        if self._tdd_state.test_count > 0:
            pass_rate = self._tdd_state.passing_tests / self._tdd_state.test_count
            score += int(pass_rate * 25)
            if pass_rate > 0.9:
                strengths.append(f"High test pass rate: {int(pass_rate * 100)}%")
            elif pass_rate < 0.7:
                weaknesses.append(f"Low test pass rate: {int(pass_rate * 100)}%")
                recommendations.append("Fix failing tests to maintain code quality")

        # Coverage evaluation
        if self._tdd_state.coverage > 0:
            score += min(25, int(self._tdd_state.coverage / 4))
            if self._tdd_state.coverage > 80:
                strengths.append(f"Excellent code coverage: {self._tdd_state.coverage}%")
            elif self._tdd_state.coverage < 60:
                weaknesses.append(f"Low code coverage: {self._tdd_state.coverage}%")
                recommendations.append("Increase test coverage to at least 80%")

        # Cycle evaluation
        if self._tdd_state.cycle_count > 0:
            score += min(20, self._tdd_state.cycle_count * 2)
            strengths.append(f"{self._tdd_state.cycle_count} TDD cycles completed")
        else:
            weaknesses.append("No complete TDD cycles detected")
            recommendations.append("Follow the red-green-refactor cycle")

        return {
            "score": score,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "recommendations": recommendations,
            "details": {
                "test_count": self._tdd_state.test_count,
                "passing_tests": self._tdd_state.passing_tests,
                "failing_tests": self._tdd_state.failing_tests,
                "coverage": self._tdd_state.coverage,
                "cycle_count": self._tdd_state.cycle_count,
                "current_phase": self._tdd_state.current_phase.value,
            },
        }

    def _calculate_bdd_score(self) -> dict[str, Any]:
        """Calculate BDD score."""
        score = 0
        strengths: list[str] = []
        weaknesses: list[str] = []
        recommendations: list[str] = []

        # Feature count
        features = set(s.feature for s in self._bdd_scenarios.values())
        if features:
            score += min(20, len(features) * 5)
            strengths.append(f"{len(features)} features defined")
        else:
            weaknesses.append("No BDD features found")
            recommendations.append("Create feature files to describe behavior")

        # Scenario count
        scenario_count = len(self._bdd_scenarios)
        if scenario_count > 0:
            score += min(25, scenario_count * 2)
            strengths.append(f"{scenario_count} scenarios written")

        # Status evaluation
        passing = sum(1 for s in self._bdd_scenarios.values() if s.status == "passing")
        failing = sum(1 for s in self._bdd_scenarios.values() if s.status == "failing")

        if passing > 0 and scenario_count > 0:
            pass_rate = passing / scenario_count
            score += int(pass_rate * 25)
            if pass_rate > 0.9:
                strengths.append("High scenario pass rate")

        if failing > 0:
            weaknesses.append(f"{failing} failing scenarios")
            recommendations.append("Fix failing scenarios to ensure behavior compliance")

        return {
            "score": score,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "recommendations": recommendations,
            "details": {
                "features": len(features),
                "scenarios": scenario_count,
                "passing": passing,
                "failing": failing,
            },
        }

    def _calculate_eda_score(self) -> dict[str, Any]:
        """Calculate EDA score."""
        score = 0
        strengths: list[str] = []
        weaknesses: list[str] = []
        recommendations: list[str] = []

        # Event count
        event_count = len(self._eda_event_flow.events)
        if event_count > 0:
            score += min(20, event_count * 2)
            strengths.append(f"{event_count} events defined")
        else:
            weaknesses.append("No events defined")
            recommendations.append("Define domain events for your system")

        # Handler count
        handler_count = len(self._eda_event_flow.handlers)
        if handler_count > 0:
            score += min(20, handler_count * 2)
            strengths.append(f"{handler_count} event handlers")
        else:
            weaknesses.append("No event handlers found")
            recommendations.append("Implement handlers for your events")

        # Saga count
        saga_count = len(self._eda_event_flow.sagas)
        if saga_count > 0:
            score += min(20, saga_count * 5)
            strengths.append(f"{saga_count} sagas implemented")

        # Event flow
        flow_count = len(self._eda_event_flow.event_flows)
        if flow_count > 0:
            score += min(20, flow_count)
            strengths.append("Event flows mapped")

        return {
            "score": score,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "recommendations": recommendations,
            "details": {
                "events": event_count,
                "handlers": handler_count,
                "sagas": saga_count,
                "event_flows": flow_count,
            },
        }

    def _match_glob_pattern(self, path: str, pattern: str) -> bool:
        """Match glob pattern against path."""
        regex_pattern = pattern.replace("**", ".*").replace("*", "[^/]*").replace("?", ".")
        return bool(re.search(regex_pattern, path))

    def analyze(self) -> MethodologyAnalysisResult:
        """
        Perform complete methodology analysis.

        Returns:
            Complete analysis result.
        """
        scores: dict[DevelopmentMethodology, MethodologyScore] = {}
        for methodology in DevelopmentMethodology:
            scores[methodology] = self._methodology_scores.get(
                methodology,
                MethodologyScore(methodology=methodology, score=0),
            )

        # Overall score
        method_scores = list(scores.values())
        overall_score = (
            sum(s.score for s in method_scores) // len(method_scores)
            if method_scores
            else 0
        )

        # Dominant methodology
        dominant_methodology: DevelopmentMethodology | None = None
        highest_score = 0
        for methodology, score in scores.items():
            if score.score > highest_score and score.score > 50:
                highest_score = score.score
                dominant_methodology = methodology

        # Trends
        trends = self._calculate_trends()

        return MethodologyAnalysisResult(
            timestamp=datetime.utcnow(),
            detections=self._detections,
            scores=scores,
            overall_score=overall_score,
            dominant_methodology=dominant_methodology,
            trends=trends,
        )

    def _calculate_trends(self) -> list[MethodologyTrend]:
        """Calculate methodology usage trends."""
        trends: list[MethodologyTrend] = []
        hourly_window = 3600000  # 1 hour in ms
        now = datetime.utcnow().timestamp() * 1000

        for methodology in DevelopmentMethodology:
            hourly_usage: list[int] = []

            for i in range(23, -1, -1):
                start_time = now - (i + 1) * hourly_window
                end_time = now - i * hourly_window

                count = sum(
                    1
                    for d in self._detections
                    if d.methodology == methodology
                    and start_time <= d.timestamp.timestamp() * 1000 < end_time
                )
                hourly_usage.append(count)

            # Growth rate
            recent = sum(hourly_usage[12:])
            previous = sum(hourly_usage[:12])
            growth = int((recent - previous) / previous * 100) if previous > 0 else 0

            trends.append(
                MethodologyTrend(
                    methodology=methodology,
                    usage=hourly_usage,
                    time_window="hour",
                    growth=growth,
                )
            )

        return trends

    def get_recommendations(self) -> list[str]:
        """Get all recommendations from methodology scores."""
        recommendations: list[str] = []
        for score in self._methodology_scores.values():
            recommendations.extend(score.recommendations)
        return recommendations

    def reset(self) -> None:
        """Reset analyzer state."""
        self._detections.clear()
        self._tdd_state = self._initialize_tdd_state()
        self._ddd_context = self._initialize_ddd_context()
        self._bdd_scenarios.clear()
        self._eda_event_flow = self._initialize_eda_event_flow()
        self._initialize_scores()


# Singleton instance
_methodology_analyzer: MethodologyAnalyzer | None = None


def get_methodology_analyzer() -> MethodologyAnalyzer:
    """Get the singleton methodology analyzer instance."""
    global _methodology_analyzer
    if _methodology_analyzer is None:
        _methodology_analyzer = MethodologyAnalyzer()
    return _methodology_analyzer
