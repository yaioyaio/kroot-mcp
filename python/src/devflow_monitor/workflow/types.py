"""
Workflow Engine Types.

Complete type definitions for the workflow system including workflows,
stages, conditions, actions, rules, templates, and execution states.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Callable, Coroutine
from uuid import uuid4

from pydantic import BaseModel, Field


class StageType(str, Enum):
    """Stage type enumeration."""

    START = "start"
    PROCESS = "process"
    DECISION = "decision"
    PARALLEL = "parallel"
    END = "end"
    CUSTOM = "custom"


class ActionType(str, Enum):
    """Action type enumeration."""

    NOTIFY = "notify"
    LOG = "log"
    METRIC = "metric"
    API_CALL = "api_call"
    SCRIPT = "script"
    TOOL = "tool"
    CUSTOM = "custom"


class ExecutionStatus(str, Enum):
    """Workflow execution status."""

    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ConditionType(str, Enum):
    """Condition type enumeration."""

    EVENT = "event"
    METRIC = "metric"
    TIME = "time"
    CUSTOM = "custom"


class ConditionOperator(str, Enum):
    """Condition operator enumeration."""

    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    GREATER = "greater"
    GREATER_EQUAL = "greater_equal"
    LESS = "less"
    LESS_EQUAL = "less_equal"
    REGEX = "regex"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    IN = "in"
    NOT_IN = "not_in"
    IS_NULL = "is_null"
    IS_NOT_NULL = "is_not_null"
    IS_EMPTY = "is_empty"
    IS_NOT_EMPTY = "is_not_empty"


class TriggerType(str, Enum):
    """Rule trigger type enumeration."""

    EVENT = "event"
    SCHEDULE = "schedule"
    MANUAL = "manual"
    WEBHOOK = "webhook"


class CombineOperator(str, Enum):
    """Logical combine operator."""

    AND = "AND"
    OR = "OR"


class VariableType(str, Enum):
    """Template variable type."""

    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY = "array"
    OBJECT = "object"


class FieldType(str, Enum):
    """Configurable field type."""

    TEXT = "text"
    NUMBER = "number"
    SELECT = "select"
    CHECKBOX = "checkbox"
    TEXTAREA = "textarea"
    JSON = "json"


class TemplateDifficulty(str, Enum):
    """Template difficulty level."""

    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class RateLimitStrategy(str, Enum):
    """Rate limit strategy."""

    SLIDING = "sliding"
    FIXED = "fixed"


# Permission types
class WorkflowPermissionAction(str, Enum):
    """Workflow permission actions."""

    READ = "read"
    WRITE = "write"
    EXECUTE = "execute"
    DELETE = "delete"


class RetryPolicy(BaseModel):
    """Retry policy for actions."""

    max_attempts: int = 3
    backoff_multiplier: float = 1.5
    max_backoff: int = 60000  # milliseconds


class StageCondition(BaseModel):
    """Stage condition definition."""

    type: ConditionType
    operator: ConditionOperator
    field: str
    value: Any
    description: str | None = None


class StageAction(BaseModel):
    """Stage action definition."""

    type: ActionType
    parameters: dict[str, Any] = Field(default_factory=dict)
    async_action: bool = Field(default=False, alias="async")
    timeout: int | None = None  # milliseconds
    retry_policy: RetryPolicy | None = None

    class Config:
        """Pydantic configuration."""

        populate_by_name = True


class StageTransition(BaseModel):
    """Stage transition definition."""

    to: str
    condition: StageCondition | None = None
    priority: int = 0


class WorkflowStage(BaseModel):
    """Workflow stage definition."""

    id: str
    name: str
    type: StageType
    conditions: list[StageCondition] = Field(default_factory=list)
    actions: list[StageAction] = Field(default_factory=list)
    transitions: list[StageTransition] = Field(default_factory=list)
    custom_fields: dict[str, Any] | None = None


class RuleTrigger(BaseModel):
    """Rule trigger configuration."""

    type: TriggerType
    config: dict[str, Any] = Field(default_factory=dict)


class RuleCondition(BaseModel):
    """Rule condition definition."""

    field: str
    operator: str
    value: Any
    combine_with: CombineOperator | None = None


class RuleAction(BaseModel):
    """Rule action definition."""

    type: str
    config: dict[str, Any] = Field(default_factory=dict)
    order: int = 0


class WorkflowRule(BaseModel):
    """Workflow rule definition."""

    id: str
    name: str
    description: str
    trigger: RuleTrigger
    conditions: list[RuleCondition] = Field(default_factory=list)
    actions: list[RuleAction] = Field(default_factory=list)
    enabled: bool = True


class TemplateVariable(BaseModel):
    """Template variable definition."""

    name: str
    type: VariableType
    required: bool
    default: Any | None = None
    description: str


class TemplateExample(BaseModel):
    """Template example definition."""

    name: str
    description: str
    variables: dict[str, Any] = Field(default_factory=dict)


class WorkflowPermission(BaseModel):
    """Workflow permission definition."""

    role: str
    actions: list[WorkflowPermissionAction]


class WorkflowMetadata(BaseModel):
    """Workflow metadata."""

    version: str
    author: str
    created: datetime = Field(default_factory=datetime.utcnow)
    modified: datetime = Field(default_factory=datetime.utcnow)
    tags: list[str] = Field(default_factory=list)
    permissions: list[WorkflowPermission] = Field(default_factory=list)


class WorkflowTemplate(BaseModel):
    """Workflow template definition."""

    id: str
    name: str
    description: str
    category: str
    stages: list[WorkflowStage] = Field(default_factory=list)
    variables: list[TemplateVariable] = Field(default_factory=list)
    examples: list[TemplateExample] = Field(default_factory=list)


class Workflow(BaseModel):
    """Complete workflow definition."""

    id: str
    name: str
    description: str
    stages: list[WorkflowStage]
    rules: list[WorkflowRule] = Field(default_factory=list)
    templates: list[WorkflowTemplate] = Field(default_factory=list)
    metadata: WorkflowMetadata


class ExecutionError(BaseModel):
    """Execution error information."""

    stage: str
    error: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    recoverable: bool = False


class ExecutionContext(BaseModel):
    """Workflow execution context."""

    variables: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, float] = Field(default_factory=dict)
    errors: list[ExecutionError] = Field(default_factory=list)


class ExecutionHistoryItem(BaseModel):
    """Execution history item."""

    stage: str
    action: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    duration: float = 0.0  # milliseconds
    result: Any = None
    error: str | None = None


class WorkflowExecution(BaseModel):
    """Workflow execution state."""

    id: str = Field(default_factory=lambda: f"exec_{int(datetime.utcnow().timestamp() * 1000)}_{uuid4().hex[:9]}")
    workflow_id: str
    status: ExecutionStatus = ExecutionStatus.PENDING
    current_stage: str
    start_time: datetime = Field(default_factory=datetime.utcnow)
    end_time: datetime | None = None
    context: ExecutionContext = Field(default_factory=ExecutionContext)
    history: list[ExecutionHistoryItem] = Field(default_factory=list)


# Rule Engine Types


class CronSchedule(BaseModel):
    """Cron schedule configuration."""

    expression: str
    timezone: str | None = None
    description: str | None = None


class RateLimit(BaseModel):
    """Rate limit configuration."""

    max_executions: int
    time_window: int  # milliseconds
    strategy: RateLimitStrategy = RateLimitStrategy.SLIDING


class ContextFilter(BaseModel):
    """Context filter definition."""

    field: str
    operator: str
    value: Any
    negate: bool = False


class AdvancedRule(WorkflowRule):
    """Advanced rule with additional features."""

    priority: int = 0
    category: str = "default"
    tags: list[str] = Field(default_factory=list)
    schedule: CronSchedule | None = None
    rate_limiting: RateLimit | None = None
    context_filters: list[ContextFilter] | None = None


class RuleContext(BaseModel):
    """Rule execution context."""

    event: Any | None = None
    metrics: dict[str, float] = Field(default_factory=dict)
    variables: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    execution_id: str = Field(default_factory=lambda: f"exec_{int(datetime.utcnow().timestamp() * 1000)}")


class ActionResult(BaseModel):
    """Action execution result."""

    type: str
    success: bool
    result: Any | None = None
    error: str | None = None
    duration: float = 0.0  # milliseconds


class RuleExecutionResult(BaseModel):
    """Rule execution result."""

    rule_id: str
    executed: bool
    actions: list[ActionResult] = Field(default_factory=list)
    duration: float = 0.0  # milliseconds
    error: str | None = None


# Stage Builder Types


class InputValidation(BaseModel):
    """Input validation rules."""

    min: float | None = None
    max: float | None = None
    pattern: str | None = None
    custom_validator: str | None = None


class FieldValidation(BaseModel):
    """Field validation rules."""

    required: bool | None = None
    min: float | None = None
    max: float | None = None
    pattern: str | None = None


class FieldOption(BaseModel):
    """Field option for select fields."""

    value: Any
    label: str


class StageInput(BaseModel):
    """Stage input definition."""

    name: str
    type: VariableType
    required: bool
    description: str
    default: Any | None = None
    validation: InputValidation | None = None


class StageOutput(BaseModel):
    """Stage output definition."""

    name: str
    type: VariableType
    description: str


class ConfigurableField(BaseModel):
    """Configurable field definition."""

    key: str
    label: str
    type: FieldType
    required: bool
    options: list[FieldOption] | None = None
    description: str | None = None
    placeholder: str | None = None
    validation: FieldValidation | None = None


class ValidationRule(BaseModel):
    """Validation rule definition."""

    field: str
    rule: str
    message: str


class CustomStageDefinition(BaseModel):
    """Custom stage definition."""

    id: str
    name: str
    description: str
    category: str
    icon: str | None = None
    inputs: list[StageInput] = Field(default_factory=list)
    outputs: list[StageOutput] = Field(default_factory=list)
    configurable_fields: list[ConfigurableField] = Field(default_factory=list)
    default_actions: list[StageAction] = Field(default_factory=list)
    validation_rules: list[ValidationRule] = Field(default_factory=list)


# Template System Types


class StageTemplate(BaseModel):
    """Stage template for workflow templates."""

    id: str
    name: str
    definition_id: str
    configuration: dict[str, Any] = Field(default_factory=dict)
    conditions: list[Any] | None = None
    transitions: list[Any] | None = None


class TroubleshootingItem(BaseModel):
    """Troubleshooting item for template documentation."""

    issue: str
    solution: str
    related_fields: list[str] | None = None


class TemplateDocumentation(BaseModel):
    """Template documentation."""

    overview: str
    setup_instructions: list[str] = Field(default_factory=list)
    use_cases: list[str] = Field(default_factory=list)
    troubleshooting: list[TroubleshootingItem] = Field(default_factory=list)


class TemplateDefinition(BaseModel):
    """Complete template definition."""

    id: str
    name: str
    description: str
    category: str
    icon: str | None = None
    tags: list[str] = Field(default_factory=list)
    author: str
    version: str
    difficulty: TemplateDifficulty = TemplateDifficulty.INTERMEDIATE
    estimated_setup_time: int = 10  # minutes
    requirements: list[str] = Field(default_factory=list)
    variables: list[TemplateVariable] = Field(default_factory=list)
    stages: list[StageTemplate] = Field(default_factory=list)
    examples: list[TemplateExample] = Field(default_factory=list)
    documentation: TemplateDocumentation | None = None


class TemplateInstantiationCustomizations(BaseModel):
    """Template instantiation customizations."""

    skip_stages: list[str] | None = None
    additional_stages: list[StageTemplate] | None = None
    stage_overrides: dict[str, Any] | None = None


class TemplateInstantiationOptions(BaseModel):
    """Template instantiation options."""

    name: str
    description: str | None = None
    variables: dict[str, Any] = Field(default_factory=dict)
    customizations: TemplateInstantiationCustomizations | None = None


# Type aliases for handlers
WorkflowHandler = Callable[[Workflow], Coroutine[Any, Any, None] | None]
ExecutionHandler = Callable[[WorkflowExecution], Coroutine[Any, Any, None] | None]
RuleHandler = Callable[[AdvancedRule], Coroutine[Any, Any, None] | None]
