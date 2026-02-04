"""
Methodology Monitoring Type Definitions.

This module defines types for tracking development methodologies:
- DDD (Domain-Driven Design)
- TDD (Test-Driven Development)
- BDD (Behavior-Driven Development)
- EDA (Event-Driven Architecture)
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class DevelopmentMethodology(str, Enum):
    """Supported development methodologies."""

    DDD = "DDD"  # Domain-Driven Design
    TDD = "TDD"  # Test-Driven Development
    BDD = "BDD"  # Behavior-Driven Development
    EDA = "EDA"  # Event-Driven Architecture


class DDDPattern(str, Enum):
    """DDD (Domain-Driven Design) patterns."""

    DOMAIN_MODEL = "domain_model"
    BOUNDED_CONTEXT = "bounded_context"
    AGGREGATE = "aggregate"
    VALUE_OBJECT = "value_object"
    ENTITY = "entity"
    REPOSITORY = "repository"
    SERVICE = "service"
    FACTORY = "factory"
    UBIQUITOUS_LANGUAGE = "ubiquitous_language"


class TDDCycle(str, Enum):
    """TDD (Test-Driven Development) cycle phases."""

    RED = "red"  # Write failing test
    GREEN = "green"  # Write minimal code to pass
    REFACTOR = "refactor"  # Improve code


class BDDElement(str, Enum):
    """BDD (Behavior-Driven Development) elements."""

    FEATURE = "feature"
    SCENARIO = "scenario"
    GIVEN = "given"
    WHEN = "when"
    THEN = "then"
    AND = "and"
    BUT = "but"


class EDAPattern(str, Enum):
    """EDA (Event-Driven Architecture) patterns."""

    EVENT = "event"
    EVENT_HANDLER = "event_handler"
    EVENT_STORE = "event_store"
    SAGA = "saga"
    CQRS = "cqrs"
    EVENT_SOURCING = "event_sourcing"
    COMMAND = "command"
    QUERY = "query"
    PROJECTION = "projection"


class MethodologyDetection(BaseModel):
    """
    Methodology detection result.

    Records when a methodology pattern is detected in the codebase.

    Attributes:
        methodology: The detected methodology.
        pattern: Specific pattern detected (if applicable).
        confidence: Detection confidence (0-1).
        evidence: List of evidence strings.
        timestamp: Detection timestamp.
        file_path: File where detected.
        code_snippet: Relevant code snippet.
    """

    methodology: DevelopmentMethodology
    pattern: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    file_path: str | None = None
    code_snippet: str | None = None


class MethodologyScore(BaseModel):
    """
    Methodology compliance score.

    Evaluates how well the codebase follows a methodology.

    Attributes:
        methodology: The methodology being scored.
        score: Score from 0-100.
        strengths: List of strengths.
        weaknesses: List of weaknesses.
        recommendations: Improvement recommendations.
        details: Additional score details.
    """

    methodology: DevelopmentMethodology
    score: int = Field(ge=0, le=100)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class MethodologyTrend(BaseModel):
    """
    Methodology usage trend.

    Tracks usage patterns over time.

    Attributes:
        methodology: The methodology being tracked.
        usage: Hourly usage counts.
        time_window: Time window for measurements.
        growth: Growth rate percentage.
    """

    methodology: DevelopmentMethodology
    usage: list[int] = Field(default_factory=list)
    time_window: Literal["hour", "day", "week"] = "hour"
    growth: int = 0  # percentage


class MethodologyAnalysisResult(BaseModel):
    """
    Complete methodology analysis result.

    Attributes:
        timestamp: Analysis timestamp.
        detections: List of methodology detections.
        scores: Scores for each methodology.
        overall_score: Overall methodology score.
        dominant_methodology: Most used methodology.
        trends: Usage trends.
    """

    timestamp: datetime = Field(default_factory=datetime.utcnow)
    detections: list[MethodologyDetection] = Field(default_factory=list)
    scores: dict[DevelopmentMethodology, MethodologyScore] = Field(
        default_factory=dict
    )
    overall_score: int = Field(ge=0, le=100, default=0)
    dominant_methodology: DevelopmentMethodology | None = None
    trends: list[MethodologyTrend] = Field(default_factory=list)


class MethodologyDetectionRule(BaseModel):
    """
    Methodology detection rule.

    Defines rules for detecting a specific methodology.

    Attributes:
        methodology: The methodology to detect.
        patterns: Regex patterns to match.
        file_patterns: Glob patterns for files.
        required_keywords: Required keywords.
        exclude_keywords: Keywords to exclude.
        min_confidence: Minimum confidence threshold.
    """

    methodology: DevelopmentMethodology
    patterns: list[str] = Field(default_factory=list)
    file_patterns: list[str] | None = None
    required_keywords: list[str] | None = None
    exclude_keywords: list[str] | None = None
    min_confidence: float = Field(ge=0.0, le=1.0, default=0.6)


# TDD State Types


class TDDCycleState(BaseModel):
    """
    TDD cycle state.

    Tracks the current state of TDD development.

    Attributes:
        current_phase: Current TDD phase.
        phase_start_time: When current phase started.
        test_count: Total number of tests.
        failing_tests: Number of failing tests.
        passing_tests: Number of passing tests.
        coverage: Test coverage percentage.
        cycle_count: Number of completed cycles.
        average_cycle_time: Average cycle time in ms.
    """

    current_phase: TDDCycle = TDDCycle.RED
    phase_start_time: datetime = Field(default_factory=datetime.utcnow)
    test_count: int = 0
    failing_tests: int = 0
    passing_tests: int = 0
    coverage: float = 0.0
    cycle_count: int = 0
    average_cycle_time: int = 0  # milliseconds


# DDD Context Types


class BoundedContextInfo(BaseModel):
    """Information about a DDD bounded context."""

    name: str
    path: str
    entities: list[str] = Field(default_factory=list)
    value_objects: list[str] = Field(default_factory=list)
    services: list[str] = Field(default_factory=list)
    repositories: list[str] = Field(default_factory=list)


class ContextRelationship(BaseModel):
    """Relationship between bounded contexts."""

    from_context: str
    to_context: str
    type: Literal[
        "shared_kernel",
        "customer_supplier",
        "conformist",
        "anticorruption_layer",
        "open_host_service",
        "published_language",
    ]


class AggregateInfo(BaseModel):
    """Information about a DDD aggregate."""

    name: str
    root_entity: str
    entities: list[str] = Field(default_factory=list)
    value_objects: list[str] = Field(default_factory=list)
    domain_events: list[str] = Field(default_factory=list)


class DDDContextMap(BaseModel):
    """
    DDD context map.

    Maps the bounded contexts and their relationships.

    Attributes:
        bounded_contexts: Map of bounded contexts.
        relationships: Context relationships.
        ubiquitous_terms: Set of ubiquitous language terms.
        aggregates: Map of aggregates.
    """

    bounded_contexts: dict[str, BoundedContextInfo] = Field(default_factory=dict)
    relationships: list[ContextRelationship] = Field(default_factory=list)
    ubiquitous_terms: set[str] = Field(default_factory=set)
    aggregates: dict[str, AggregateInfo] = Field(default_factory=dict)


# BDD Types


class BDDStep(BaseModel):
    """BDD scenario step."""

    type: BDDElement
    text: str
    parameters: dict[str, Any] | None = None
    status: Literal["pending", "passing", "failing", "skipped"] | None = None


class BDDScenario(BaseModel):
    """
    BDD scenario information.

    Attributes:
        feature: Feature name.
        scenario: Scenario name.
        steps: Scenario steps.
        tags: Scenario tags.
        status: Scenario status.
        file_path: File path.
    """

    feature: str
    scenario: str
    steps: list[BDDStep] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    status: Literal["pending", "passing", "failing", "skipped"] = "pending"
    file_path: str


# EDA Types


class EventInfo(BaseModel):
    """Information about an EDA event."""

    name: str
    type: Literal["command", "domain_event", "integration_event"]
    schema: dict[str, Any] | None = None
    producers: list[str] = Field(default_factory=list)
    consumers: list[str] = Field(default_factory=list)


class HandlerInfo(BaseModel):
    """Information about an event handler."""

    name: str
    event_types: list[str] = Field(default_factory=list)
    handler_type: Literal["sync", "async", "saga"] = "sync"
    file_path: str


class SagaInfo(BaseModel):
    """Information about a saga."""

    name: str
    steps: list[str] = Field(default_factory=list)
    compensations: list[str] = Field(default_factory=list)
    status: Literal["active", "completed", "compensating", "failed"] = "active"


class EventFlowEdge(BaseModel):
    """Edge in event flow graph."""

    from_node: str
    to_node: str
    event_type: str
    is_async: bool = False


class EDAEventFlow(BaseModel):
    """
    EDA event flow information.

    Tracks events, handlers, and sagas in the system.

    Attributes:
        events: Map of events.
        handlers: Map of handlers.
        sagas: Map of sagas.
        event_flows: Event flow edges.
    """

    events: dict[str, EventInfo] = Field(default_factory=dict)
    handlers: dict[str, HandlerInfo] = Field(default_factory=dict)
    sagas: dict[str, SagaInfo] = Field(default_factory=dict)
    event_flows: list[EventFlowEdge] = Field(default_factory=list)
