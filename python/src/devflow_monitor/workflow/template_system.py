"""
Workflow Template System.

Provides pre-built workflow templates and template management
with support for instantiation, customization, and documentation.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from pyee.asyncio import AsyncIOEventEmitter

from .types import (
    StageTemplate,
    StageTransition,
    TemplateDefinition,
    TemplateDocumentation,
    TemplateDifficulty,
    TemplateExample,
    TemplateInstantiationOptions,
    TemplateVariable,
    TroubleshootingItem,
    VariableType,
    Workflow,
    WorkflowMetadata,
    WorkflowPermission,
    WorkflowPermissionAction,
    WorkflowStage,
    WorkflowTemplate,
)

if TYPE_CHECKING:
    from .stage_builder import StageBuilder


class TemplateSystem(AsyncIOEventEmitter):
    """
    Workflow Template System class.

    Provides functionality to:
    - Register and manage workflow templates
    - Instantiate workflows from templates
    - Search and filter templates
    - Generate template documentation
    - Import/export templates
    """

    _instance: TemplateSystem | None = None

    def __init__(self, stage_builder: StageBuilder | None = None):
        """
        Initialize template system.

        Args:
            stage_builder: Optional stage builder for stage creation.
        """
        super().__init__()
        self._templates: dict[str, TemplateDefinition] = {}
        self._instantiated_workflows: dict[str, str] = {}  # template_id -> workflow_id
        self._stage_builder = stage_builder
        self._initialize_built_in_templates()

    @classmethod
    def get_instance(cls, stage_builder: StageBuilder | None = None) -> TemplateSystem:
        """
        Get singleton instance of TemplateSystem.

        Args:
            stage_builder: Optional stage builder.

        Returns:
            TemplateSystem singleton instance.
        """
        if cls._instance is None:
            cls._instance = TemplateSystem(stage_builder)
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance."""
        cls._instance = None

    def _initialize_built_in_templates(self) -> None:
        """Initialize built-in workflow templates."""
        # CI/CD Pipeline Template
        self.register_template(
            TemplateDefinition(
                id="cicd-pipeline",
                name="CI/CD Pipeline",
                description="Automated continuous integration and deployment pipeline",
                category="deployment",
                icon="rocket",
                tags=["cicd", "automation", "deployment", "testing"],
                author="DevFlow Monitor",
                version="1.0.0",
                difficulty=TemplateDifficulty.INTERMEDIATE,
                estimated_setup_time=15,
                requirements=[
                    "Git repository",
                    "Test suite",
                    "Deployment target",
                ],
                variables=[
                    TemplateVariable(
                        name="repository_path",
                        type=VariableType.STRING,
                        required=True,
                        description="Path to Git repository",
                        default="./",
                    ),
                    TemplateVariable(
                        name="test_command",
                        type=VariableType.STRING,
                        required=True,
                        description="Command to run tests",
                        default="npm test",
                    ),
                    TemplateVariable(
                        name="build_command",
                        type=VariableType.STRING,
                        required=True,
                        description="Command to build project",
                        default="npm run build",
                    ),
                    TemplateVariable(
                        name="deployment_target",
                        type=VariableType.STRING,
                        required=False,
                        description="Deployment target environment",
                        default="staging",
                    ),
                    TemplateVariable(
                        name="notification_channel",
                        type=VariableType.STRING,
                        required=False,
                        description="Notification channel for status updates",
                        default="slack",
                    ),
                ],
                stages=[
                    StageTemplate(
                        id="git-trigger",
                        name="Git Change Detection",
                        definition_id="git-monitor",
                        configuration={
                            "repository": "{{repository_path}}",
                            "watch_branches": "main\ndevelop",
                        },
                    ),
                    StageTemplate(
                        id="run-tests",
                        name="Run Tests",
                        definition_id="test-runner",
                        configuration={
                            "test_command": "{{test_command}}",
                            "timeout": 300,
                            "fail_on_error": True,
                        },
                    ),
                    StageTemplate(
                        id="build-project",
                        name="Build Project",
                        definition_id="script-runner",
                        configuration={
                            "command": "{{build_command}}",
                            "working_directory": "{{repository_path}}",
                        },
                    ),
                    StageTemplate(
                        id="deploy",
                        name="Deploy to {{deployment_target}}",
                        definition_id="deployment",
                        configuration={
                            "target": "{{deployment_target}}",
                            "artifacts": "dist/**/*",
                        },
                    ),
                    StageTemplate(
                        id="notify-success",
                        name="Success Notification",
                        definition_id="notification",
                        configuration={
                            "title": "Deployment Successful",
                            "message": "Successfully deployed to {{deployment_target}}",
                            "priority": "high",
                            "channels": "{{notification_channel}}",
                        },
                    ),
                ],
                examples=[
                    TemplateExample(
                        name="Node.js Web App",
                        description="CI/CD for a Node.js web application",
                        variables={
                            "repository_path": "./",
                            "test_command": "npm run test:ci",
                            "build_command": "npm run build",
                            "deployment_target": "production",
                            "notification_channel": "slack",
                        },
                    ),
                    TemplateExample(
                        name="React Frontend",
                        description="CI/CD for a React frontend application",
                        variables={
                            "repository_path": "./",
                            "test_command": "npm run test -- --coverage",
                            "build_command": "npm run build",
                            "deployment_target": "vercel",
                            "notification_channel": "dashboard",
                        },
                    ),
                ],
                documentation=TemplateDocumentation(
                    overview="This template creates a complete CI/CD pipeline that automatically tests, builds, and deploys your application when changes are detected in your Git repository.",
                    setup_instructions=[
                        "Ensure your project has test scripts configured",
                        "Set up build commands in package.json",
                        "Configure deployment target credentials",
                        "Test the pipeline with a small change",
                    ],
                    use_cases=[
                        "Automated testing on every commit",
                        "Continuous deployment to staging/production",
                        "Quality gates before deployment",
                        "Team notifications on deployment status",
                    ],
                    troubleshooting=[
                        TroubleshootingItem(
                            issue="Tests failing unexpectedly",
                            solution="Check test command and ensure all dependencies are installed",
                            related_fields=["test_command"],
                        ),
                        TroubleshootingItem(
                            issue="Build process hanging",
                            solution="Verify build command and check for interactive prompts",
                            related_fields=["build_command"],
                        ),
                    ],
                ),
            )
        )

        # Code Quality Monitor Template
        self.register_template(
            TemplateDefinition(
                id="code-quality-monitor",
                name="Code Quality Monitor",
                description="Monitor code quality metrics and enforce standards",
                category="quality",
                icon="chart",
                tags=["quality", "monitoring", "standards", "metrics"],
                author="DevFlow Monitor",
                version="1.0.0",
                difficulty=TemplateDifficulty.BEGINNER,
                estimated_setup_time=10,
                requirements=[
                    "Source code repository",
                    "Quality tools (ESLint, Prettier, etc.)",
                ],
                variables=[
                    TemplateVariable(
                        name="source_directory",
                        type=VariableType.STRING,
                        required=True,
                        description="Directory containing source code",
                        default="src",
                    ),
                    TemplateVariable(
                        name="quality_threshold",
                        type=VariableType.NUMBER,
                        required=False,
                        description="Minimum quality score (0-100)",
                        default=80,
                    ),
                    TemplateVariable(
                        name="lint_command",
                        type=VariableType.STRING,
                        required=False,
                        description="Linting command",
                        default="npm run lint",
                    ),
                    TemplateVariable(
                        name="alert_on_failure",
                        type=VariableType.BOOLEAN,
                        required=False,
                        description="Send alerts when quality drops",
                        default=True,
                    ),
                ],
                stages=[
                    StageTemplate(
                        id="file-watcher",
                        name="Source Code Monitor",
                        definition_id="file-monitor",
                        configuration={
                            "path": "{{source_directory}}",
                            "include_patterns": "**/*.ts\n**/*.js\n**/*.tsx\n**/*.jsx",
                            "exclude_patterns": "node_modules/**\n*.test.*\n*.spec.*",
                        },
                    ),
                    StageTemplate(
                        id="quality-check",
                        name="Quality Analysis",
                        definition_id="quality-analyzer",
                        configuration={
                            "lint_command": "{{lint_command}}",
                            "threshold": "{{quality_threshold}}",
                            "fail_on_below": "{{alert_on_failure}}",
                        },
                    ),
                    StageTemplate(
                        id="quality-report",
                        name="Generate Quality Report",
                        definition_id="report-generator",
                        configuration={
                            "report_type": "quality",
                            "output_path": "reports/quality.html",
                            "include_metrics": True,
                        },
                    ),
                    StageTemplate(
                        id="quality-alert",
                        name="Quality Alert",
                        definition_id="notification",
                        configuration={
                            "title": "Code Quality Alert",
                            "message": "Quality score below threshold: {{quality_score}}%",
                            "priority": "medium",
                            "channels": "dashboard",
                        },
                    ),
                ],
                examples=[
                    TemplateExample(
                        name="TypeScript Project",
                        description="Quality monitoring for TypeScript codebase",
                        variables={
                            "source_directory": "src",
                            "quality_threshold": 85,
                            "lint_command": "npm run lint:ts",
                            "alert_on_failure": True,
                        },
                    ),
                ],
            )
        )

        # Development Workflow Template
        self.register_template(
            TemplateDefinition(
                id="dev-workflow",
                name="Development Workflow",
                description="Complete development workflow with TDD and code review",
                category="development",
                icon="code",
                tags=["development", "tdd", "workflow", "collaboration"],
                author="DevFlow Monitor",
                version="1.0.0",
                difficulty=TemplateDifficulty.ADVANCED,
                estimated_setup_time=20,
                requirements=[
                    "Git repository",
                    "Test framework",
                    "Code review process",
                ],
                variables=[
                    TemplateVariable(
                        name="project_path",
                        type=VariableType.STRING,
                        required=True,
                        description="Project root directory",
                        default="./",
                    ),
                    TemplateVariable(
                        name="test_framework",
                        type=VariableType.STRING,
                        required=True,
                        description="Testing framework being used",
                        default="vitest",
                    ),
                    TemplateVariable(
                        name="branch_pattern",
                        type=VariableType.STRING,
                        required=False,
                        description="Feature branch naming pattern",
                        default="feature/*",
                    ),
                    TemplateVariable(
                        name="review_required",
                        type=VariableType.BOOLEAN,
                        required=False,
                        description="Require code review before merge",
                        default=True,
                    ),
                ],
                stages=[
                    StageTemplate(
                        id="branch-monitor",
                        name="Branch Activity Monitor",
                        definition_id="git-monitor",
                        configuration={
                            "repository": "{{project_path}}",
                            "watch_branches": "{{branch_pattern}}\nmain\ndevelop",
                        },
                    ),
                    StageTemplate(
                        id="tdd-detector",
                        name="TDD Pattern Detection",
                        definition_id="pattern-detector",
                        configuration={
                            "patterns": "test-first\nred-green-refactor",
                            "encourage_tdd": True,
                        },
                    ),
                    StageTemplate(
                        id="auto-test",
                        name="Automatic Testing",
                        definition_id="test-runner",
                        configuration={
                            "test_command": "npm test",
                            "run_on_file_change": True,
                            "coverage": True,
                        },
                    ),
                    StageTemplate(
                        id="review-check",
                        name="Code Review Check",
                        definition_id="decision",
                        configuration={
                            "field": "review_required",
                            "operator": "equals",
                            "value": "true",
                        },
                    ),
                    StageTemplate(
                        id="quality-gate",
                        name="Quality Gate",
                        definition_id="quality-gate",
                        configuration={
                            "min_test_coverage": 80,
                            "max_complexity": 10,
                            "require_linting": True,
                        },
                    ),
                ],
                examples=[
                    TemplateExample(
                        name="React Development",
                        description="Development workflow for React application",
                        variables={
                            "project_path": "./",
                            "test_framework": "jest",
                            "branch_pattern": "feature/*",
                            "review_required": True,
                        },
                    ),
                ],
            )
        )

        # Bug Tracking Template
        self.register_template(
            TemplateDefinition(
                id="bug-tracking",
                name="Bug Tracking & Resolution",
                description="Automated bug detection, tracking, and resolution workflow",
                category="maintenance",
                icon="bug",
                tags=["bugs", "tracking", "resolution", "quality"],
                author="DevFlow Monitor",
                version="1.0.0",
                difficulty=TemplateDifficulty.INTERMEDIATE,
                estimated_setup_time=12,
                requirements=[
                    "Error monitoring",
                    "Issue tracking system",
                    "Notification system",
                ],
                variables=[
                    TemplateVariable(
                        name="error_threshold",
                        type=VariableType.NUMBER,
                        required=False,
                        description="Number of errors before creating bug report",
                        default=5,
                    ),
                    TemplateVariable(
                        name="critical_keywords",
                        type=VariableType.ARRAY,
                        required=False,
                        description="Keywords that indicate critical bugs",
                        default=["crash", "security", "data loss"],
                    ),
                    TemplateVariable(
                        name="assignee",
                        type=VariableType.STRING,
                        required=False,
                        description="Default assignee for bug reports",
                        default="dev-team",
                    ),
                ],
                stages=[
                    StageTemplate(
                        id="error-monitor",
                        name="Error Detection",
                        definition_id="error-monitor",
                        configuration={
                            "threshold": "{{error_threshold}}",
                            "critical_keywords": "{{critical_keywords}}",
                        },
                    ),
                    StageTemplate(
                        id="bug-classification",
                        name="Bug Classification",
                        definition_id="classifier",
                        configuration={
                            "criteria": "severity\nfrequency\nimpact",
                            "auto_assign": True,
                        },
                    ),
                    StageTemplate(
                        id="create-ticket",
                        name="Create Bug Ticket",
                        definition_id="ticket-creator",
                        configuration={
                            "assignee": "{{assignee}}",
                            "priority": "auto",
                            "include_stack_trace": True,
                        },
                    ),
                    StageTemplate(
                        id="notify-team",
                        name="Team Notification",
                        definition_id="notification",
                        configuration={
                            "title": "New Bug Detected",
                            "message": "Bug ticket created: {{ticket_id}}",
                            "priority": "high",
                        },
                    ),
                ],
                examples=[
                    TemplateExample(
                        name="Web Application",
                        description="Bug tracking for web application",
                        variables={
                            "error_threshold": 3,
                            "critical_keywords": ["crash", "timeout", "auth"],
                            "assignee": "frontend-team",
                        },
                    ),
                ],
            )
        )

        # Performance Monitoring Template
        self.register_template(
            TemplateDefinition(
                id="performance-monitoring",
                name="Performance Monitoring",
                description="Monitor application performance and detect bottlenecks",
                category="performance",
                icon="lightning",
                tags=["performance", "monitoring", "optimization", "bottlenecks"],
                author="DevFlow Monitor",
                version="1.0.0",
                difficulty=TemplateDifficulty.INTERMEDIATE,
                estimated_setup_time=15,
                requirements=[
                    "Performance metrics",
                    "Monitoring tools",
                    "Alert system",
                ],
                variables=[
                    TemplateVariable(
                        name="response_time_threshold",
                        type=VariableType.NUMBER,
                        required=False,
                        description="Maximum acceptable response time (ms)",
                        default=1000,
                    ),
                    TemplateVariable(
                        name="memory_threshold",
                        type=VariableType.NUMBER,
                        required=False,
                        description="Memory usage threshold (%)",
                        default=80,
                    ),
                    TemplateVariable(
                        name="cpu_threshold",
                        type=VariableType.NUMBER,
                        required=False,
                        description="CPU usage threshold (%)",
                        default=70,
                    ),
                ],
                stages=[
                    StageTemplate(
                        id="metrics-collector",
                        name="Performance Metrics Collection",
                        definition_id="metrics-collector",
                        configuration={
                            "interval": 30000,
                            "metrics": "response_time\nmemory_usage\ncpu_usage",
                        },
                    ),
                    StageTemplate(
                        id="threshold-check",
                        name="Threshold Monitoring",
                        definition_id="threshold-monitor",
                        configuration={
                            "response_time": "{{response_time_threshold}}",
                            "memory": "{{memory_threshold}}",
                            "cpu": "{{cpu_threshold}}",
                        },
                    ),
                    StageTemplate(
                        id="bottleneck-detection",
                        name="Bottleneck Detection",
                        definition_id="bottleneck-detector",
                        configuration={
                            "analysis_window": "5m",
                            "sensitivity": "medium",
                        },
                    ),
                    StageTemplate(
                        id="performance-alert",
                        name="Performance Alert",
                        definition_id="notification",
                        configuration={
                            "title": "Performance Alert",
                            "message": "Performance threshold exceeded: {{metric}}",
                            "priority": "urgent",
                        },
                    ),
                ],
                examples=[
                    TemplateExample(
                        name="API Monitoring",
                        description="Performance monitoring for REST API",
                        variables={
                            "response_time_threshold": 500,
                            "memory_threshold": 75,
                            "cpu_threshold": 60,
                        },
                    ),
                ],
            )
        )

    def register_template(self, template: TemplateDefinition) -> None:
        """
        Register a new template.

        Args:
            template: Template to register.
        """
        self._templates[template.id] = template
        self.emit("template:registered", template)

    def unregister_template(self, template_id: str) -> bool:
        """
        Unregister a template.

        Args:
            template_id: Template ID to unregister.

        Returns:
            True if template was removed, False otherwise.
        """
        if template_id in self._templates:
            template = self._templates.pop(template_id)
            self.emit("template:unregistered", template)
            return True
        return False

    async def instantiate_workflow(
        self,
        template_id: str,
        options: TemplateInstantiationOptions,
    ) -> Workflow:
        """
        Instantiate a workflow from template.

        Args:
            template_id: Template ID.
            options: Instantiation options.

        Returns:
            Instantiated workflow.

        Raises:
            ValueError: If template not found or variables invalid.
        """
        template = self._templates.get(template_id)
        if not template:
            raise ValueError(f"Template not found: {template_id}")

        # Validate variables
        self._validate_variables(template, options.variables)

        # Create workflow stages
        stages: list[WorkflowStage] = []
        stage_templates = [
            s
            for s in template.stages
            if not (
                options.customizations
                and options.customizations.skip_stages
                and s.id in options.customizations.skip_stages
            )
        ]

        # Add additional stages if specified
        if options.customizations and options.customizations.additional_stages:
            stage_templates.extend(options.customizations.additional_stages)

        for i, stage_template in enumerate(stage_templates):
            # Apply variable substitution to configuration
            configuration = self._substitute_variables(
                stage_template.configuration, options.variables
            )

            # Apply stage overrides
            if (
                options.customizations
                and options.customizations.stage_overrides
                and stage_template.id in options.customizations.stage_overrides
            ):
                overrides = options.customizations.stage_overrides[stage_template.id]
                configuration = {**configuration, **overrides}

            # Build the stage
            if self._stage_builder:
                stage = self._stage_builder.build_stage(
                    f"{stage_template.id}_{i + 1}",
                    stage_template.definition_id,
                    configuration,
                )
            else:
                # Create minimal stage without builder
                from .types import StageType

                stage = WorkflowStage(
                    id=f"{stage_template.id}_{i + 1}",
                    name=stage_template.name,
                    type=StageType.PROCESS,
                    conditions=[],
                    actions=[],
                    transitions=[],
                    custom_fields={
                        "definition_id": stage_template.definition_id,
                        "configuration": configuration,
                    },
                )

            # Add transitions
            if i < len(stage_templates) - 1:
                next_stage = stage_templates[i + 1]
                stage.transitions.append(
                    StageTransition(to=f"{next_stage.id}_{i + 2}", priority=1)
                )

            # Apply template-specific conditions and transitions
            if stage_template.conditions:
                stage.conditions.extend(stage_template.conditions)

            if stage_template.transitions:
                stage.transitions.extend(stage_template.transitions)

            stages.append(stage)

        # Create the workflow
        workflow = Workflow(
            id=f"workflow_{int(datetime.utcnow().timestamp() * 1000)}_{uuid4().hex[:6]}",
            name=options.name,
            description=options.description or template.description,
            stages=stages,
            rules=self._generate_default_rules(template, options.variables),
            templates=[self._convert_to_workflow_template(template)],
            metadata=WorkflowMetadata(
                version="1.0.0",
                author="Template System",
                created=datetime.utcnow(),
                modified=datetime.utcnow(),
                tags=[*template.tags, "from-template"],
                permissions=[
                    WorkflowPermission(
                        role="owner",
                        actions=[
                            WorkflowPermissionAction.READ,
                            WorkflowPermissionAction.WRITE,
                            WorkflowPermissionAction.EXECUTE,
                            WorkflowPermissionAction.DELETE,
                        ],
                    )
                ],
            ),
        )

        # Store instantiation mapping
        self._instantiated_workflows[template_id] = workflow.id

        self.emit(
            "workflow:instantiated",
            {"template": template, "workflow": workflow, "options": options},
        )

        return workflow

    def _validate_variables(
        self,
        template: TemplateDefinition,
        variables: dict[str, Any],
    ) -> None:
        """Validate template variables."""
        for variable in template.variables:
            value = variables.get(variable.name)

            if variable.required and value is None:
                raise ValueError(f"Required variable missing: {variable.name}")

            if value is not None:
                self._validate_variable_type(variable, value)

    def _validate_variable_type(
        self, variable: TemplateVariable, value: Any
    ) -> None:
        """Validate variable type."""
        expected_type = variable.type

        if expected_type == VariableType.STRING:
            if not isinstance(value, str):
                raise ValueError(
                    f"Variable {variable.name} expected string, got {type(value).__name__}"
                )
        elif expected_type == VariableType.NUMBER:
            if not isinstance(value, (int, float)):
                raise ValueError(
                    f"Variable {variable.name} expected number, got {type(value).__name__}"
                )
        elif expected_type == VariableType.BOOLEAN:
            if not isinstance(value, bool):
                raise ValueError(
                    f"Variable {variable.name} expected boolean, got {type(value).__name__}"
                )
        elif expected_type == VariableType.ARRAY:
            if not isinstance(value, list):
                raise ValueError(
                    f"Variable {variable.name} expected array, got {type(value).__name__}"
                )
        elif expected_type == VariableType.OBJECT:
            if not isinstance(value, dict):
                raise ValueError(
                    f"Variable {variable.name} expected object, got {type(value).__name__}"
                )

    def _substitute_variables(
        self, config: Any, variables: dict[str, Any]
    ) -> Any:
        """Substitute variables in configuration."""
        if isinstance(config, str):

            def replace(match: re.Match) -> str:
                var_name = match.group(1)
                value = variables.get(var_name)
                return str(value) if value is not None else match.group(0)

            return re.sub(r"\{\{(\w+)\}\}", replace, config)

        if isinstance(config, list):
            return [self._substitute_variables(item, variables) for item in config]

        if isinstance(config, dict):
            return {
                key: self._substitute_variables(value, variables)
                for key, value in config.items()
            }

        return config

    def _generate_default_rules(
        self,
        template: TemplateDefinition,
        variables: dict[str, Any],
    ) -> list[Any]:
        """Generate default rules for template."""
        from .types import RuleAction, RuleTrigger, TriggerType, WorkflowRule

        rules: list[WorkflowRule] = []

        if template.category == "deployment":
            rules.append(
                WorkflowRule(
                    id=f"{template.id}_git_trigger",
                    name="Git Change Trigger",
                    description="Trigger on Git changes",
                    trigger=RuleTrigger(
                        type=TriggerType.EVENT,
                        config={
                            "event_type": "git.commit",
                            "conditions": [
                                {
                                    "field": "branch",
                                    "operator": "in",
                                    "value": ["main", "develop"],
                                }
                            ],
                        },
                    ),
                    conditions=[],
                    actions=[
                        RuleAction(
                            type="workflow",
                            config={"workflow_id": "current", "variables": variables},
                            order=1,
                        )
                    ],
                    enabled=True,
                )
            )
        elif template.category == "quality":
            rules.append(
                WorkflowRule(
                    id=f"{template.id}_file_trigger",
                    name="File Change Trigger",
                    description="Trigger on source file changes",
                    trigger=RuleTrigger(
                        type=TriggerType.EVENT,
                        config={
                            "event_type": "file.change",
                            "conditions": [
                                {
                                    "field": "path",
                                    "operator": "regex",
                                    "value": r"\.(ts|js|tsx|jsx)$",
                                }
                            ],
                        },
                    ),
                    conditions=[],
                    actions=[
                        RuleAction(
                            type="workflow",
                            config={"workflow_id": "current", "variables": variables},
                            order=1,
                        )
                    ],
                    enabled=True,
                )
            )

        return rules

    def _convert_to_workflow_template(
        self, template: TemplateDefinition
    ) -> WorkflowTemplate:
        """Convert template definition to workflow template."""
        return WorkflowTemplate(
            id=template.id,
            name=template.name,
            description=template.description,
            category=template.category,
            stages=[],
            variables=template.variables,
            examples=template.examples,
        )

    def get_categories(self) -> list[str]:
        """Get template categories."""
        categories = set()
        for template in self._templates.values():
            categories.add(template.category)
        return sorted(list(categories))

    def search_templates(
        self,
        category: str | None = None,
        tags: list[str] | None = None,
        difficulty: str | None = None,
        search: str | None = None,
    ) -> list[TemplateDefinition]:
        """
        Search templates.

        Args:
            category: Filter by category.
            tags: Filter by tags.
            difficulty: Filter by difficulty.
            search: Search in name and description.

        Returns:
            List of matching templates.
        """
        results = list(self._templates.values())

        if category:
            results = [t for t in results if t.category == category]

        if tags:
            results = [t for t in results if any(tag in t.tags for tag in tags)]

        if difficulty:
            results = [t for t in results if t.difficulty.value == difficulty]

        if search:
            search_lower = search.lower()
            results = [
                t
                for t in results
                if search_lower in t.name.lower()
                or search_lower in t.description.lower()
                or any(search_lower in tag.lower() for tag in t.tags)
            ]

        return results

    def generate_documentation(self, template_id: str) -> str:
        """
        Generate template documentation.

        Args:
            template_id: Template ID.

        Returns:
            Markdown documentation.

        Raises:
            ValueError: If template not found.
        """
        template = self._templates.get(template_id)
        if not template:
            raise ValueError(f"Template not found: {template_id}")

        doc = f"# {template.name}\n\n"
        doc += f"{template.description}\n\n"
        doc += f"**Category:** {template.category}  \n"
        doc += f"**Difficulty:** {template.difficulty.value}  \n"
        doc += f"**Setup Time:** ~{template.estimated_setup_time} minutes  \n"
        doc += f"**Tags:** {', '.join(template.tags)}\n\n"

        if template.requirements:
            doc += "## Requirements\n\n"
            for req in template.requirements:
                doc += f"- {req}\n"
            doc += "\n"

        doc += "## Variables\n\n"
        doc += "| Name | Type | Required | Default | Description |\n"
        doc += "|------|------|----------|---------|-------------|\n"

        for variable in template.variables:
            default = variable.default if variable.default else "-"
            doc += f"| {variable.name} | {variable.type.value} | "
            doc += f"{'Yes' if variable.required else 'No'} | "
            doc += f"{default} | {variable.description} |\n"
        doc += "\n"

        if template.examples:
            doc += "## Examples\n\n"
            for example in template.examples:
                doc += f"### {example.name}\n\n"
                doc += f"{example.description}\n\n"
                doc += "**Variables:**\n"
                doc += "```json\n"
                doc += json.dumps(example.variables, indent=2)
                doc += "\n```\n\n"

        if template.documentation:
            doc += f"## Overview\n\n{template.documentation.overview}\n\n"

            if template.documentation.setup_instructions:
                doc += "## Setup Instructions\n\n"
                for i, instruction in enumerate(
                    template.documentation.setup_instructions, 1
                ):
                    doc += f"{i}. {instruction}\n"
                doc += "\n"

            if template.documentation.use_cases:
                doc += "## Use Cases\n\n"
                for use_case in template.documentation.use_cases:
                    doc += f"- {use_case}\n"
                doc += "\n"

            if template.documentation.troubleshooting:
                doc += "## Troubleshooting\n\n"
                for item in template.documentation.troubleshooting:
                    doc += f"**{item.issue}**  \n"
                    doc += f"{item.solution}\n\n"

        return doc

    def export_template(self, template_id: str) -> str:
        """
        Export template to JSON.

        Args:
            template_id: Template ID.

        Returns:
            JSON string.

        Raises:
            ValueError: If template not found.
        """
        template = self._templates.get(template_id)
        if not template:
            raise ValueError(f"Template not found: {template_id}")

        return template.model_dump_json(indent=2)

    def import_template(self, template_json: str) -> None:
        """
        Import template from JSON.

        Args:
            template_json: JSON string.

        Raises:
            ValueError: If import fails.
        """
        try:
            template = TemplateDefinition.model_validate_json(template_json)
            self._validate_template_structure(template)
            self.register_template(template)
        except Exception as e:
            raise ValueError(f"Failed to import template: {e}")

    def _validate_template_structure(self, template: TemplateDefinition) -> None:
        """Validate template structure."""
        if not template.id or not template.name or not template.description:
            raise ValueError("Template must have id, name, and description")

        if not template.category:
            raise ValueError("Template must have a category")

        if not template.variables:
            raise ValueError("Template must have variables")

        if not template.stages:
            raise ValueError("Template must have stages")

    # Public API methods

    def get_templates(self) -> list[TemplateDefinition]:
        """Get all registered templates."""
        return list(self._templates.values())

    def get_template(self, template_id: str) -> TemplateDefinition | None:
        """Get template by ID."""
        return self._templates.get(template_id)

    async def update_template(self, template: TemplateDefinition) -> None:
        """Update a template."""
        self._validate_template_structure(template)
        self._templates[template.id] = template
        self.emit("template:updated", template)

    async def delete_template(self, template_id: str) -> bool:
        """Delete a template."""
        return self.unregister_template(template_id)

    def get_instantiated_workflow(self, template_id: str) -> str | None:
        """Get instantiated workflow ID for a template."""
        return self._instantiated_workflows.get(template_id)


def get_template_system(stage_builder: StageBuilder | None = None) -> TemplateSystem:
    """
    Get the singleton TemplateSystem instance.

    Args:
        stage_builder: Optional stage builder.

    Returns:
        TemplateSystem singleton instance.
    """
    return TemplateSystem.get_instance(stage_builder)
