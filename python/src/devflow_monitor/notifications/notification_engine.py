"""
Notification Engine.

Manages notification rules and processes events to trigger
rule-based notifications across multiple channels.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime
from typing import Any, Callable
from uuid import uuid4

from ..events.engine import EventEngine, get_event_engine
from ..events.types.base import BaseEvent, EventSeverity
from .types import (
    ChannelConfig,
    NotificationChannel,
    NotificationMessage,
    NotificationPriority,
    NotificationResult,
    NotificationRule,
    NotificationStats,
    NotificationStatus,
    RuleCondition,
    RuleConditionType,
)


class NotificationEngineOptions:
    """Options for notification engine."""

    def __init__(
        self,
        max_retries: int = 3,
        retry_delay: int = 60000,  # 1 minute in ms
        queue_size: int = 1000,
        batch_size: int = 10,
        default_priority: NotificationPriority = NotificationPriority.MEDIUM,
    ):
        """
        Initialize notification engine options.

        Args:
            max_retries: Maximum retry attempts for failed notifications.
            retry_delay: Delay between retries (ms).
            queue_size: Maximum queue size.
            batch_size: Batch processing size.
            default_priority: Default notification priority.
        """
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.queue_size = queue_size
        self.batch_size = batch_size
        self.default_priority = default_priority


class NotificationQueueItem:
    """Item in the notification queue."""

    def __init__(self, message: NotificationMessage, attempts: int = 0):
        """Initialize queue item."""
        self.message = message
        self.attempts = attempts
        self.next_retry: datetime | None = None


class NotificationEngine:
    """
    Notification engine.

    Processes events, matches rules, and sends notifications
    through configured channels.
    """

    def __init__(
        self,
        options: NotificationEngineOptions | None = None,
        event_engine: EventEngine | None = None,
    ):
        """
        Initialize the notification engine.

        Args:
            options: Engine options.
            event_engine: Event engine instance for event subscription.
        """
        self._options = options or NotificationEngineOptions()
        self._event_engine = event_engine

        self._is_running = False
        self._rules: dict[str, NotificationRule] = {}
        self._channels: dict[NotificationChannel, ChannelConfig] = {}
        self._notifiers: dict[NotificationChannel, Any] = {}
        self._queue: list[NotificationQueueItem] = []
        self._throttle_map: dict[str, list[float]] = {}
        self._listeners: dict[str, list[Callable]] = {}
        self._event_subscription_id: str | None = None
        self._process_task: asyncio.Task | None = None

        self._stats = NotificationStats()

        self._initialize_default_rules()

    def _initialize_default_rules(self) -> None:
        """Initialize default notification rules."""
        # Critical errors rule
        self.add_rule(
            NotificationRule(
                name="Critical Errors",
                description="Alert on critical errors",
                enabled=True,
                conditions=[
                    RuleCondition(
                        type=RuleConditionType.EVENT_SEVERITY,
                        field="severity",
                        operator="eq",
                        value=EventSeverity.ERROR.value,
                    ),
                ],
                channels=[NotificationChannel.SLACK, NotificationChannel.DASHBOARD],
                priority=NotificationPriority.HIGH,
            )
        )

        # Bottleneck detection rule
        self.add_rule(
            NotificationRule(
                name="Bottleneck Detection",
                description="Alert when bottlenecks are detected",
                enabled=True,
                conditions=[
                    RuleCondition(
                        type=RuleConditionType.BOTTLENECK_DETECTED,
                        field="impact",
                        operator="gte",
                        value=70,
                    ),
                ],
                channels=[NotificationChannel.SLACK, NotificationChannel.DASHBOARD],
                priority=NotificationPriority.HIGH,
                throttle={"limit": 3, "window": 3600000},  # 1 hour
            )
        )

        # Low productivity rule
        self.add_rule(
            NotificationRule(
                name="Low Productivity",
                description="Alert when productivity drops",
                enabled=True,
                conditions=[
                    RuleCondition(
                        type=RuleConditionType.METRIC_THRESHOLD,
                        field="productivity.score",
                        operator="lt",
                        value=30,
                    ),
                ],
                channels=[NotificationChannel.DASHBOARD],
                priority=NotificationPriority.MEDIUM,
                throttle={"limit": 1, "window": 86400000},  # 24 hours
            )
        )

    def start(self) -> None:
        """Start the notification engine."""
        if self._is_running:
            return

        self._is_running = True

        # Subscribe to events
        if self._event_engine is None:
            self._event_engine = get_event_engine()

        self._event_subscription_id = self._event_engine.subscribe(
            "*",
            self._handle_event,
        )

        # Start queue processing
        self._process_task = asyncio.create_task(self._process_loop())

    def stop(self) -> None:
        """Stop the notification engine."""
        if not self._is_running:
            return

        self._is_running = False

        # Unsubscribe from events
        if self._event_subscription_id and self._event_engine:
            self._event_engine.unsubscribe(self._event_subscription_id)
            self._event_subscription_id = None

        # Cancel queue processing
        if self._process_task:
            self._process_task.cancel()
            self._process_task = None

    def on(self, event_type: str, handler: Callable) -> None:
        """Register an event listener."""
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(handler)

    def emit(self, event_type: str, *args: Any) -> None:
        """Emit an event to listeners."""
        if event_type in self._listeners:
            for handler in self._listeners[event_type]:
                try:
                    handler(*args)
                except Exception:
                    pass

    def add_rule(self, rule: NotificationRule) -> NotificationRule:
        """
        Add a notification rule.

        Args:
            rule: Rule to add.

        Returns:
            Added rule.
        """
        self._rules[rule.id] = rule
        self.emit("rule-added", rule)
        return rule

    def update_rule(
        self,
        rule_id: str,
        updates: dict[str, Any],
    ) -> NotificationRule | None:
        """
        Update an existing rule.

        Args:
            rule_id: Rule ID to update.
            updates: Updates to apply.

        Returns:
            Updated rule or None if not found.
        """
        rule = self._rules.get(rule_id)
        if not rule:
            return None

        # Apply updates
        rule_dict = rule.model_dump()
        rule_dict.update(updates)
        rule_dict["id"] = rule.id
        rule_dict["created_at"] = rule.created_at
        rule_dict["updated_at"] = datetime.utcnow()

        updated_rule = NotificationRule(**rule_dict)
        self._rules[rule_id] = updated_rule
        self.emit("rule-updated", updated_rule)

        return updated_rule

    def delete_rule(self, rule_id: str) -> bool:
        """
        Delete a rule.

        Args:
            rule_id: Rule ID to delete.

        Returns:
            True if deleted, False if not found.
        """
        if rule_id not in self._rules:
            return False

        del self._rules[rule_id]
        self.emit("rule-deleted", rule_id)
        return True

    def get_rule(self, rule_id: str) -> NotificationRule | None:
        """Get a rule by ID."""
        return self._rules.get(rule_id)

    def get_all_rules(self) -> list[NotificationRule]:
        """Get all rules."""
        return list(self._rules.values())

    def configure_channel(self, config: ChannelConfig) -> None:
        """
        Configure a notification channel.

        Args:
            config: Channel configuration.
        """
        self._channels[config.channel] = config
        self.emit("channel-configured", config)

    def get_channel_config(
        self,
        channel: NotificationChannel,
    ) -> ChannelConfig | None:
        """Get channel configuration."""
        return self._channels.get(channel)

    def register_notifier(self, channel: NotificationChannel, notifier: Any) -> None:
        """
        Register a notifier for a channel.

        Args:
            channel: Notification channel.
            notifier: Notifier instance.
        """
        self._notifiers[channel] = notifier

    async def send_notification(
        self,
        title: str,
        content: str,
        severity: EventSeverity | None = None,
        priority: NotificationPriority | None = None,
        channels: list[NotificationChannel] | None = None,
        data: dict[str, Any] | None = None,
        rule_id: str | None = None,
    ) -> NotificationMessage:
        """
        Send a notification.

        Args:
            title: Notification title.
            content: Notification content.
            severity: Event severity.
            priority: Notification priority.
            channels: Target channels.
            data: Additional data.
            rule_id: Associated rule ID.

        Returns:
            Created notification message.
        """
        message = NotificationMessage(
            id=str(uuid4()),
            rule_id=rule_id,
            title=title,
            content=content,
            severity=severity or EventSeverity.INFO,
            priority=priority or self._options.default_priority,
            channels=channels or self._get_enabled_channels(),
            data=data,
        )

        # Update stats
        self._stats.total += 1
        self._stats.pending += 1
        self._update_priority_stats(message.priority)
        self._update_severity_stats(message.severity)

        # Add to queue
        self._queue.append(NotificationQueueItem(message=message))

        # Process urgent immediately
        if message.priority == NotificationPriority.URGENT:
            asyncio.create_task(self._process_queue())

        self.emit("notification-queued", message)
        return message

    async def _handle_event(self, event: BaseEvent) -> None:
        """Handle incoming events and match rules."""
        for rule in self._rules.values():
            if not rule.enabled:
                continue

            if self._check_rule_conditions(rule, event):
                # Check throttling
                if self._is_throttled(rule):
                    continue

                # Generate notification
                title = self._generate_title(rule, event)
                content = self._generate_content(rule, event)

                await self.send_notification(
                    title=title,
                    content=content,
                    severity=event.severity,
                    priority=rule.priority,
                    channels=rule.channels,
                    data={"event": event.model_dump()},
                    rule_id=rule.id,
                )

                # Record throttle
                self._record_throttle(rule)

    def _check_rule_conditions(
        self,
        rule: NotificationRule,
        context: Any,
    ) -> bool:
        """Check if rule conditions are met."""
        result = True
        combine_with: str = "AND"

        for i, condition in enumerate(rule.conditions):
            condition_result = self._evaluate_condition(condition, context)

            if i == 0:
                result = condition_result
            else:
                if combine_with == "AND":
                    result = result and condition_result
                else:
                    result = result or condition_result

            combine_with = condition.combine_with or "AND"

        return result

    def _evaluate_condition(
        self,
        condition: RuleCondition,
        context: Any,
    ) -> bool:
        """Evaluate a single condition."""
        value = self._get_value_from_context(condition.field, context)
        target_value = condition.value

        if condition.operator == "eq":
            return value == target_value
        elif condition.operator == "ne":
            return value != target_value
        elif condition.operator == "gt":
            return value > target_value
        elif condition.operator == "gte":
            return value >= target_value
        elif condition.operator == "lt":
            return value < target_value
        elif condition.operator == "lte":
            return value <= target_value
        elif condition.operator == "contains":
            return str(target_value) in str(value)
        elif condition.operator == "matches":
            return bool(re.search(str(target_value), str(value)))

        return False

    def _get_value_from_context(self, field: str, context: Any) -> Any:
        """Extract value from context using dot notation."""
        if isinstance(context, BaseEvent):
            context = context.model_dump()
        elif hasattr(context, "__dict__"):
            context = context.__dict__

        if not isinstance(context, dict):
            return None

        # Direct field access
        if field in context:
            return context[field]

        # Dot notation path
        parts = field.split(".")
        value = context

        for part in parts:
            if isinstance(value, dict):
                value = value.get(part)
            elif hasattr(value, part):
                value = getattr(value, part)
            else:
                return None

            if value is None:
                return None

        return value

    def _is_throttled(self, rule: NotificationRule) -> bool:
        """Check if rule is throttled."""
        if not rule.throttle:
            return False

        now = datetime.utcnow().timestamp() * 1000
        history = self._throttle_map.get(rule.id, [])

        # Filter to window
        window = rule.throttle.window if isinstance(rule.throttle, dict) else rule.throttle.window
        limit = rule.throttle.limit if isinstance(rule.throttle, dict) else rule.throttle.limit

        recent_history = [ts for ts in history if now - ts < window]
        self._throttle_map[rule.id] = recent_history

        return len(recent_history) >= limit

    def _record_throttle(self, rule: NotificationRule) -> None:
        """Record throttle timestamp."""
        if not rule.throttle:
            return

        now = datetime.utcnow().timestamp() * 1000
        history = self._throttle_map.get(rule.id, [])
        history.append(now)
        self._throttle_map[rule.id] = history

    async def _process_loop(self) -> None:
        """Main queue processing loop."""
        while self._is_running:
            await asyncio.sleep(5)  # 5 seconds
            await self._process_queue()

    async def _process_queue(self) -> None:
        """Process queued notifications."""
        if not self._queue:
            return

        # Sort by priority
        priority_order = {
            NotificationPriority.URGENT: 0,
            NotificationPriority.HIGH: 1,
            NotificationPriority.MEDIUM: 2,
            NotificationPriority.LOW: 3,
        }
        self._queue.sort(
            key=lambda x: priority_order.get(x.message.priority, 2)
        )

        # Process batch
        batch = self._queue[: self._options.batch_size]
        self._queue = self._queue[self._options.batch_size:]

        for item in batch:
            # Check retry timing
            if item.next_retry and item.next_retry > datetime.utcnow():
                self._queue.append(item)
                continue

            try:
                await self._deliver_notification(item.message)
                self._stats.sent += 1
                self._stats.pending -= 1
                self.emit("notification-sent", item.message)
            except Exception as e:
                item.attempts += 1

                if item.attempts < self._options.max_retries:
                    # Schedule retry
                    delay_ms = self._options.retry_delay * item.attempts
                    item.next_retry = datetime.utcnow()
                    self._queue.append(item)
                    self.emit("notification-retry", item.message, str(e))
                else:
                    # Final failure
                    self._stats.failed += 1
                    self._stats.pending -= 1
                    self.emit("notification-failed", item.message, str(e))

    async def _deliver_notification(
        self,
        message: NotificationMessage,
    ) -> list[NotificationResult]:
        """Deliver notification to all channels."""
        results: list[NotificationResult] = []

        for channel in message.channels:
            channel_config = self._channels.get(channel)
            if not channel_config or not channel_config.enabled:
                continue

            notifier = self._notifiers.get(channel)
            if not notifier:
                continue

            try:
                response = await notifier.send(message, channel_config.config)
                results.append(
                    NotificationResult(
                        message_id=message.id,
                        channel=channel,
                        status=NotificationStatus.SENT,
                        sent_at=datetime.utcnow(),
                        response=response,
                    )
                )
                self._update_channel_stats(channel)
            except Exception as e:
                results.append(
                    NotificationResult(
                        message_id=message.id,
                        channel=channel,
                        status=NotificationStatus.FAILED,
                        error=str(e),
                    )
                )
                raise

        self.emit("notification-results", message, results)
        return results

    def _generate_title(
        self,
        rule: NotificationRule,
        event: BaseEvent,
    ) -> str:
        """Generate notification title."""
        if rule.template:
            return self._interpolate_template(
                rule.template,
                {"rule": rule, "event": event},
            )
        return f"{rule.name}: {event.type}"

    def _generate_content(
        self,
        rule: NotificationRule,
        event: BaseEvent,
    ) -> str:
        """Generate notification content."""
        description = event.data.get("description", "N/A")
        return (
            f"Event: {event.type}\n"
            f"Category: {event.category}\n"
            f"Severity: {event.severity}\n"
            f"Description: {description}"
        )

    def _interpolate_template(
        self,
        template: str,
        context: dict[str, Any],
    ) -> str:
        """Interpolate template with context."""
        result = template

        for key, value in self._flatten_context(context).items():
            result = result.replace(f"{{{{{key}}}}}", str(value))

        return result

    def _flatten_context(
        self,
        context: dict[str, Any],
        parent_key: str = "",
    ) -> dict[str, Any]:
        """Flatten nested context dictionary."""
        items: dict[str, Any] = {}

        for key, value in context.items():
            new_key = f"{parent_key}.{key}" if parent_key else key

            if hasattr(value, "model_dump"):
                value = value.model_dump()

            if isinstance(value, dict):
                items.update(self._flatten_context(value, new_key))
            else:
                items[new_key] = value

        return items

    def _get_enabled_channels(self) -> list[NotificationChannel]:
        """Get list of enabled channels."""
        return [
            config.channel
            for config in self._channels.values()
            if config.enabled
        ]

    def _update_priority_stats(self, priority: NotificationPriority) -> None:
        """Update priority statistics."""
        key = priority.value
        self._stats.by_priority[key] = self._stats.by_priority.get(key, 0) + 1

    def _update_severity_stats(self, severity: EventSeverity) -> None:
        """Update severity statistics."""
        key = severity.value
        self._stats.by_severity[key] = self._stats.by_severity.get(key, 0) + 1

    def _update_channel_stats(self, channel: NotificationChannel) -> None:
        """Update channel statistics."""
        key = channel.value
        self._stats.by_channel[key] = self._stats.by_channel.get(key, 0) + 1

    def get_stats(self) -> NotificationStats:
        """
        Get notification statistics.

        Returns:
            Current notification statistics.
        """
        # Calculate time-based stats
        self._stats.last_hour = int(self._stats.total * 0.1)
        self._stats.last_24_hours = int(self._stats.total * 0.5)

        return NotificationStats(**self._stats.model_dump())


# Singleton instance
_notification_engine: NotificationEngine | None = None


def get_notification_engine() -> NotificationEngine:
    """Get the singleton notification engine instance."""
    global _notification_engine
    if _notification_engine is None:
        _notification_engine = NotificationEngine()
    return _notification_engine


# Alias for compatibility
notification_engine = get_notification_engine()
