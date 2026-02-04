"""
Workflow Module.

Complete workflow system including workflow engine, rule engine,
stage builder, and template system for defining and executing
custom development workflows.
"""

from .engine import (
    WorkflowEngine,
    get_workflow_engine,
)
from .rule_engine import (
    RuleEngine,
    get_rule_engine,
)
from .stage_builder import (
    StageBuilder,
    get_stage_builder,
)
from .template_system import (
    TemplateSystem,
    get_template_system,
)
from .types import (
    # Enums
    ActionType,
    CombineOperator,
    ConditionOperator,
    ConditionType,
    ExecutionStatus,
    FieldType,
    RateLimitStrategy,
    StageType,
    TemplateDifficulty,
    TriggerType,
    VariableType,
    WorkflowPermissionAction,
    # Workflow Types
    Workflow,
    WorkflowStage,
    WorkflowRule,
    WorkflowTemplate,
    WorkflowMetadata,
    WorkflowPermission,
    WorkflowExecution,
    # Stage Types
    StageCondition,
    StageAction,
    StageTransition,
    RetryPolicy,
    # Rule Types
    RuleTrigger,
    RuleCondition,
    RuleAction,
    AdvancedRule,
    CronSchedule,
    RateLimit,
    ContextFilter,
    RuleContext,
    RuleExecutionResult,
    ActionResult,
    # Execution Types
    ExecutionContext,
    ExecutionError,
    ExecutionHistoryItem,
    # Template Types
    TemplateVariable,
    TemplateExample,
    TemplateDefinition,
    TemplateDocumentation,
    TemplateInstantiationOptions,
    TemplateInstantiationCustomizations,
    TroubleshootingItem,
    StageTemplate,
    # Stage Builder Types
    CustomStageDefinition,
    StageInput,
    StageOutput,
    ConfigurableField,
    FieldOption,
    FieldValidation,
    InputValidation,
    ValidationRule,
    # Type Aliases
    WorkflowHandler,
    ExecutionHandler,
    RuleHandler,
)

__all__ = [
    # Engine Classes
    "WorkflowEngine",
    "get_workflow_engine",
    "RuleEngine",
    "get_rule_engine",
    "StageBuilder",
    "get_stage_builder",
    "TemplateSystem",
    "get_template_system",
    # Enums
    "ActionType",
    "CombineOperator",
    "ConditionOperator",
    "ConditionType",
    "ExecutionStatus",
    "FieldType",
    "RateLimitStrategy",
    "StageType",
    "TemplateDifficulty",
    "TriggerType",
    "VariableType",
    "WorkflowPermissionAction",
    # Workflow Types
    "Workflow",
    "WorkflowStage",
    "WorkflowRule",
    "WorkflowTemplate",
    "WorkflowMetadata",
    "WorkflowPermission",
    "WorkflowExecution",
    # Stage Types
    "StageCondition",
    "StageAction",
    "StageTransition",
    "RetryPolicy",
    # Rule Types
    "RuleTrigger",
    "RuleCondition",
    "RuleAction",
    "AdvancedRule",
    "CronSchedule",
    "RateLimit",
    "ContextFilter",
    "RuleContext",
    "RuleExecutionResult",
    "ActionResult",
    # Execution Types
    "ExecutionContext",
    "ExecutionError",
    "ExecutionHistoryItem",
    # Template Types
    "TemplateVariable",
    "TemplateExample",
    "TemplateDefinition",
    "TemplateDocumentation",
    "TemplateInstantiationOptions",
    "TemplateInstantiationCustomizations",
    "TroubleshootingItem",
    "StageTemplate",
    # Stage Builder Types
    "CustomStageDefinition",
    "StageInput",
    "StageOutput",
    "ConfigurableField",
    "FieldOption",
    "FieldValidation",
    "InputValidation",
    "ValidationRule",
    # Type Aliases
    "WorkflowHandler",
    "ExecutionHandler",
    "RuleHandler",
]
