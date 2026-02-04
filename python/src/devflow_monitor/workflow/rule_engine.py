"""
Extended Rule Engine.

Advanced rule processing with complex conditions, actions,
rate limiting, scheduling, and context filtering.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any, Callable, Coroutine
from uuid import uuid4

import aiohttp
from pyee.asyncio import AsyncIOEventEmitter

from .types import (
    ActionResult,
    AdvancedRule,
    ContextFilter,
    RuleAction,
    RuleCondition,
    RuleContext,
    RuleExecutionResult,
)

if TYPE_CHECKING:
    from ..events.types import BaseEvent


class RuleEngine(AsyncIOEventEmitter):
    """
    Extended Rule Engine class.

    Advanced rule processing with support for:
    - Complex condition evaluation with multiple operators
    - Various action types (log, notify, http_request, script, etc.)
    - Rate limiting and context filtering
    - Scheduled rule execution
    - Event-triggered rules
    """

    _instance: RuleEngine | None = None

    def __init__(self):
        """Initialize rule engine."""
        super().__init__()
        self._rules: dict[str, AdvancedRule] = {}
        self._execution_history: dict[str, list[datetime]] = {}
        self._rule_processor_task: asyncio.Task | None = None
        self._scheduled_rules: dict[str, asyncio.Task] = {}
        self._running = False

    @classmethod
    def get_instance(cls) -> RuleEngine:
        """
        Get singleton instance of RuleEngine.

        Returns:
            RuleEngine singleton instance.
        """
        if cls._instance is None:
            cls._instance = RuleEngine()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance."""
        cls._instance = None

    async def start(self) -> None:
        """Start the rule engine."""
        if self._running:
            return

        self._running = True
        # MCP on-demand mode - no background polling
        self.emit("engine:started")

    async def stop(self) -> None:
        """Stop the rule engine."""
        self._running = False

        if self._rule_processor_task:
            self._rule_processor_task.cancel()
            try:
                await self._rule_processor_task
            except asyncio.CancelledError:
                pass
            self._rule_processor_task = None

        # Cancel scheduled rules
        for task in self._scheduled_rules.values():
            task.cancel()
        self._scheduled_rules.clear()

        self.emit("engine:stopped")

    async def register_rule(self, rule: AdvancedRule) -> None:
        """
        Register a new rule.

        Args:
            rule: Rule to register.

        Raises:
            ValueError: If rule is invalid.
        """
        self._validate_rule(rule)
        self._rules[rule.id] = rule

        # Setup schedule if needed
        if rule.schedule and rule.trigger.type.value == "schedule":
            self._setup_rule_schedule(rule)

        await self._save_rules()
        self.emit("rule:registered", rule)

    async def unregister_rule(self, rule_id: str) -> bool:
        """
        Unregister a rule.

        Args:
            rule_id: Rule ID to unregister.

        Returns:
            True if rule was removed, False otherwise.
        """
        if rule_id in self._rules:
            rule = self._rules.pop(rule_id)

            # Cancel schedule if exists
            if rule_id in self._scheduled_rules:
                self._scheduled_rules[rule_id].cancel()
                del self._scheduled_rules[rule_id]

            await self._save_rules()
            self.emit("rule:unregistered", rule)
            return True
        return False

    async def process_event(self, event: BaseEvent) -> list[RuleExecutionResult]:
        """
        Process event-triggered rules.

        Args:
            event: Event to process.

        Returns:
            List of rule execution results.
        """
        results: list[RuleExecutionResult] = []

        # Get event-triggered rules sorted by priority
        event_rules = sorted(
            [
                r
                for r in self._rules.values()
                if r.enabled and r.trigger.type.value == "event"
            ],
            key=lambda r: r.priority,
            reverse=True,
        )

        for rule in event_rules:
            try:
                context = RuleContext(
                    event=event,
                    metrics={},
                    variables={},
                    timestamp=datetime.utcnow(),
                    execution_id=f"exec_{int(datetime.utcnow().timestamp() * 1000)}_{uuid4().hex[:6]}",
                )

                result = await self._execute_rule(rule, context)
                results.append(result)

                if result.executed:
                    self._record_execution(rule.id)

            except Exception as e:
                results.append(
                    RuleExecutionResult(
                        rule_id=rule.id,
                        executed=False,
                        actions=[],
                        duration=0.0,
                        error=str(e),
                    )
                )

        return results

    async def _execute_rule(
        self, rule: AdvancedRule, context: RuleContext
    ) -> RuleExecutionResult:
        """
        Execute a specific rule.

        Args:
            rule: Rule to execute.
            context: Execution context.

        Returns:
            Rule execution result.
        """
        start_time = datetime.utcnow()

        try:
            # Check rate limiting
            if rule.rate_limiting and not self._check_rate_limit(rule):
                return RuleExecutionResult(
                    rule_id=rule.id,
                    executed=False,
                    actions=[],
                    duration=(datetime.utcnow() - start_time).total_seconds() * 1000,
                    error="Rate limit exceeded",
                )

            # Check context filters
            if rule.context_filters and not self._check_context_filters(
                rule.context_filters, context
            ):
                return RuleExecutionResult(
                    rule_id=rule.id,
                    executed=False,
                    actions=[],
                    duration=(datetime.utcnow() - start_time).total_seconds() * 1000,
                    error="Context filters not met",
                )

            # Evaluate conditions
            conditions_met = await self._evaluate_conditions(rule.conditions, context)
            if not conditions_met:
                return RuleExecutionResult(
                    rule_id=rule.id,
                    executed=False,
                    actions=[],
                    duration=(datetime.utcnow() - start_time).total_seconds() * 1000,
                )

            # Execute actions
            action_results = await self._execute_actions(rule.actions, context)

            result = RuleExecutionResult(
                rule_id=rule.id,
                executed=True,
                actions=action_results,
                duration=(datetime.utcnow() - start_time).total_seconds() * 1000,
            )

            self.emit("rule:executed", result)
            return result

        except Exception as e:
            return RuleExecutionResult(
                rule_id=rule.id,
                executed=False,
                actions=[],
                duration=(datetime.utcnow() - start_time).total_seconds() * 1000,
                error=str(e),
            )

    async def _evaluate_conditions(
        self, conditions: list[RuleCondition], context: RuleContext
    ) -> bool:
        """
        Evaluate rule conditions.

        Args:
            conditions: Conditions to evaluate.
            context: Execution context.

        Returns:
            True if all conditions are met.
        """
        if not conditions:
            return True

        result = True
        last_combinator = "AND"

        for condition in conditions:
            condition_result = await self._evaluate_condition(condition, context)

            if last_combinator == "AND":
                result = result and condition_result
            else:
                result = result or condition_result

            last_combinator = condition.combine_with.value if condition.combine_with else "AND"

        return result

    async def _evaluate_condition(
        self, condition: RuleCondition, context: RuleContext
    ) -> bool:
        """
        Evaluate a single condition.

        Args:
            condition: Condition to evaluate.
            context: Execution context.

        Returns:
            True if condition is met.
        """
        # Extract value from context
        if condition.field.startswith("event."):
            field = condition.field[6:]
            actual_value = self._get_nested_value(context.event, field)
        elif condition.field.startswith("metrics."):
            field = condition.field[8:]
            actual_value = context.metrics.get(field)
        elif condition.field.startswith("variables."):
            field = condition.field[10:]
            actual_value = context.variables.get(field)
        else:
            actual_value = self._get_nested_value(context, condition.field)

        # Apply operator
        return self._apply_operator(actual_value, condition.operator, condition.value)

    def _apply_operator(self, actual: Any, operator: str, expected: Any) -> bool:
        """
        Apply comparison operator.

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
        elif operator == "contains":
            return str(expected) in str(actual)
        elif operator == "not_contains":
            return str(expected) not in str(actual)
        elif operator == "starts_with":
            return str(actual).startswith(str(expected))
        elif operator == "ends_with":
            return str(actual).endswith(str(expected))
        elif operator in ("regex", "matches"):
            try:
                return bool(re.search(str(expected), str(actual)))
            except re.error:
                return False
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
            print(f"Unknown operator: {operator}")
            return False

    async def _execute_actions(
        self, actions: list[RuleAction], context: RuleContext
    ) -> list[ActionResult]:
        """
        Execute rule actions.

        Args:
            actions: Actions to execute.
            context: Execution context.

        Returns:
            List of action results.
        """
        results: list[ActionResult] = []

        # Sort actions by order
        sorted_actions = sorted(actions, key=lambda a: a.order)

        for action in sorted_actions:
            action_result = await self._execute_action(action, context)
            results.append(action_result)

            # Stop on first failure if specified
            if not action_result.success and action.config.get("stop_on_failure", False):
                break

        return results

    async def _execute_action(
        self, action: RuleAction, context: RuleContext
    ) -> ActionResult:
        """
        Execute a single action.

        Args:
            action: Action to execute.
            context: Execution context.

        Returns:
            Action result.
        """
        start_time = datetime.utcnow()

        try:
            result: Any = None

            if action.type == "log":
                result = await self._execute_log_action(action, context)
            elif action.type == "notify":
                result = await self._execute_notify_action(action, context)
            elif action.type == "set_variable":
                result = await self._execute_set_variable_action(action, context)
            elif action.type == "increment_metric":
                result = await self._execute_increment_metric_action(action, context)
            elif action.type == "http_request":
                result = await self._execute_http_request_action(action, context)
            elif action.type == "delay":
                result = await self._execute_delay_action(action, context)
            elif action.type == "script":
                result = await self._execute_script_action(action, context)
            elif action.type == "workflow":
                result = await self._execute_workflow_action(action, context)
            else:
                raise ValueError(f"Unknown action type: {action.type}")

            return ActionResult(
                type=action.type,
                success=True,
                result=result,
                duration=(datetime.utcnow() - start_time).total_seconds() * 1000,
            )

        except Exception as e:
            return ActionResult(
                type=action.type,
                success=False,
                error=str(e),
                duration=(datetime.utcnow() - start_time).total_seconds() * 1000,
            )

    async def _execute_log_action(
        self, action: RuleAction, context: RuleContext
    ) -> dict[str, Any]:
        """Execute log action."""
        level = action.config.get("level", "info")
        message = action.config.get("message", "")
        interpolated_message = self._interpolate_template(message, context)

        print(f"[{level.upper()}] {interpolated_message}")

        return {"logged": True, "level": level, "message": interpolated_message}

    async def _execute_notify_action(
        self, action: RuleAction, context: RuleContext
    ) -> dict[str, Any]:
        """Execute notify action."""
        title = action.config.get("title", "")
        message = action.config.get("message", "")
        priority = action.config.get("priority", "medium")
        channels = action.config.get("channels", ["dashboard"])

        self.emit(
            "notification:required",
            {
                "title": self._interpolate_template(title, context),
                "message": self._interpolate_template(message, context),
                "priority": priority,
                "channels": channels if isinstance(channels, list) else [channels],
            },
        )

        return {"sent": True}

    async def _execute_set_variable_action(
        self, action: RuleAction, context: RuleContext
    ) -> dict[str, Any]:
        """Execute set variable action."""
        name = action.config.get("name", "")
        value = action.config.get("value", "")
        scope = action.config.get("scope", "local")

        interpolated_value = self._interpolate_template(str(value), context)

        if scope == "local":
            context.variables[name] = interpolated_value
        # Global variable storage would go here

        return {"variable": name, "value": interpolated_value, "scope": scope}

    async def _execute_increment_metric_action(
        self, action: RuleAction, context: RuleContext
    ) -> dict[str, Any]:
        """Execute increment metric action."""
        name = action.config.get("name", "")
        amount = action.config.get("amount", 1)

        context.metrics[name] = context.metrics.get(name, 0) + float(amount)

        return {"metric": name, "value": context.metrics[name]}

    async def _execute_http_request_action(
        self, action: RuleAction, context: RuleContext
    ) -> dict[str, Any]:
        """Execute HTTP request action."""
        url = action.config.get("url", "")
        method = action.config.get("method", "GET")
        headers = action.config.get("headers", {})
        body = action.config.get("body")

        async with aiohttp.ClientSession() as session:
            kwargs: dict[str, Any] = {
                "headers": self._interpolate_object(headers, context)
            }
            if body:
                kwargs["json"] = self._interpolate_object(body, context)

            async with session.request(
                method, self._interpolate_template(url, context), **kwargs
            ) as response:
                data = await response.json()
                return {"status": response.status, "data": data}

    async def _execute_delay_action(
        self, action: RuleAction, context: RuleContext
    ) -> dict[str, Any]:
        """Execute delay action."""
        duration = action.config.get("duration", 1000)
        await asyncio.sleep(duration / 1000)  # Convert ms to seconds
        return {"delayed": True, "duration": duration}

    async def _execute_script_action(
        self, action: RuleAction, context: RuleContext
    ) -> Any:
        """Execute script action."""
        script = action.config.get("script", "")
        language = action.config.get("language", "python")

        if language == "python":
            # Create restricted context
            script_context = {
                "variables": context.variables,
                "metrics": context.metrics,
            }
            safe_globals = {"__builtins__": {}, "context": script_context}

            try:
                exec(script, safe_globals)
                return {"executed": True}
            except Exception as e:
                raise RuntimeError(f"Script execution failed: {e}")
        else:
            raise ValueError(f"Unsupported script language: {language}")

    async def _execute_workflow_action(
        self, action: RuleAction, context: RuleContext
    ) -> dict[str, Any]:
        """Execute workflow action."""
        workflow_id = action.config.get("workflow_id", "")
        variables = action.config.get("variables", {})

        self.emit(
            "workflow:trigger",
            {
                "workflow_id": workflow_id,
                "variables": self._interpolate_object(variables, context),
            },
        )

        return {"triggered": True, "workflow_id": workflow_id}

    # Helper methods

    def _get_nested_value(self, obj: Any, path: str) -> Any:
        """Get nested value from object by path."""
        if obj is None:
            return None

        parts = path.split(".")
        current = obj

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            elif hasattr(current, part):
                current = getattr(current, part)
            elif hasattr(current, "model_dump"):
                current = current.model_dump().get(part)
            else:
                return None

        return current

    def _interpolate_template(self, template: str, context: RuleContext) -> str:
        """Interpolate variables in template string."""
        if not template or not isinstance(template, str):
            return template

        def replace(match: re.Match) -> str:
            path = match.group(1).strip()
            value = self._get_nested_value(context, path)
            return str(value) if value is not None else match.group(0)

        return re.sub(r"\{\{([^}]+)\}\}", replace, template)

    def _interpolate_object(self, obj: Any, context: RuleContext) -> Any:
        """Recursively interpolate variables in object."""
        if isinstance(obj, str):
            return self._interpolate_template(obj, context)
        elif isinstance(obj, list):
            return [self._interpolate_object(item, context) for item in obj]
        elif isinstance(obj, dict):
            return {
                key: self._interpolate_object(value, context)
                for key, value in obj.items()
            }
        return obj

    def _check_rate_limit(self, rule: AdvancedRule) -> bool:
        """Check if rule is within rate limit."""
        if not rule.rate_limiting:
            return True

        executions = self._execution_history.get(rule.id, [])
        now = datetime.utcnow()
        window_start = now - timedelta(milliseconds=rule.rate_limiting.time_window)

        # Filter executions within time window
        recent_executions = [
            exec_time for exec_time in executions if exec_time > window_start
        ]

        return len(recent_executions) < rule.rate_limiting.max_executions

    def _check_context_filters(
        self, filters: list[ContextFilter], context: RuleContext
    ) -> bool:
        """Check context filters."""
        for filter_def in filters:
            value = self._get_nested_value(context, filter_def.field)
            result = self._apply_operator(value, filter_def.operator, filter_def.value)

            if filter_def.negate:
                result = not result

            if not result:
                return False

        return True

    def _record_execution(self, rule_id: str) -> None:
        """Record rule execution."""
        if rule_id not in self._execution_history:
            self._execution_history[rule_id] = []

        self._execution_history[rule_id].append(datetime.utcnow())

        # Keep only recent executions (last 24 hours)
        day_ago = datetime.utcnow() - timedelta(hours=24)
        self._execution_history[rule_id] = [
            exec_time
            for exec_time in self._execution_history[rule_id]
            if exec_time > day_ago
        ]

    def _validate_rule(self, rule: AdvancedRule) -> None:
        """Validate rule."""
        if not rule.id or not rule.name:
            raise ValueError("Rule must have id and name")

        if not rule.trigger or not rule.trigger.type:
            raise ValueError("Rule must have a trigger")

        if not rule.actions:
            raise ValueError("Rule must have at least one action")

    def _setup_rule_schedule(self, rule: AdvancedRule) -> None:
        """Setup rule schedule."""
        if not rule.schedule:
            return

        # Simple interval-based scheduling
        interval = self._parse_cron_expression(rule.schedule.expression)

        if interval > 0:

            async def scheduled_execution():
                while self._running:
                    await asyncio.sleep(interval / 1000)  # Convert ms to seconds
                    context = RuleContext(
                        metrics={},
                        variables={},
                        timestamp=datetime.utcnow(),
                        execution_id=f"scheduled_{int(datetime.utcnow().timestamp() * 1000)}",
                    )
                    try:
                        await self._execute_rule(rule, context)
                    except Exception as e:
                        print(f"Error executing scheduled rule {rule.id}: {e}")

            task = asyncio.create_task(scheduled_execution())
            self._scheduled_rules[rule.id] = task

    def _parse_cron_expression(self, expression: str) -> int:
        """Parse cron expression to interval in milliseconds."""
        if "* * * * *" in expression:
            return 60000  # Every minute
        if "0 * * * *" in expression:
            return 3600000  # Every hour
        if "0 0 * * *" in expression:
            return 86400000  # Every day
        return 0

    async def _load_rules(self) -> None:
        """Load rules from storage."""
        # TODO: Implement rule persistence
        pass

    async def _save_rules(self) -> None:
        """Save rules to storage."""
        # TODO: Implement rule persistence
        pass

    # Public API methods

    def get_rules(self) -> list[AdvancedRule]:
        """Get all registered rules."""
        return list(self._rules.values())

    def get_rule(self, rule_id: str) -> AdvancedRule | None:
        """Get rule by ID."""
        return self._rules.get(rule_id)

    async def update_rule(self, rule: AdvancedRule) -> None:
        """Update a rule."""
        self._validate_rule(rule)
        self._rules[rule.id] = rule

        # Update schedule if needed
        if rule.schedule and rule.trigger.type.value == "schedule":
            # Cancel old schedule
            if rule.id in self._scheduled_rules:
                self._scheduled_rules[rule.id].cancel()
                del self._scheduled_rules[rule.id]

            # Setup new schedule
            self._setup_rule_schedule(rule)

        await self._save_rules()
        self.emit("rule:updated", rule)

    async def delete_rule(self, rule_id: str) -> bool:
        """Delete a rule."""
        return await self.unregister_rule(rule_id)

    async def enable_rule(self, rule_id: str) -> bool:
        """Enable a rule."""
        rule = self._rules.get(rule_id)
        if rule:
            rule.enabled = True
            await self.update_rule(rule)
            return True
        return False

    async def disable_rule(self, rule_id: str) -> bool:
        """Disable a rule."""
        rule = self._rules.get(rule_id)
        if rule:
            rule.enabled = False
            await self.update_rule(rule)
            return True
        return False

    def get_execution_history(self, rule_id: str) -> list[datetime]:
        """Get execution history for a rule."""
        return self._execution_history.get(rule_id, [])


def get_rule_engine() -> RuleEngine:
    """
    Get the singleton RuleEngine instance.

    Returns:
        RuleEngine singleton instance.
    """
    return RuleEngine.get_instance()
