"""
AI Collaboration Tracking Type Definitions.

This module defines types for tracking AI tool usage including
Claude, GitHub Copilot, ChatGPT, Cursor, TabNine, and CodeWhisperer.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class AITool(str, Enum):
    """Supported AI tools."""

    CLAUDE = "claude"
    GITHUB_COPILOT = "github_copilot"
    CHATGPT = "chatgpt"
    CURSOR = "cursor"
    TABNINE = "tabnine"
    CODEWHISPERER = "codewhisperer"
    OTHER = "other"


class AIUsageType(str, Enum):
    """Types of AI tool usage."""

    CODE_GENERATION = "code_generation"
    CODE_COMPLETION = "code_completion"
    CODE_EXPLANATION = "code_explanation"
    CODE_REVIEW = "code_review"
    DEBUGGING = "debugging"
    REFACTORING = "refactoring"
    DOCUMENTATION = "documentation"
    TESTING = "testing"
    ARCHITECTURE = "architecture"
    OTHER = "other"


class AISuggestionStatus(str, Enum):
    """Status of AI suggestions."""

    ACCEPTED = "accepted"
    REJECTED = "rejected"
    MODIFIED = "modified"
    PENDING = "pending"


class AIUsageDetection(BaseModel):
    """
    AI usage detection result.

    Records when AI tool usage is detected.

    Attributes:
        tool: The AI tool detected.
        usage_type: Type of usage.
        timestamp: Detection timestamp.
        file_path: File where detected.
        line_range: Line range if applicable.
        prompt: The prompt used (if known).
        suggestion: The suggestion made.
        confidence: Detection confidence (0-1).
        context: Additional context.
    """

    tool: AITool
    usage_type: AIUsageType
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    file_path: str | None = None
    line_range: dict[str, int] | None = None  # start, end
    prompt: str | None = None
    suggestion: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    context: str | None = None


class AISuggestion(BaseModel):
    """
    AI suggestion tracking.

    Tracks individual AI suggestions and their outcomes.

    Attributes:
        id: Unique suggestion identifier.
        tool: AI tool that made suggestion.
        usage_type: Type of usage.
        status: Suggestion status.
        timestamp: When suggested.
        file_path: Target file.
        original_code: Code before suggestion.
        suggested_code: The suggested code.
        accepted_code: Code actually used.
        modification_ratio: How much was modified (0-1).
        response_time: Response time in ms.
        token_count: Token count if known.
    """

    id: str
    tool: AITool
    usage_type: AIUsageType
    status: AISuggestionStatus
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    file_path: str
    original_code: str | None = None
    suggested_code: str
    accepted_code: str | None = None
    modification_ratio: float | None = None  # 0-1
    response_time: int | None = None  # milliseconds
    token_count: int | None = None


class AIInteraction(BaseModel):
    """
    Single AI interaction.

    Records a single interaction with an AI tool.

    Attributes:
        timestamp: When the interaction occurred.
        type: Type of interaction.
        prompt: The prompt used.
        response: The AI response.
        token_count: Token count.
        duration: Duration in ms.
        result: Outcome status.
    """

    timestamp: datetime = Field(default_factory=datetime.utcnow)
    type: AIUsageType
    prompt: str | None = None
    response: str | None = None
    token_count: int | None = None
    duration: int | None = None  # milliseconds
    result: AISuggestionStatus | None = None


class AISession(BaseModel):
    """
    AI tool session.

    Tracks a session of AI tool usage.

    Attributes:
        id: Session identifier.
        tool: AI tool used.
        start_time: Session start.
        end_time: Session end.
        interactions: List of interactions.
        total_tokens: Total tokens used.
        total_cost: Estimated cost.
    """

    id: str
    tool: AITool
    start_time: datetime = Field(default_factory=datetime.utcnow)
    end_time: datetime | None = None
    interactions: list[AIInteraction] = Field(default_factory=list)
    total_tokens: int | None = None
    total_cost: float | None = None


class AIEffectivenessMetrics(BaseModel):
    """
    AI tool effectiveness metrics.

    Measures how effective an AI tool is.

    Attributes:
        tool: The AI tool.
        time_window: Measurement time window.
        acceptance_rate: Rate of accepted suggestions (0-1).
        modification_rate: Rate of modified suggestions (0-1).
        average_response_time: Average response time in ms.
        total_interactions: Total number of interactions.
        successful_interactions: Number of successful interactions.
        token_efficiency: Useful code per token.
        times_saved: Estimated time saved in minutes.
        code_quality_impact: Impact on code quality.
    """

    tool: AITool
    time_window: Literal["hour", "day", "week", "month"] = "hour"
    acceptance_rate: float = 0.0  # 0-1
    modification_rate: float = 0.0  # 0-1
    average_response_time: int = 0  # milliseconds
    total_interactions: int = 0
    successful_interactions: int = 0
    token_efficiency: float = 0.0
    times_saved: int = 0  # minutes
    code_quality_impact: dict[str, Any] = Field(default_factory=dict)


class AIUsagePattern(BaseModel):
    """
    AI usage pattern analysis.

    Analyzes patterns in AI tool usage.

    Attributes:
        tool: The AI tool.
        patterns: Usage patterns.
        productivity: Productivity metrics.
    """

    tool: AITool
    patterns: dict[str, Any] = Field(default_factory=dict)
    productivity: dict[str, Any] = Field(default_factory=dict)


class AICodeQualityMetrics(BaseModel):
    """Code quality metrics for AI suggestions."""

    readability: int = Field(ge=0, le=100, default=0)
    maintainability: int = Field(ge=0, le=100, default=0)
    performance: int = Field(ge=0, le=100, default=0)
    security: int = Field(ge=0, le=100, default=0)
    testability: int = Field(ge=0, le=100, default=0)


class AICodeQualityIssue(BaseModel):
    """Code quality issue in AI suggestion."""

    type: Literal["bug", "vulnerability", "code_smell", "performance"]
    severity: Literal["low", "medium", "high", "critical"]
    description: str


class AICodeQualityAnalysis(BaseModel):
    """
    AI code quality analysis.

    Analyzes the quality of AI-generated code.

    Attributes:
        suggestion: The analyzed suggestion.
        quality: Quality metrics.
        issues: Detected issues.
        improvements: Suggested improvements.
    """

    suggestion: AISuggestion
    quality: AICodeQualityMetrics
    issues: list[AICodeQualityIssue] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)


class AICollaborationAnalysis(BaseModel):
    """
    Complete AI collaboration analysis.

    Comprehensive analysis of AI tool usage.

    Attributes:
        timestamp: Analysis timestamp.
        tools: Per-tool analysis.
        overall_metrics: Overall metrics.
        insights: Generated insights.
        trends: Usage trends.
    """

    timestamp: datetime = Field(default_factory=datetime.utcnow)
    tools: dict[AITool, dict[str, Any]] = Field(default_factory=dict)
    overall_metrics: dict[str, Any] = Field(default_factory=dict)
    insights: dict[str, Any] = Field(default_factory=dict)
    trends: dict[str, Any] = Field(default_factory=dict)


class AIDetectionRule(BaseModel):
    """
    AI detection rule.

    Defines rules for detecting AI tool usage.

    Attributes:
        tool: The AI tool to detect.
        patterns: Detection patterns by type.
        confidence: Base confidence level.
    """

    tool: AITool
    patterns: dict[str, list[str]] = Field(default_factory=dict)
    confidence: float = Field(ge=0.0, le=1.0, default=0.7)


class AIToolConfig(BaseModel):
    """
    AI tool configuration.

    Configuration for AI tool integration.

    Attributes:
        tool: The AI tool.
        enabled: Whether enabled.
        api_endpoint: API endpoint URL.
        api_key: API key (if needed).
        model: Model to use.
        max_tokens: Maximum tokens.
        temperature: Generation temperature.
        detection_patterns: Patterns for detection.
        file_patterns: File patterns to monitor.
    """

    tool: AITool
    enabled: bool = True
    api_endpoint: str | None = None
    api_key: str | None = None
    model: str | None = None
    max_tokens: int | None = None
    temperature: float | None = None
    detection_patterns: list[str] | None = None
    file_patterns: list[str] | None = None
