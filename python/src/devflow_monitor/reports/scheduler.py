"""
Report Scheduler.

Manages scheduled report generation using APScheduler.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Any, Callable
from uuid import uuid4

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .delivery import ReportDelivery
from .report_engine import ReportEngine
from .types import (
    ReportConfig,
    ReportEventType,
    ReportResult,
    ReportSchedule,
    SchedulePattern,
)


class SchedulerConfig:
    """Scheduler configuration."""

    def __init__(
        self,
        enabled: bool = True,
        max_concurrent_jobs: int = 5,
        default_timezone: str = "UTC",
        check_interval: int = 60000,  # 1 minute in ms
        retry_attempts: int = 3,
        retry_delay: int = 300000,  # 5 minutes in ms
    ):
        """
        Initialize scheduler configuration.

        Args:
            enabled: Whether scheduler is enabled.
            max_concurrent_jobs: Maximum concurrent job executions.
            default_timezone: Default timezone for schedules.
            check_interval: Interval for checking schedules (ms).
            retry_attempts: Number of retry attempts on failure.
            retry_delay: Delay between retries (ms).
        """
        self.enabled = enabled
        self.max_concurrent_jobs = max_concurrent_jobs
        self.default_timezone = default_timezone
        self.check_interval = check_interval
        self.retry_attempts = retry_attempts
        self.retry_delay = retry_delay


class ScheduleJob:
    """Represents a scheduled job."""

    def __init__(
        self,
        id: str,
        schedule: ReportSchedule,
        running: bool = False,
    ):
        """Initialize schedule job."""
        self.id = id
        self.schedule = schedule
        self.running = running
        self.last_result: ReportResult | None = None
        self.last_error: str | None = None


class ReportScheduler:
    """
    Report scheduler.

    Manages scheduled report generation with support for
    cron expressions, intervals, and recurring patterns.
    """

    def __init__(
        self,
        config: SchedulerConfig | None = None,
        report_engine: ReportEngine | None = None,
        report_delivery: ReportDelivery | None = None,
    ):
        """
        Initialize the report scheduler.

        Args:
            config: Scheduler configuration.
            report_engine: Report engine instance.
            report_delivery: Report delivery instance.
        """
        self._config = config or SchedulerConfig()
        self._report_engine = report_engine
        self._report_delivery = report_delivery

        self._schedules: dict[str, ScheduleJob] = {}
        self._scheduler: AsyncIOScheduler | None = None
        self._listeners: dict[str, list[Callable]] = {}

        if self._config.enabled:
            self._initialize()

    def _initialize(self) -> None:
        """Initialize the scheduler."""
        self._scheduler = AsyncIOScheduler(timezone=self._config.default_timezone)
        self._scheduler.start()

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

    async def create_schedule(
        self,
        name: str,
        report_config: ReportConfig,
        pattern: SchedulePattern,
        created_by: str = "system",
    ) -> ReportSchedule:
        """
        Create a new report schedule.

        Args:
            name: Schedule name.
            report_config: Report configuration.
            pattern: Schedule pattern.
            created_by: Creator identifier.

        Returns:
            Created report schedule.
        """
        schedule = ReportSchedule(
            id=str(uuid4()),
            name=name,
            enabled=True,
            report_config=report_config,
            schedule=pattern,
            timezone=self._config.default_timezone,
            created_by=created_by,
        )

        # Calculate next run time
        schedule.next_run_at = self._calculate_next_run(pattern)

        # Create job
        job = ScheduleJob(id=schedule.id, schedule=schedule)

        # Create scheduler job if cron pattern
        if pattern.type == "cron" and pattern.cron and self._scheduler:
            trigger = CronTrigger.from_crontab(
                pattern.cron,
                timezone=schedule.timezone,
            )
            self._scheduler.add_job(
                self._execute_schedule,
                trigger=trigger,
                id=schedule.id,
                args=[job],
            )

        # Store schedule
        self._schedules[schedule.id] = job

        # Emit event
        self.emit(ReportEventType.SCHEDULE_CREATED.value, {"schedule": schedule})

        return schedule

    async def update_schedule(
        self,
        schedule_id: str,
        updates: dict[str, Any],
    ) -> ReportSchedule | None:
        """
        Update an existing schedule.

        Args:
            schedule_id: Schedule ID to update.
            updates: Updates to apply.

        Returns:
            Updated schedule or None if not found.
        """
        job = self._schedules.get(schedule_id)
        if not job:
            return None

        if job.running:
            raise RuntimeError("Cannot update schedule while it is running")

        # Remove existing scheduler job
        if self._scheduler and self._scheduler.get_job(schedule_id):
            self._scheduler.remove_job(schedule_id)

        # Apply updates
        schedule_dict = job.schedule.model_dump()
        schedule_dict.update(updates)
        schedule_dict["updated_at"] = datetime.utcnow()

        # Recreate schedule
        updated_schedule = ReportSchedule(**schedule_dict)

        # Recalculate next run if pattern changed
        if "schedule" in updates:
            updated_schedule.next_run_at = self._calculate_next_run(updated_schedule.schedule)

        # Recreate scheduler job if enabled and cron
        if (
            updated_schedule.enabled
            and updated_schedule.schedule.type == "cron"
            and updated_schedule.schedule.cron
            and self._scheduler
        ):
            trigger = CronTrigger.from_crontab(
                updated_schedule.schedule.cron,
                timezone=updated_schedule.timezone,
            )
            self._scheduler.add_job(
                self._execute_schedule,
                trigger=trigger,
                id=schedule_id,
                args=[job],
            )

        # Update job
        job.schedule = updated_schedule

        # Emit event
        self.emit(ReportEventType.SCHEDULE_UPDATED.value, {"schedule": updated_schedule})

        return updated_schedule

    async def delete_schedule(self, schedule_id: str) -> bool:
        """
        Delete a schedule.

        Args:
            schedule_id: Schedule ID to delete.

        Returns:
            True if deleted, False if not found.
        """
        job = self._schedules.get(schedule_id)
        if not job:
            return False

        if job.running:
            raise RuntimeError("Cannot delete schedule while it is running")

        # Remove scheduler job
        if self._scheduler and self._scheduler.get_job(schedule_id):
            self._scheduler.remove_job(schedule_id)

        # Remove from schedules
        del self._schedules[schedule_id]

        # Emit event
        self.emit(ReportEventType.SCHEDULE_DELETED.value, {"schedule_id": schedule_id})

        return True

    def get_schedule(self, schedule_id: str) -> ReportSchedule | None:
        """
        Get a schedule by ID.

        Args:
            schedule_id: Schedule ID.

        Returns:
            Schedule or None if not found.
        """
        job = self._schedules.get(schedule_id)
        return job.schedule if job else None

    def get_all_schedules(self) -> list[ReportSchedule]:
        """
        Get all schedules.

        Returns:
            List of all schedules.
        """
        return [job.schedule for job in self._schedules.values()]

    async def run_schedule_now(self, schedule_id: str) -> ReportResult:
        """
        Execute a schedule immediately.

        Args:
            schedule_id: Schedule ID to run.

        Returns:
            Report generation result.

        Raises:
            ValueError: If schedule not found.
            RuntimeError: If schedule is already running.
        """
        job = self._schedules.get(schedule_id)
        if not job:
            raise ValueError("Schedule not found")

        if job.running:
            raise RuntimeError("Schedule is already running")

        return await self._execute_schedule(job)

    async def _execute_schedule(self, job: ScheduleJob) -> ReportResult:
        """Execute a scheduled report generation."""
        # Check concurrent job limit
        running_count = sum(1 for j in self._schedules.values() if j.running)
        if running_count >= self._config.max_concurrent_jobs:
            raise RuntimeError("Maximum concurrent jobs reached")

        job.running = True
        start_time = datetime.utcnow()

        try:
            # Calculate report period
            period_start, period_end = self._calculate_report_period(job.schedule)

            # Generate report
            if not self._report_engine:
                raise RuntimeError("Report engine not configured")

            result = await self._report_engine.generate_report(
                config=job.schedule.report_config,
                project_ids=[],
                period_start=period_start,
                period_end=period_end,
            )

            # Deliver report if channels configured
            if job.schedule.report_config.delivery_channels and self._report_delivery:
                delivery_results = await self._report_delivery.deliver(
                    result,
                    job.schedule.report_config.delivery_channels,
                )
                result.delivery_results = delivery_results

            # Update job state
            job.last_result = result
            job.last_error = None
            job.schedule.last_run_at = start_time
            job.schedule.next_run_at = self._calculate_next_run(job.schedule.schedule)

            # Emit event
            self.emit(
                ReportEventType.SCHEDULE_EXECUTED.value,
                {"schedule": job.schedule, "result": result},
            )

            return result

        except Exception as e:
            job.last_error = str(e)

            # Schedule retry
            if self._config.retry_attempts > 0:
                asyncio.create_task(self._schedule_retry(job, 1))

            raise

        finally:
            job.running = False

    async def _schedule_retry(self, job: ScheduleJob, attempt: int) -> None:
        """Schedule a retry attempt."""
        if attempt > self._config.retry_attempts:
            return

        # Wait before retry
        await asyncio.sleep(self._config.retry_delay * attempt / 1000)

        try:
            await self._execute_schedule(job)
        except Exception:
            await self._schedule_retry(job, attempt + 1)

    def _calculate_next_run(self, pattern: SchedulePattern) -> datetime:
        """Calculate the next run time based on pattern."""
        now = datetime.utcnow()

        if pattern.type == "cron" and pattern.cron:
            try:
                from croniter import croniter
                cron = croniter(pattern.cron, now)
                return cron.get_next(datetime)
            except ImportError:
                # Fallback: return next day
                return now + timedelta(days=1)

        elif pattern.type == "interval" and pattern.interval:
            return now + timedelta(milliseconds=pattern.interval)

        elif pattern.type == "daily" and pattern.time:
            time_parts = pattern.time.split(":")
            hours = int(time_parts[0]) if time_parts else 0
            minutes = int(time_parts[1]) if len(time_parts) > 1 else 0

            next_run = now.replace(hour=hours, minute=minutes, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)
            return next_run

        elif pattern.type == "weekly" and pattern.time and pattern.day_of_week is not None:
            time_parts = pattern.time.split(":")
            hours = int(time_parts[0]) if time_parts else 0
            minutes = int(time_parts[1]) if len(time_parts) > 1 else 0

            next_run = now.replace(hour=hours, minute=minutes, second=0, microsecond=0)
            days_until_next = (pattern.day_of_week - now.weekday() + 7) % 7 or 7
            next_run += timedelta(days=days_until_next)
            return next_run

        elif pattern.type == "monthly" and pattern.time and pattern.day_of_month is not None:
            time_parts = pattern.time.split(":")
            hours = int(time_parts[0]) if time_parts else 0
            minutes = int(time_parts[1]) if len(time_parts) > 1 else 0

            next_run = now.replace(
                day=pattern.day_of_month,
                hour=hours,
                minute=minutes,
                second=0,
                microsecond=0,
            )
            if next_run <= now:
                # Move to next month
                if now.month == 12:
                    next_run = next_run.replace(year=now.year + 1, month=1)
                else:
                    next_run = next_run.replace(month=now.month + 1)
            return next_run

        # Default: 1 day from now
        return now + timedelta(days=1)

    def _calculate_report_period(
        self,
        schedule: ReportSchedule,
    ) -> tuple[datetime, datetime]:
        """Calculate the report period based on schedule type."""
        now = datetime.utcnow()
        period_end = now

        report_type = schedule.report_config.type.value

        if report_type == "daily":
            period_start = now - timedelta(days=1)
        elif report_type == "weekly":
            period_start = now - timedelta(weeks=1)
        elif report_type == "monthly":
            period_start = now - timedelta(days=30)
        elif report_type == "quarterly":
            period_start = now - timedelta(days=90)
        else:
            period_start = now - timedelta(days=1)

        return period_start, period_end

    async def shutdown(self) -> None:
        """Shutdown the scheduler."""
        if self._scheduler:
            self._scheduler.shutdown(wait=True)

    def get_stats(self) -> dict[str, Any]:
        """
        Get scheduler statistics.

        Returns:
            Dictionary of scheduler statistics.
        """
        return {
            "enabled": self._config.enabled,
            "total_schedules": len(self._schedules),
            "running_jobs": sum(1 for j in self._schedules.values() if j.running),
            "failed_jobs": sum(1 for j in self._schedules.values() if j.last_error),
        }


# Singleton instance
_report_scheduler: ReportScheduler | None = None


def get_report_scheduler() -> ReportScheduler:
    """Get the singleton report scheduler instance."""
    global _report_scheduler
    if _report_scheduler is None:
        _report_scheduler = ReportScheduler()
    return _report_scheduler
