"""
Prediction System Types.

Type definitions for pattern recognition, velocity prediction,
and bottleneck prediction systems.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field


class PatternCategory(str, Enum):
    """Pattern category types."""

    DEVELOPMENT = "development"
    PERFORMANCE = "performance"
    QUALITY = "quality"
    COLLABORATION = "collaboration"
    WORKFLOW = "workflow"


class PatternIndicator(BaseModel):
    """
    Indicator for pattern detection.

    Attributes:
        type: Indicator type (e.g., 'peak_hour', 'test_ratio').
        value: Indicator value.
        weight: Weight for pattern scoring (0-1).
        threshold: Optional threshold for triggering.
    """

    type: str
    value: Any
    weight: float = Field(ge=0.0, le=1.0)
    threshold: float | None = None


class Pattern(BaseModel):
    """
    Development pattern definition.

    Attributes:
        id: Unique pattern identifier.
        name: Pattern display name.
        description: Pattern description.
        category: Pattern category.
        indicators: List of pattern indicators.
        confidence: Confidence score (0-1).
        frequency: Detection frequency count.
        last_seen: Last detection timestamp.
    """

    id: str
    name: str
    description: str
    category: PatternCategory
    indicators: list[PatternIndicator] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    frequency: int = Field(ge=0, default=0)
    last_seen: datetime = Field(default_factory=datetime.utcnow)


class WorkflowStep(BaseModel):
    """
    Workflow step definition.

    Attributes:
        name: Step name.
        type: Step type.
        avg_duration: Average duration in milliseconds.
        dependencies: List of dependency step names.
        metadata: Additional step metadata.
    """

    name: str
    type: str
    avg_duration: float = 0.0
    dependencies: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class WorkflowPattern(BaseModel):
    """
    Workflow pattern definition.

    Attributes:
        id: Unique pattern identifier.
        name: Pattern display name.
        steps: List of workflow steps.
        frequency: Detection frequency count.
        avg_duration: Average total duration in milliseconds.
        success_rate: Success rate (0-1).
    """

    id: str
    name: str
    steps: list[WorkflowStep] = Field(default_factory=list)
    frequency: int = Field(ge=0, default=0)
    avg_duration: float = 0.0
    success_rate: float = Field(ge=0.0, le=1.0, default=1.0)


class VelocityFactor(BaseModel):
    """
    Factor affecting development velocity.

    Attributes:
        name: Factor name.
        impact: Impact on velocity (-1 to 1).
        description: Factor description.
    """

    name: str
    impact: float = Field(ge=-1.0, le=1.0)
    description: str


class VelocityPrediction(BaseModel):
    """
    Velocity prediction for next period.

    Attributes:
        next_period: Predicted velocity for next period.
        confidence: Prediction confidence (0-1).
        factors: Factors affecting the prediction.
    """

    next_period: float = 0.0
    confidence: float = Field(ge=0.0, le=1.0, default=0.3)
    factors: list[VelocityFactor] = Field(default_factory=list)


class VelocityTrend(str, Enum):
    """Velocity trend direction."""

    INCREASING = "increasing"
    STABLE = "stable"
    DECREASING = "decreasing"


class DevelopmentVelocity(BaseModel):
    """
    Current development velocity.

    Attributes:
        current: Current velocity value.
        average: Average velocity over history.
        trend: Velocity trend direction.
        prediction: Prediction for next period.
    """

    current: float = 0.0
    average: float = 0.0
    trend: VelocityTrend = VelocityTrend.STABLE
    prediction: VelocityPrediction = Field(default_factory=VelocityPrediction)


class BottleneckType(str, Enum):
    """Bottleneck prediction types."""

    TECHNICAL_DEBT = "technical_debt"
    RESOURCE_CONSTRAINT = "resource_constraint"
    PROCESS_INEFFICIENCY = "process_inefficiency"
    SKILL_GAP = "skill_gap"
    DEPENDENCY_BLOCK = "dependency_block"


class BottleneckPrediction(BaseModel):
    """
    Bottleneck prediction.

    Attributes:
        type: Type of predicted bottleneck.
        probability: Probability of occurrence (0-1).
        timeframe: Expected timeframe (e.g., '1-3 days', '1 week').
        indicators: List of triggered indicator names.
        prevention_suggestions: Suggested actions to prevent.
    """

    type: BottleneckType
    probability: float = Field(ge=0.0, le=1.0, default=0.0)
    timeframe: str = "unknown"
    indicators: list[str] = Field(default_factory=list)
    prevention_suggestions: list[str] = Field(default_factory=list)


class BottleneckIndicator(BaseModel):
    """
    Bottleneck detection indicator.

    Attributes:
        type: Associated bottleneck type.
        indicator: Indicator name.
        weight: Weight for probability calculation (0-1).
        threshold: Threshold value for triggering.
        current_value: Current indicator value.
    """

    type: BottleneckType
    indicator: str
    weight: float = Field(ge=0.0, le=1.0)
    threshold: float
    current_value: float = 0.0


# Generic type variable for prediction results
T = TypeVar("T")


class PredictionResult(BaseModel, Generic[T]):
    """
    Generic prediction result.

    Attributes:
        prediction: The predicted value(s).
        confidence: Prediction confidence (0-1).
        reasoning: List of reasoning explanations.
        data_points: Number of data points used.
        timestamp: Prediction timestamp.
    """

    prediction: Any  # T type - using Any for Pydantic compatibility
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    reasoning: list[str] = Field(default_factory=list)
    data_points: int = Field(ge=0, default=0)
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        """Pydantic configuration."""

        arbitrary_types_allowed = True


class VelocityDataPoint(BaseModel):
    """
    Velocity data point for tracking.

    Attributes:
        timestamp: Data point timestamp.
        velocity: Velocity value at this point.
        factors: Factors affecting velocity at this point.
    """

    timestamp: datetime
    velocity: float
    factors: list[VelocityFactor] = Field(default_factory=list)


class PatternDetectionEvent(BaseModel):
    """
    Event emitted when a pattern is detected.

    Attributes:
        type: Pattern type (e.g., 'rapid-changes', 'tdd').
        description: Pattern description.
        rate: Optional rate value for rate-based patterns.
        metadata: Additional event metadata.
    """

    type: str
    description: str
    rate: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
