"""
Development Stage Type Definitions.

This module defines the 13 development stages and coding sub-stages
that are automatically detected and tracked during the development process.

Development Process Flow:
    PRD -> PLANNING -> ERD -> WIREFRAME -> SCREEN_DESIGN -> DESIGN ->
    FRONTEND -> BACKEND -> AI_COLLABORATION -> CODING -> GIT_MANAGEMENT ->
    DEPLOYMENT -> OPERATION

AI Collaboration + Coding Sub-stages:
    USE_CASE -> EVENT_STORMING -> DOMAIN_MODELING -> USE_CASE_DETAIL ->
    AI_PROMPT_DESIGN -> INITIAL_IMPLEMENTATION -> BUSINESS_LOGIC ->
    REFACTORING -> UNIT_TEST -> INTEGRATION_TEST -> E2E_TEST
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class DevelopmentStage(str, Enum):
    """
    Development process 13 stages.

    Represents the complete software development lifecycle from
    requirements to production operation.
    """

    # Planning stages
    PRD = "prd"  # Product Requirements Document
    PLANNING = "planning"  # Planning document
    ERD = "erd"  # Entity Relationship Diagram
    WIREFRAME = "wireframe"  # Wireframe design
    SCREEN_DESIGN = "screen_design"  # Screen-level planning
    DESIGN = "design"  # Design work

    # Implementation stages
    FRONTEND = "frontend"  # Frontend development
    BACKEND = "backend"  # Backend development
    AI_COLLABORATION = "ai_collab"  # AI collaboration
    CODING = "coding"  # Actual coding

    # Deployment stages
    GIT_MANAGEMENT = "git"  # Git management
    DEPLOYMENT = "deployment"  # Deployment
    OPERATION = "operation"  # Operation


class CodingSubStage(str, Enum):
    """
    AI Collaboration + Coding sub-stages.

    Represents the detailed coding workflow steps from use case
    derivation through E2E testing.
    """

    USE_CASE = "use_case"  # UseCase derivation
    EVENT_STORMING = "event_storming"  # Event Storming
    DOMAIN_MODELING = "domain_modeling"  # Domain modeling
    USE_CASE_DETAIL = "use_case_detail"  # UseCase detailed design
    AI_PROMPT_DESIGN = "ai_prompt_design"  # AI prompt design
    INITIAL_IMPLEMENTATION = "initial_impl"  # Initial skeleton (AI)
    BUSINESS_LOGIC = "business_logic"  # Business logic implementation
    REFACTORING = "refactoring"  # Refactoring
    UNIT_TEST = "unit_test"  # Unit testing
    INTEGRATION_TEST = "integration_test"  # Integration testing
    E2E_TEST = "e2e_test"  # E2E testing


class StageTransition(BaseModel):
    """
    Stage transition event.

    Records when the development process transitions from one stage
    to another, including the confidence level and reason.

    Attributes:
        from_stage: Previous stage (None if starting).
        to_stage: New stage.
        timestamp: Transition timestamp.
        confidence: Detection confidence (0-1).
        reason: Reason for the transition.
        metadata: Additional transition metadata.
    """

    from_stage: DevelopmentStage | None = None
    to_stage: DevelopmentStage
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class StageActivityIndicator(BaseModel):
    """
    Activity indicator for stage detection.

    Represents a single piece of evidence used to detect the current
    development stage.

    Attributes:
        type: Type of indicator (file_pattern, git_commit, etc.).
        value: The actual value that was detected.
        timestamp: When the indicator was observed.
        source: Source of the indicator (file_event, git_event, etc.).
    """

    type: str
    value: Any
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    source: str


class StageActivity(BaseModel):
    """
    Stage activity information.

    Tracks activity within a development stage, including duration
    and confidence.

    Attributes:
        stage: The development stage.
        sub_stage: Optional coding sub-stage.
        start_time: When activity started.
        end_time: When activity ended (None if ongoing).
        duration: Duration in milliseconds (calculated).
        activities: List of activity indicators.
        confidence: Detection confidence.
    """

    stage: DevelopmentStage
    sub_stage: CodingSubStage | None = None
    start_time: datetime = Field(default_factory=datetime.utcnow)
    end_time: datetime | None = None
    duration: int | None = None  # milliseconds
    activities: list[StageActivityIndicator] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)

    def calculate_duration(self) -> int:
        """Calculate activity duration in milliseconds."""
        end = self.end_time or datetime.utcnow()
        return int((end - self.start_time).total_seconds() * 1000)


class StagePattern(BaseModel):
    """
    Pattern for stage detection.

    Defines a pattern used to detect a specific development stage.

    Attributes:
        type: Pattern type (file, git, api, event, content).
        pattern: The pattern string or regex.
        weight: Pattern weight for confidence calculation.
        description: Optional pattern description.
    """

    type: Literal["file", "git", "api", "event", "content"]
    pattern: str
    weight: float = Field(ge=0.0, le=1.0)
    description: str | None = None


class StageDetectionRule(BaseModel):
    """
    Stage detection rule.

    Defines rules for detecting a specific development stage based
    on patterns and confidence thresholds.

    Attributes:
        stage: The stage this rule detects.
        patterns: List of patterns for detection.
        required_confidence: Minimum confidence required.
    """

    stage: DevelopmentStage
    patterns: list[StagePattern]
    required_confidence: float = Field(ge=0.0, le=1.0)


class StageProgress(BaseModel):
    """
    Stage progress information.

    Tracks progress within a development stage.

    Attributes:
        stage: The development stage.
        progress: Progress percentage (0-100).
        completed_activities: List of completed activities.
        remaining_activities: List of remaining activities.
        estimated_time_remaining: Estimated time remaining in ms.
    """

    stage: DevelopmentStage
    progress: int = Field(ge=0, le=100)
    completed_activities: list[str] = Field(default_factory=list)
    remaining_activities: list[str] = Field(default_factory=list)
    estimated_time_remaining: int | None = None  # milliseconds


class StageAnalysisResult(BaseModel):
    """
    Stage analysis result.

    Complete analysis result including current stage, confidence,
    transitions, and suggestions.

    Attributes:
        current_stage: Current development stage.
        confidence: Detection confidence.
        active_sub_stages: Active coding sub-stages.
        recent_transitions: Recent stage transitions.
        stage_progress: Progress for each stage.
        suggestions: Suggested next steps.
    """

    current_stage: DevelopmentStage
    confidence: float = Field(ge=0.0, le=1.0)
    active_sub_stages: list[CodingSubStage] = Field(default_factory=list)
    recent_transitions: list[StageTransition] = Field(default_factory=list)
    stage_progress: dict[DevelopmentStage, int] = Field(default_factory=dict)
    suggestions: list[str] = Field(default_factory=list)


# Stage order for progress tracking
STAGE_ORDER: list[DevelopmentStage] = [
    DevelopmentStage.PRD,
    DevelopmentStage.PLANNING,
    DevelopmentStage.ERD,
    DevelopmentStage.WIREFRAME,
    DevelopmentStage.SCREEN_DESIGN,
    DevelopmentStage.DESIGN,
    DevelopmentStage.FRONTEND,
    DevelopmentStage.BACKEND,
    DevelopmentStage.AI_COLLABORATION,
    DevelopmentStage.CODING,
    DevelopmentStage.GIT_MANAGEMENT,
    DevelopmentStage.DEPLOYMENT,
    DevelopmentStage.OPERATION,
]

# Coding sub-stage order
CODING_SUB_STAGE_ORDER: list[CodingSubStage] = [
    CodingSubStage.USE_CASE,
    CodingSubStage.EVENT_STORMING,
    CodingSubStage.DOMAIN_MODELING,
    CodingSubStage.USE_CASE_DETAIL,
    CodingSubStage.AI_PROMPT_DESIGN,
    CodingSubStage.INITIAL_IMPLEMENTATION,
    CodingSubStage.BUSINESS_LOGIC,
    CodingSubStage.REFACTORING,
    CodingSubStage.UNIT_TEST,
    CodingSubStage.INTEGRATION_TEST,
    CodingSubStage.E2E_TEST,
]

# Stage descriptions for display
STAGE_DESCRIPTIONS: dict[DevelopmentStage, str] = {
    DevelopmentStage.PRD: "PRD (Product Requirements Document) writing",
    DevelopmentStage.PLANNING: "Planning document writing",
    DevelopmentStage.ERD: "ERD (Entity Relationship Diagram) design",
    DevelopmentStage.WIREFRAME: "Wireframe design",
    DevelopmentStage.SCREEN_DESIGN: "Screen-level planning document writing",
    DevelopmentStage.DESIGN: "Design work",
    DevelopmentStage.FRONTEND: "Frontend development",
    DevelopmentStage.BACKEND: "Backend development",
    DevelopmentStage.AI_COLLABORATION: "AI collaboration",
    DevelopmentStage.CODING: "Coding work",
    DevelopmentStage.GIT_MANAGEMENT: "Git management",
    DevelopmentStage.DEPLOYMENT: "Deployment",
    DevelopmentStage.OPERATION: "Operation",
}
