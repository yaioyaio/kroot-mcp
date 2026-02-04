"""
Custom Stage Builder.

Allows users to define custom workflow stages with inputs, outputs,
configurable fields, actions, and validation rules.
"""

from __future__ import annotations

import re
from typing import Any

from pyee.asyncio import AsyncIOEventEmitter

from .types import (
    ActionType,
    ConfigurableField,
    CustomStageDefinition,
    FieldOption,
    FieldType,
    FieldValidation,
    InputValidation,
    StageAction,
    StageCondition,
    StageInput,
    StageOutput,
    StageTransition,
    StageType,
    ValidationRule,
    VariableType,
    WorkflowStage,
)


class StageBuilder(AsyncIOEventEmitter):
    """
    Custom Stage Builder class.

    Provides functionality to:
    - Define custom stage types with inputs/outputs
    - Configure fields and validation rules
    - Build workflow stages from definitions
    - Create stage templates
    - Generate configuration schemas
    """

    _instance: StageBuilder | None = None

    def __init__(self):
        """Initialize stage builder."""
        super().__init__()
        self._custom_stages: dict[str, CustomStageDefinition] = {}
        self._stage_templates: dict[str, WorkflowStage] = {}
        self._initialize_built_in_stages()

    @classmethod
    def get_instance(cls) -> StageBuilder:
        """
        Get singleton instance of StageBuilder.

        Returns:
            StageBuilder singleton instance.
        """
        if cls._instance is None:
            cls._instance = StageBuilder()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance."""
        cls._instance = None

    def _initialize_built_in_stages(self) -> None:
        """Initialize built-in stage types."""
        # File Monitor Stage
        self.register_custom_stage(
            CustomStageDefinition(
                id="file-monitor",
                name="File Monitor",
                description="Monitor file system changes",
                category="monitoring",
                icon="folder",
                inputs=[
                    StageInput(
                        name="path",
                        type=VariableType.STRING,
                        required=True,
                        description="Path to monitor",
                        validation=InputValidation(pattern=r"^[a-zA-Z0-9/._-]+$"),
                    ),
                    StageInput(
                        name="patterns",
                        type=VariableType.ARRAY,
                        required=False,
                        description="File patterns to watch",
                        default=["**/*"],
                    ),
                ],
                outputs=[
                    StageOutput(
                        name="changed_files",
                        type=VariableType.ARRAY,
                        description="List of changed files",
                    ),
                    StageOutput(
                        name="change_type",
                        type=VariableType.STRING,
                        description="Type of change (add, modify, delete)",
                    ),
                ],
                configurable_fields=[
                    ConfigurableField(
                        key="path",
                        label="Monitor Path",
                        type=FieldType.TEXT,
                        required=True,
                        description="Enter the path to monitor for changes",
                    ),
                    ConfigurableField(
                        key="include_patterns",
                        label="Include Patterns",
                        type=FieldType.TEXTAREA,
                        required=False,
                        placeholder="**/*.ts\n**/*.js\n**/*.json",
                        description="File patterns to include (one per line)",
                    ),
                    ConfigurableField(
                        key="exclude_patterns",
                        label="Exclude Patterns",
                        type=FieldType.TEXTAREA,
                        required=False,
                        placeholder="node_modules/**\n.git/**",
                        description="File patterns to exclude (one per line)",
                    ),
                ],
                default_actions=[
                    StageAction(
                        type=ActionType.LOG,
                        parameters={
                            "level": "info",
                            "message": "File change detected: {{changed_files}}",
                        },
                        async_action=False,
                    ),
                ],
                validation_rules=[
                    ValidationRule(
                        field="path",
                        rule="required",
                        message="Monitor path is required",
                    ),
                ],
            )
        )

        # Git Monitor Stage
        self.register_custom_stage(
            CustomStageDefinition(
                id="git-monitor",
                name="Git Monitor",
                description="Monitor Git repository changes",
                category="git",
                icon="git",
                inputs=[
                    StageInput(
                        name="repository",
                        type=VariableType.STRING,
                        required=True,
                        description="Git repository path",
                    ),
                    StageInput(
                        name="branches",
                        type=VariableType.ARRAY,
                        required=False,
                        description="Branches to monitor",
                        default=["main", "develop"],
                    ),
                ],
                outputs=[
                    StageOutput(
                        name="commits",
                        type=VariableType.ARRAY,
                        description="New commits",
                    ),
                    StageOutput(
                        name="branches",
                        type=VariableType.ARRAY,
                        description="Changed branches",
                    ),
                ],
                configurable_fields=[
                    ConfigurableField(
                        key="repository",
                        label="Repository Path",
                        type=FieldType.TEXT,
                        required=True,
                        description="Path to the Git repository",
                    ),
                    ConfigurableField(
                        key="watch_branches",
                        label="Watch Branches",
                        type=FieldType.TEXTAREA,
                        required=False,
                        placeholder="main\ndevelop\nfeature/*",
                        description="Branches to monitor (one per line, supports wildcards)",
                    ),
                ],
                default_actions=[
                    StageAction(
                        type=ActionType.NOTIFY,
                        parameters={
                            "channel": "git",
                            "message": "Git activity detected: {{commits.length}} new commits",
                            "priority": "medium",
                        },
                        async_action=False,
                    ),
                ],
                validation_rules=[],
            )
        )

        # Test Runner Stage
        self.register_custom_stage(
            CustomStageDefinition(
                id="test-runner",
                name="Test Runner",
                description="Run automated tests",
                category="testing",
                icon="test",
                inputs=[
                    StageInput(
                        name="test_command",
                        type=VariableType.STRING,
                        required=True,
                        description="Command to run tests",
                    ),
                    StageInput(
                        name="test_path",
                        type=VariableType.STRING,
                        required=False,
                        description="Path to test files",
                    ),
                ],
                outputs=[
                    StageOutput(
                        name="test_results",
                        type=VariableType.OBJECT,
                        description="Test execution results",
                    ),
                    StageOutput(
                        name="passed",
                        type=VariableType.BOOLEAN,
                        description="Whether all tests passed",
                    ),
                ],
                configurable_fields=[
                    ConfigurableField(
                        key="test_command",
                        label="Test Command",
                        type=FieldType.TEXT,
                        required=True,
                        placeholder="npm test",
                        description="Command to execute tests",
                    ),
                    ConfigurableField(
                        key="timeout",
                        label="Timeout (seconds)",
                        type=FieldType.NUMBER,
                        required=False,
                        description="Maximum time to wait for tests",
                    ),
                    ConfigurableField(
                        key="fail_on_error",
                        label="Fail on Test Errors",
                        type=FieldType.CHECKBOX,
                        required=False,
                        description="Stop workflow if tests fail",
                    ),
                ],
                default_actions=[
                    StageAction(
                        type=ActionType.METRIC,
                        parameters={"name": "tests_run", "operation": "increment"},
                        async_action=False,
                    ),
                ],
                validation_rules=[
                    ValidationRule(
                        field="test_command",
                        rule="required",
                        message="Test command is required",
                    ),
                ],
            )
        )

        # Notification Stage
        self.register_custom_stage(
            CustomStageDefinition(
                id="notification",
                name="Notification",
                description="Send notifications",
                category="communication",
                icon="bell",
                inputs=[
                    StageInput(
                        name="message",
                        type=VariableType.STRING,
                        required=True,
                        description="Notification message",
                    ),
                    StageInput(
                        name="channels",
                        type=VariableType.ARRAY,
                        required=False,
                        description="Notification channels",
                        default=["dashboard"],
                    ),
                ],
                outputs=[
                    StageOutput(
                        name="sent",
                        type=VariableType.BOOLEAN,
                        description="Whether notification was sent",
                    ),
                ],
                configurable_fields=[
                    ConfigurableField(
                        key="title",
                        label="Notification Title",
                        type=FieldType.TEXT,
                        required=False,
                        description="Title for the notification",
                    ),
                    ConfigurableField(
                        key="message",
                        label="Message",
                        type=FieldType.TEXTAREA,
                        required=True,
                        description="Notification message content",
                    ),
                    ConfigurableField(
                        key="priority",
                        label="Priority",
                        type=FieldType.SELECT,
                        required=False,
                        options=[
                            FieldOption(value="low", label="Low"),
                            FieldOption(value="medium", label="Medium"),
                            FieldOption(value="high", label="High"),
                            FieldOption(value="urgent", label="Urgent"),
                        ],
                        description="Notification priority level",
                    ),
                    ConfigurableField(
                        key="channels",
                        label="Channels",
                        type=FieldType.TEXTAREA,
                        required=False,
                        placeholder="dashboard\nslack\nemail",
                        description="Notification channels (one per line)",
                    ),
                ],
                default_actions=[
                    StageAction(
                        type=ActionType.NOTIFY,
                        parameters={
                            "title": "{{title}}",
                            "message": "{{message}}",
                            "priority": "{{priority}}",
                            "channels": "{{channels}}",
                        },
                        async_action=False,
                    ),
                ],
                validation_rules=[
                    ValidationRule(
                        field="message",
                        rule="required",
                        message="Notification message is required",
                    ),
                ],
            )
        )

        # Decision Stage
        self.register_custom_stage(
            CustomStageDefinition(
                id="decision",
                name="Decision",
                description="Make conditional decisions",
                category="logic",
                icon="question",
                inputs=[
                    StageInput(
                        name="condition",
                        type=VariableType.STRING,
                        required=True,
                        description="Decision condition",
                    ),
                    StageInput(
                        name="value",
                        type=VariableType.STRING,
                        required=True,
                        description="Value to evaluate",
                    ),
                ],
                outputs=[
                    StageOutput(
                        name="result",
                        type=VariableType.BOOLEAN,
                        description="Decision result",
                    ),
                ],
                configurable_fields=[
                    ConfigurableField(
                        key="field",
                        label="Field to Check",
                        type=FieldType.TEXT,
                        required=True,
                        description="Field or variable to evaluate",
                    ),
                    ConfigurableField(
                        key="operator",
                        label="Operator",
                        type=FieldType.SELECT,
                        required=True,
                        options=[
                            FieldOption(value="equals", label="Equals"),
                            FieldOption(value="contains", label="Contains"),
                            FieldOption(value="greater", label="Greater Than"),
                            FieldOption(value="less", label="Less Than"),
                            FieldOption(value="regex", label="Matches Regex"),
                        ],
                        description="Comparison operator",
                    ),
                    ConfigurableField(
                        key="value",
                        label="Value",
                        type=FieldType.TEXT,
                        required=True,
                        description="Value to compare against",
                    ),
                ],
                default_actions=[
                    StageAction(
                        type=ActionType.LOG,
                        parameters={
                            "level": "info",
                            "message": "Decision result: {{result}}",
                        },
                        async_action=False,
                    ),
                ],
                validation_rules=[
                    ValidationRule(
                        field="field",
                        rule="required",
                        message="Field to check is required",
                    ),
                    ValidationRule(
                        field="operator",
                        rule="required",
                        message="Operator is required",
                    ),
                ],
            )
        )

    def register_custom_stage(self, definition: CustomStageDefinition) -> None:
        """
        Register a custom stage definition.

        Args:
            definition: Stage definition to register.
        """
        self._custom_stages[definition.id] = definition
        self.emit("stage:registered", definition)

    def unregister_custom_stage(self, stage_id: str) -> bool:
        """
        Unregister a custom stage.

        Args:
            stage_id: Stage ID to unregister.

        Returns:
            True if stage was removed, False otherwise.
        """
        if stage_id in self._custom_stages:
            definition = self._custom_stages.pop(stage_id)
            self.emit("stage:unregistered", definition)
            return True
        return False

    def build_stage(
        self,
        stage_id: str,
        definition_id: str,
        configuration: dict[str, Any],
    ) -> WorkflowStage:
        """
        Build a workflow stage from custom definition.

        Args:
            stage_id: Unique stage ID.
            definition_id: Custom stage definition ID.
            configuration: Stage configuration.

        Returns:
            Built workflow stage.

        Raises:
            ValueError: If definition not found or configuration invalid.
        """
        definition = self._custom_stages.get(definition_id)
        if not definition:
            raise ValueError(f"Custom stage definition not found: {definition_id}")

        # Validate configuration
        self._validate_configuration(definition, configuration)

        # Build conditions from inputs
        conditions: list[StageCondition] = []
        for input_def in definition.inputs:
            if input_def.required and configuration.get(input_def.name) is None:
                from .types import ConditionOperator, ConditionType

                conditions.append(
                    StageCondition(
                        type=ConditionType.CUSTOM,
                        operator=ConditionOperator.EQUALS,
                        field=input_def.name,
                        value=input_def.default,
                        description=f"Required input: {input_def.description}",
                    )
                )

        # Build actions from default actions and configuration
        actions: list[StageAction] = [
            action.model_copy(deep=True) for action in definition.default_actions
        ]

        # Process configurable fields into action parameters
        for field in definition.configurable_fields:
            value = configuration.get(field.key)
            if value is not None:
                # Update action parameters with configured values
                for action in actions:
                    if field.key in action.parameters:
                        action.parameters[field.key] = value

        # Create the workflow stage
        stage = WorkflowStage(
            id=stage_id,
            name=f"{definition.name} ({stage_id})",
            type=self._map_category_to_stage_type(definition.category),
            conditions=conditions,
            actions=actions,
            transitions=[],
            custom_fields={
                "definition_id": definition_id,
                "category": definition.category,
                "icon": definition.icon,
                "configuration": configuration,
            },
        )

        self._stage_templates[stage_id] = stage
        self.emit("stage:built", stage)

        return stage

    def _validate_configuration(
        self,
        definition: CustomStageDefinition,
        configuration: dict[str, Any],
    ) -> None:
        """
        Validate configuration against definition.

        Args:
            definition: Stage definition.
            configuration: Configuration to validate.

        Raises:
            ValueError: If configuration is invalid.
        """
        # Check required fields
        for field in definition.configurable_fields:
            if field.required and configuration.get(field.key) is None:
                raise ValueError(f"Required field missing: {field.key}")

            value = configuration.get(field.key)
            if value is not None:
                self._validate_field_value(field, value)

        # Run custom validation rules
        for rule in definition.validation_rules:
            self._validate_rule(rule, configuration)

    def _validate_field_value(
        self, field: ConfigurableField, value: Any
    ) -> None:
        """
        Validate individual field value.

        Args:
            field: Field definition.
            value: Value to validate.

        Raises:
            ValueError: If value is invalid.
        """
        validation = field.validation
        if not validation:
            return

        if validation.required and (value is None or value == ""):
            raise ValueError(f"Field {field.key} is required")

        if validation.min is not None and isinstance(value, (int, float)):
            if value < validation.min:
                raise ValueError(f"Field {field.key} must be at least {validation.min}")

        if validation.max is not None and isinstance(value, (int, float)):
            if value > validation.max:
                raise ValueError(f"Field {field.key} must be at most {validation.max}")

        if validation.pattern and isinstance(value, str):
            if not re.match(validation.pattern, value):
                raise ValueError(f"Field {field.key} does not match required pattern")

    def _validate_rule(
        self, rule: ValidationRule, configuration: dict[str, Any]
    ) -> None:
        """
        Validate custom rule.

        Args:
            rule: Validation rule.
            configuration: Configuration to validate.

        Raises:
            ValueError: If validation fails.
        """
        value = configuration.get(rule.field)

        if rule.rule == "required":
            if value is None or value == "":
                raise ValueError(rule.message)
        elif rule.rule == "numeric":
            try:
                float(value)
            except (ValueError, TypeError):
                raise ValueError(rule.message)
        elif rule.rule == "email":
            email_regex = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
            if not re.match(email_regex, str(value)):
                raise ValueError(rule.message)
        else:
            print(f"Unknown validation rule: {rule.rule}")

    def _map_category_to_stage_type(self, category: str) -> StageType:
        """Map category to stage type."""
        category_map = {
            "logic": StageType.DECISION,
            "communication": StageType.PROCESS,
            "monitoring": StageType.PROCESS,
            "testing": StageType.PROCESS,
            "git": StageType.PROCESS,
        }
        return category_map.get(category, StageType.CUSTOM)

    def create_template(
        self,
        name: str,
        description: str,
        stage_configs: list[dict[str, Any]],
    ) -> None:
        """
        Create stage template from configuration.

        Args:
            name: Template name.
            description: Template description.
            stage_configs: List of stage configurations.
        """
        from datetime import datetime

        stages: list[WorkflowStage] = []

        for i, config in enumerate(stage_configs):
            if not config:
                continue

            definition_id = config.get("definition_id", "")
            configuration = config.get("configuration", {})
            stage_id = f"stage_{i + 1}"

            stage = self.build_stage(stage_id, definition_id, configuration)

            # Add transitions to next stage
            if i < len(stage_configs) - 1:
                stage.transitions.append(
                    StageTransition(to=f"stage_{i + 2}", priority=1)
                )

            stages.append(stage)

        # Create template workflow stage
        template_stage = WorkflowStage(
            id=f"template_{int(datetime.utcnow().timestamp() * 1000)}",
            name=name,
            type=StageType.CUSTOM,
            conditions=[],
            actions=[
                StageAction(
                    type=ActionType.LOG,
                    parameters={
                        "level": "info",
                        "message": f"Template {name} executed",
                    },
                    async_action=False,
                ),
            ],
            transitions=[],
            custom_fields={
                "is_template": True,
                "description": description,
                "stages": [s.model_dump() for s in stages],
            },
        )

        self._stage_templates[template_stage.id] = template_stage
        self.emit("template:created", template_stage)

    def get_custom_stage_definitions(self) -> list[CustomStageDefinition]:
        """Get available custom stage definitions."""
        return list(self._custom_stages.values())

    def get_custom_stage_definition(
        self, stage_id: str
    ) -> CustomStageDefinition | None:
        """Get custom stage definition by ID."""
        return self._custom_stages.get(stage_id)

    def get_stage_templates(self) -> list[WorkflowStage]:
        """Get built stage templates."""
        return list(self._stage_templates.values())

    def get_stage_template(self, stage_id: str) -> WorkflowStage | None:
        """Get stage template by ID."""
        return self._stage_templates.get(stage_id)

    def generate_configuration_schema(self, definition_id: str) -> dict[str, Any]:
        """
        Generate stage configuration form schema.

        Args:
            definition_id: Definition ID.

        Returns:
            JSON schema for configuration.

        Raises:
            ValueError: If definition not found.
        """
        definition = self._custom_stages.get(definition_id)
        if not definition:
            raise ValueError(f"Definition not found: {definition_id}")

        schema = {
            "title": definition.name,
            "description": definition.description,
            "type": "object",
            "properties": {},
            "required": [],
        }

        for field in definition.configurable_fields:
            schema["properties"][field.key] = {
                "title": field.label,
                "description": field.description,
                "type": self._map_field_type_to_schema_type(field.type),
            }

            if field.options:
                schema["properties"][field.key]["enum"] = [
                    opt.value for opt in field.options
                ]

            if field.placeholder:
                schema["properties"][field.key]["placeholder"] = field.placeholder

            if field.required:
                schema["required"].append(field.key)

        return schema

    def _map_field_type_to_schema_type(self, field_type: FieldType) -> str:
        """Map field type to JSON schema type."""
        type_map = {
            FieldType.NUMBER: "number",
            FieldType.CHECKBOX: "boolean",
            FieldType.TEXTAREA: "string",
            FieldType.TEXT: "string",
            FieldType.SELECT: "string",
            FieldType.JSON: "object",
        }
        return type_map.get(field_type, "string")


def get_stage_builder() -> StageBuilder:
    """
    Get the singleton StageBuilder instance.

    Returns:
        StageBuilder singleton instance.
    """
    return StageBuilder.get_instance()
