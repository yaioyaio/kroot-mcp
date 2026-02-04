"""
Workflow Engine.

Executes custom user-defined workflows with stage management,
condition evaluation, action execution, and event-driven triggers.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from pyee.asyncio import AsyncIOEventEmitter

from .types import (
    ActionType,
    ExecutionContext,
    ExecutionError,
    ExecutionHistoryItem,
    ExecutionStatus,
    StageAction,
    StageCondition,
    StageType,
    Workflow,
    WorkflowExecution,
    WorkflowRule,
    WorkflowStage,
)

if TYPE_CHECKING:
    from ..events import EventEngine
    from ..notifications import NotificationEngine


class WorkflowEngine(AsyncIOEventEmitter):
    """
    Workflow Engine class.

    Executes custom user-defined workflows with support for:
    - Multiple stage types (START, PROCESS, DECISION, PARALLEL, END, CUSTOM)
    - Condition evaluation with various operators
    - Multiple action types (notify, log, metric, api_call, script, tool, custom)
    - Event-driven workflow triggering
    - Execution state management
    """

    _instance: WorkflowEngine | None = None

    def __init__(
        self,
        event_engine: EventEngine | None = None,
        notification_engine: NotificationEngine | None = None,
    ):
        """
        Initialize workflow engine.

        Args:
            event_engine: Optional event engine for event integration.
            notification_engine: Optional notification engine for notifications.
        """
        super().__init__()
        self._workflows: dict[str, Workflow] = {}
        self._executions: dict[str, WorkflowExecution] = {}
        self._execution_task: asyncio.Task | None = None
        self._event_engine = event_engine
        self._notification_engine = notification_engine
        self._running = False

    @classmethod
    def get_instance(
        cls,
        event_engine: EventEngine | None = None,
        notification_engine: NotificationEngine | None = None,
    ) -> WorkflowEngine:
        """
        Get singleton instance of WorkflowEngine.

        Args:
            event_engine: Optional event engine.
            notification_engine: Optional notification engine.

        Returns:
            WorkflowEngine singleton instance.
        """
        if cls._instance is None:
            cls._instance = WorkflowEngine(event_engine, notification_engine)
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance."""
        cls._instance = None

    async def start(self) -> None:
        """Start the workflow engine."""
        if self._running:
            return

        self._running = True

        # Start execution processing loop
        self._execution_task = asyncio.create_task(self._execution_loop())

        # Subscribe to event engine if available
        if self._event_engine:
            self._event_engine.on("*", self._handle_trigger_event)

        self.emit("engine:started")

    async def stop(self) -> None:
        """Stop the workflow engine."""
        self._running = False

        if self._execution_task:
            self._execution_task.cancel()
            try:
                await self._execution_task
            except asyncio.CancelledError:
                pass
            self._execution_task = None

        self.emit("engine:stopped")

    async def _execution_loop(self) -> None:
        """Process executions periodically."""
        while self._running:
            try:
                await self._process_executions()
                await asyncio.sleep(10)  # Process every 10 seconds
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.emit("engine:error", {"error": str(e)})

    async def register_workflow(self, workflow: Workflow) -> None:
        """
        Register a new workflow.

        Args:
            workflow: Workflow to register.
        """
        self._workflows[workflow.id] = workflow
        await self._save_workflows()
        self.emit("workflow:registered", workflow)

    async def unregister_workflow(self, workflow_id: str) -> bool:
        """
        Unregister a workflow.

        Args:
            workflow_id: Workflow ID to unregister.

        Returns:
            True if workflow was removed, False otherwise.
        """
        if workflow_id in self._workflows:
            workflow = self._workflows.pop(workflow_id)
            await self._save_workflows()
            self.emit("workflow:unregistered", workflow)
            return True
        return False

    async def start_execution(
        self,
        workflow_id: str,
        context: ExecutionContext | None = None,
    ) -> str:
        """
        Start workflow execution.

        Args:
            workflow_id: Workflow ID to execute.
            context: Optional execution context.

        Returns:
            Execution ID.

        Raises:
            ValueError: If workflow not found or has no start stage.
        """
        workflow = self._workflows.get(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow not found: {workflow_id}")

        # Find start stage
        start_stage = next(
            (s for s in workflow.stages if s.type == StageType.START),
            workflow.stages[0] if workflow.stages else None,
        )

        if not start_stage:
            raise ValueError("No start stage found in workflow")

        execution_id = f"exec_{int(datetime.utcnow().timestamp() * 1000)}_{uuid4().hex[:9]}"

        execution = WorkflowExecution(
            id=execution_id,
            workflow_id=workflow_id,
            status=ExecutionStatus.PENDING,
            current_stage=start_stage.id,
            start_time=datetime.utcnow(),
            context=context or ExecutionContext(),
            history=[],
        )

        self._executions[execution_id] = execution
        self.emit("execution:started", execution)

        return execution_id

    async def _process_executions(self) -> None:
        """Process all running and pending executions."""
        running_executions = [
            e
            for e in self._executions.values()
            if e.status in (ExecutionStatus.RUNNING, ExecutionStatus.PENDING)
        ]

        for execution in running_executions:
            try:
                await self._process_execution(execution)
            except Exception as e:
                await self._fail_execution(execution, e)

    async def _process_execution(self, execution: WorkflowExecution) -> None:
        """
        Process a single execution.

        Args:
            execution: Execution to process.
        """
        workflow = self._workflows.get(execution.workflow_id)
        if not workflow:
            raise ValueError(f"Workflow not found: {execution.workflow_id}")

        current_stage = next(
            (s for s in workflow.stages if s.id == execution.current_stage),
            None,
        )
        if not current_stage:
            raise ValueError(f"Stage not found: {execution.current_stage}")

        # Mark as running if pending
        if execution.status == ExecutionStatus.PENDING:
            execution.status = ExecutionStatus.RUNNING

        # Check stage conditions
        conditions_met = await self._check_stage_conditions(current_stage, execution)
        if not conditions_met:
            return  # Wait for conditions to be met

        # Execute stage actions
        action_results = await self._execute_stage_actions(current_stage, execution)

        # Record history
        self._record_stage_execution(execution, current_stage, action_results)

        # Determine next stage
        next_stage = await self._determine_next_stage(current_stage, execution)

        if next_stage:
            execution.current_stage = next_stage
        else:
            # No next stage, execution complete
            await self._complete_execution(execution)

        self.emit("execution:progress", execution)

    async def _check_stage_conditions(
        self,
        stage: WorkflowStage,
        execution: WorkflowExecution,
    ) -> bool:
        """
        Check if stage conditions are met.

        Args:
            stage: Stage to check.
            execution: Current execution.

        Returns:
            True if all conditions are met.
        """
        if not stage.conditions:
            return True

        for condition in stage.conditions:
            result = await self._evaluate_condition(condition, execution)
            if not result:
                return False

        return True

    async def _evaluate_condition(
        self,
        condition: StageCondition,
        execution: WorkflowExecution,
    ) -> bool:
        """
        Evaluate a single condition.

        Args:
            condition: Condition to evaluate.
            execution: Current execution.

        Returns:
            True if condition is met.
        """
        actual_value: Any = None

        if condition.type.value == "event":
            # Check if specific event occurred
            recent_events = await self._get_recent_events()
            actual_value = any(
                e.get(condition.field) == condition.value for e in recent_events
            )
        elif condition.type.value == "metric":
            actual_value = execution.context.metrics.get(condition.field)
        elif condition.type.value == "time":
            actual_value = datetime.utcnow()
        elif condition.type.value == "custom":
            actual_value = execution.context.variables.get(condition.field)
        else:
            return False

        return self._compare_values(actual_value, condition.operator.value, condition.value)

    def _compare_values(self, actual: Any, operator: str, expected: Any) -> bool:
        """
        Compare values based on operator.

        Args:
            actual: Actual value.
            operator: Comparison operator.
            expected: Expected value.

        Returns:
            True if comparison matches.
        """
        operator = operator.lower()

        if operator in ("equals", "==", "==="):
            return actual == expected
        elif operator in ("not_equals", "!=", "!=="):
            return actual != expected
        elif operator in ("contains",):
            return str(expected) in str(actual)
        elif operator in ("not_contains",):
            return str(expected) not in str(actual)
        elif operator in ("greater", ">"):
            try:
                return float(actual) > float(expected)
            except (ValueError, TypeError):
                return False
        elif operator in ("greater_equal", ">="):
            try:
                return float(actual) >= float(expected)
            except (ValueError, TypeError):
                return False
        elif operator in ("less", "<"):
            try:
                return float(actual) < float(expected)
            except (ValueError, TypeError):
                return False
        elif operator in ("less_equal", "<="):
            try:
                return float(actual) <= float(expected)
            except (ValueError, TypeError):
                return False
        elif operator in ("regex", "matches"):
            try:
                return bool(re.search(str(expected), str(actual)))
            except re.error:
                return False
        elif operator == "starts_with":
            return str(actual).startswith(str(expected))
        elif operator == "ends_with":
            return str(actual).endswith(str(expected))
        elif operator == "in":
            return actual in (expected if isinstance(expected, list) else [expected])
        elif operator == "not_in":
            return actual not in (expected if isinstance(expected, list) else [expected])
        elif operator == "is_null":
            return actual is None
        elif operator == "is_not_null":
            return actual is not None
        elif operator == "is_empty":
            if actual is None:
                return True
            if isinstance(actual, (list, dict, str)):
                return len(actual) == 0
            return False
        elif operator == "is_not_empty":
            if actual is None:
                return False
            if isinstance(actual, (list, dict, str)):
                return len(actual) > 0
            return True
        else:
            return False

    async def _execute_stage_actions(
        self,
        stage: WorkflowStage,
        execution: WorkflowExecution,
    ) -> list[Any]:
        """
        Execute stage actions.

        Args:
            stage: Stage with actions to execute.
            execution: Current execution.

        Returns:
            List of action results.
        """
        results: list[Any] = []

        for action in stage.actions:
            try:
                result = await self._execute_action(action, execution)
                results.append(result)
            except Exception as e:
                execution.context.errors.append(
                    ExecutionError(
                        stage=stage.id,
                        error=str(e),
                        timestamp=datetime.utcnow(),
                        recoverable=self._is_recoverable_error(e),
                    )
                )

                if not self._is_recoverable_error(e):
                    raise

        return results

    async def _execute_action(
        self,
        action: StageAction,
        execution: WorkflowExecution,
    ) -> Any:
        """
        Execute a single action.

        Args:
            action: Action to execute.
            execution: Current execution.

        Returns:
            Action result.
        """
        start_time = datetime.utcnow()

        try:
            result: Any = None

            if action.type == ActionType.NOTIFY:
                result = await self._execute_notify_action(action, execution)
            elif action.type == ActionType.LOG:
                result = await self._execute_log_action(action, execution)
            elif action.type == ActionType.METRIC:
                result = await self._execute_metric_action(action, execution)
            elif action.type == ActionType.API_CALL:
                result = await self._execute_api_call_action(action, execution)
            elif action.type == ActionType.SCRIPT:
                result = await self._execute_script_action(action, execution)
            elif action.type == ActionType.TOOL:
                result = await self._execute_tool_action(action, execution)
            elif action.type == ActionType.CUSTOM:
                result = await self._execute_custom_action(action, execution)
            else:
                raise ValueError(f"Unknown action type: {action.type}")

            return result

        except Exception as e:
            duration = (datetime.utcnow() - start_time).total_seconds() * 1000
            self.emit(
                "action:failed",
                {"action": action.type.value, "duration": duration, "error": str(e)},
            )
            raise

    async def _execute_notify_action(
        self,
        action: StageAction,
        execution: WorkflowExecution,
    ) -> dict[str, Any]:
        """Execute notify action."""
        channel = action.parameters.get("channel", "dashboard")
        message = action.parameters.get("message", "")
        priority = action.parameters.get("priority", "medium")

        interpolated_message = self._interpolate_variables(
            message, execution.context.variables
        )

        if self._notification_engine:
            await self._notification_engine.send_notification(
                title="Workflow Notification",
                message=interpolated_message,
                priority=priority,
                channels=[channel],
            )

        return {"sent": True, "channel": channel, "message": interpolated_message}

    async def _execute_log_action(
        self,
        action: StageAction,
        execution: WorkflowExecution,
    ) -> dict[str, Any]:
        """Execute log action."""
        level = action.parameters.get("level", "info")
        message = action.parameters.get("message", "")
        interpolated_message = self._interpolate_variables(
            message, execution.context.variables
        )

        # Log the message
        print(f"[{level.upper()}] {interpolated_message}")

        return {"logged": True, "level": level, "message": interpolated_message}

    async def _execute_metric_action(
        self,
        action: StageAction,
        execution: WorkflowExecution,
    ) -> dict[str, Any]:
        """Execute metric action."""
        name = action.parameters.get("name", "")
        value = action.parameters.get("value", 0)
        operation = action.parameters.get("operation", "set")

        if operation == "set":
            execution.context.metrics[name] = float(value)
        elif operation == "increment":
            current = execution.context.metrics.get(name, 0)
            execution.context.metrics[name] = current + float(value or 1)
        elif operation == "decrement":
            current = execution.context.metrics.get(name, 0)
            execution.context.metrics[name] = current - float(value or 1)

        return {
            "metric": name,
            "value": execution.context.metrics[name],
            "operation": operation,
        }

    async def _execute_api_call_action(
        self,
        action: StageAction,
        execution: WorkflowExecution,
    ) -> dict[str, Any]:
        """Execute API call action."""
        import aiohttp

        url = action.parameters.get("url", "")
        method = action.parameters.get("method", "GET")
        headers = action.parameters.get("headers", {})
        body = action.parameters.get("body")

        async with aiohttp.ClientSession() as session:
            kwargs: dict[str, Any] = {
                "headers": {"Content-Type": "application/json", **headers}
            }
            if body:
                kwargs["json"] = body

            async with session.request(method, url, **kwargs) as response:
                data = await response.json()
                return {"status": response.status, "data": data}

    async def _execute_script_action(
        self,
        action: StageAction,
        execution: WorkflowExecution,
    ) -> Any:
        """Execute script action."""
        script = action.parameters.get("script", "")
        language = action.parameters.get("language", "python")

        if language == "python":
            # Execute Python script in limited context
            context = {
                "variables": execution.context.variables,
                "metrics": execution.context.metrics,
            }

            # Create restricted globals
            safe_globals = {"__builtins__": {}, "context": context}

            try:
                exec(script, safe_globals)
                return {"executed": True, "language": language}
            except Exception as e:
                raise RuntimeError(f"Script execution failed: {e}")
        else:
            raise ValueError(f"Unsupported script language: {language}")

    async def _execute_tool_action(
        self,
        action: StageAction,
        execution: WorkflowExecution,
    ) -> dict[str, Any]:
        """Execute tool action."""
        tool = action.parameters.get("tool", "")
        # This would integrate with the MCP tool system
        return {"tool": tool, "executed": True}

    async def _execute_custom_action(
        self,
        action: StageAction,
        execution: WorkflowExecution,
    ) -> dict[str, Any]:
        """Execute custom action."""
        handler = action.parameters.get("handler", "")
        parameters = action.parameters.get("parameters", {})
        # Custom actions can be extended by plugins
        return {"custom": True, "handler": handler, "parameters": parameters}

    def _record_stage_execution(
        self,
        execution: WorkflowExecution,
        stage: WorkflowStage,
        results: list[Any],
    ) -> None:
        """Record stage execution in history."""
        history_item = ExecutionHistoryItem(
            stage=stage.id,
            action=f"execute_{stage.type.value}",
            timestamp=datetime.utcnow(),
            duration=0.0,
            result=results,
        )
        execution.history.append(history_item)

    async def _determine_next_stage(
        self,
        current_stage: WorkflowStage,
        execution: WorkflowExecution,
    ) -> str | None:
        """
        Determine next stage based on transitions.

        Args:
            current_stage: Current stage.
            execution: Current execution.

        Returns:
            Next stage ID or None if execution should complete.
        """
        if not current_stage.transitions:
            return None

        # Sort transitions by priority (descending)
        sorted_transitions = sorted(
            current_stage.transitions, key=lambda t: t.priority, reverse=True
        )

        for transition in sorted_transitions:
            if not transition.condition:
                return transition.to  # Unconditional transition

            condition_met = await self._evaluate_condition(transition.condition, execution)
            if condition_met:
                return transition.to

        return None

    async def _complete_execution(self, execution: WorkflowExecution) -> None:
        """Complete execution."""
        execution.status = ExecutionStatus.COMPLETED
        execution.end_time = datetime.utcnow()
        self.emit("execution:completed", execution)

    async def _fail_execution(
        self, execution: WorkflowExecution, error: Exception
    ) -> None:
        """Fail execution."""
        execution.status = ExecutionStatus.FAILED
        execution.end_time = datetime.utcnow()
        execution.context.errors.append(
            ExecutionError(
                stage=execution.current_stage,
                error=str(error),
                timestamp=datetime.utcnow(),
                recoverable=False,
            )
        )
        self.emit("execution:failed", execution)

    def _handle_trigger_event(self, event: Any) -> None:
        """Handle trigger events from event engine."""
        for workflow in self._workflows.values():
            for rule in workflow.rules:
                if rule.enabled and rule.trigger.type.value == "event":
                    if self._should_trigger_workflow(rule, event):
                        asyncio.create_task(
                            self.start_execution(
                                workflow.id,
                                ExecutionContext(variables={"trigger_event": event}),
                            )
                        )

    def _should_trigger_workflow(self, rule: WorkflowRule, event: Any) -> bool:
        """Check if workflow should be triggered."""
        config = rule.trigger.config
        event_type = config.get("event_type")
        conditions = config.get("conditions", [])

        # Check event type
        event_type_value = getattr(event, "type", None)
        if event_type and event_type_value != event_type:
            return False

        # Check conditions
        for condition in conditions:
            field = condition.get("field", "")
            operator = condition.get("operator", "equals")
            value = condition.get("value")

            event_value = getattr(event, field, None)
            if not self._compare_values(event_value, operator, value):
                return False

        return True

    def _interpolate_variables(
        self, template: str, variables: dict[str, Any]
    ) -> str:
        """Interpolate variables in template string."""

        def replace(match: re.Match) -> str:
            key = match.group(1)
            return str(variables.get(key, match.group(0)))

        return re.sub(r"\{\{(\w+)\}\}", replace, template)

    def _is_recoverable_error(self, error: Exception) -> bool:
        """Check if error is recoverable."""
        error_msg = str(error).lower()
        return "network" in error_msg or "timeout" in error_msg

    async def _get_recent_events(self) -> list[dict[str, Any]]:
        """Get recent events from event engine."""
        if self._event_engine:
            events = self._event_engine.get_history(limit=100)
            return [e.model_dump() if hasattr(e, "model_dump") else {} for e in events]
        return []

    async def _load_workflows(self) -> None:
        """Load workflows from storage."""
        # TODO: Implement workflow persistence
        pass

    async def _save_workflows(self) -> None:
        """Save workflows to storage."""
        # TODO: Implement workflow persistence
        pass

    # Public API methods

    def get_workflows(self) -> list[Workflow]:
        """Get all registered workflows."""
        return list(self._workflows.values())

    def get_workflow(self, workflow_id: str) -> Workflow | None:
        """Get workflow by ID."""
        return self._workflows.get(workflow_id)

    def get_execution(self, execution_id: str) -> WorkflowExecution | None:
        """Get execution by ID."""
        return self._executions.get(execution_id)

    def get_active_executions(self) -> list[WorkflowExecution]:
        """Get all active executions."""
        return [
            e
            for e in self._executions.values()
            if e.status in (ExecutionStatus.RUNNING, ExecutionStatus.PENDING)
        ]

    async def pause_execution(self, execution_id: str) -> bool:
        """Pause an execution."""
        execution = self._executions.get(execution_id)
        if execution and execution.status == ExecutionStatus.RUNNING:
            execution.status = ExecutionStatus.PAUSED
            self.emit("execution:paused", execution)
            return True
        return False

    async def resume_execution(self, execution_id: str) -> bool:
        """Resume a paused execution."""
        execution = self._executions.get(execution_id)
        if execution and execution.status == ExecutionStatus.PAUSED:
            execution.status = ExecutionStatus.RUNNING
            self.emit("execution:resumed", execution)
            return True
        return False

    async def cancel_execution(self, execution_id: str) -> bool:
        """Cancel an execution."""
        execution = self._executions.get(execution_id)
        if execution and execution.status not in (
            ExecutionStatus.COMPLETED,
            ExecutionStatus.FAILED,
        ):
            execution.status = ExecutionStatus.CANCELLED
            execution.end_time = datetime.utcnow()
            self.emit("execution:cancelled", execution)
            return True
        return False


def get_workflow_engine(
    event_engine: EventEngine | None = None,
    notification_engine: NotificationEngine | None = None,
) -> WorkflowEngine:
    """
    Get the singleton WorkflowEngine instance.

    Args:
        event_engine: Optional event engine.
        notification_engine: Optional notification engine.

    Returns:
        WorkflowEngine singleton instance.
    """
    return WorkflowEngine.get_instance(event_engine, notification_engine)
