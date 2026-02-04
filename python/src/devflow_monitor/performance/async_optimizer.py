"""
Async Optimizer
비동기 작업 최적화 및 병렬 처리 관리

This module provides async task optimization with priority queues,
batch processing, resource pooling, and concurrency control.
"""

import asyncio
import time
import uuid
from dataclasses import field
from enum import Enum
from typing import Any, Callable, Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class TaskPriority(str, Enum):
    """Task priority levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TaskStatus(str, Enum):
    """Task status values."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


class TaskConfig(BaseModel):
    """Task configuration."""

    max_concurrency: int = 1
    timeout: int = 30000  # 30 seconds (ms)
    retry_attempts: int = 3
    retry_delay: int = 1000  # ms
    priority: TaskPriority = TaskPriority.MEDIUM


class Task(BaseModel):
    """Task representation."""

    id: str
    name: str
    config: TaskConfig
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[Any] = None
    error: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    duration: Optional[float] = None
    retry_count: int = 0
    created_at: int

    class Config:
        arbitrary_types_allowed = True


class BatchConfig(BaseModel):
    """Batch processing configuration."""

    batch_size: int = 100
    max_wait_time: int = 1000  # ms


class AsyncStats(BaseModel):
    """Async optimizer statistics."""

    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    running_tasks: int = 0
    average_execution_time: float = 0.0
    success_rate: float = 100.0
    concurrency_utilization: float = 0.0
    queue_length: int = 0


class AsyncOptimizer:
    """
    Async Optimizer for concurrent task management.

    Provides functionality for:
    - Priority-based task queuing
    - Batch processing with configurable batch size and wait time
    - Resource pooling with acquire/release
    - Concurrency control and dynamic adjustment
    - Retry logic with exponential backoff

    Args:
        max_concurrency: Maximum concurrent tasks

    Example:
        >>> optimizer = AsyncOptimizer(max_concurrency=10)
        >>> result = await optimizer.add_task("my_task", my_async_fn)
        >>> stats = optimizer.get_stats()
    """

    def __init__(self, max_concurrency: int = 10) -> None:
        """Initialize the async optimizer."""
        self._max_concurrency = max_concurrency
        self._task_queue: list[tuple[Task, Callable[[], Any], asyncio.Future[Any]]] = []
        self._running_tasks: dict[str, Task] = {}
        self._completed_tasks: list[Task] = []
        self._failed_tasks: list[Task] = []
        self._task_counter = 0
        self._is_processing = False
        self._processing_task: Optional[asyncio.Task[None]] = None
        self._lock = asyncio.Lock()
        self._event_handlers: list[tuple[str, Any]] = []

        # Batch processing
        self._batch_queues: dict[
            str, dict[str, Any]
        ] = {}  # {name: {items: [], config: BatchConfig, timer: Task}}

        # Resource pools
        self._resource_pools: dict[str, list[Any]] = {}
        self._resource_events: dict[str, asyncio.Event] = {}

    def on_event(self, event_name: str, handler: Any) -> None:
        """Register an event handler."""
        self._event_handlers.append((event_name, handler))

    def _emit_event(self, event_name: str, data: Any) -> None:
        """Emit an event to registered handlers."""
        for name, handler in self._event_handlers:
            if name == event_name:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        asyncio.create_task(handler(data))
                    else:
                        handler(data)
                except Exception:
                    pass

    async def add_task(
        self,
        name: str,
        fn: Callable[[], Any],
        config: Optional[TaskConfig] = None,
    ) -> Any:
        """
        Add a task to the queue.

        Args:
            name: Task name
            fn: Async function to execute
            config: Optional task configuration

        Returns:
            Task result when completed
        """
        self._task_counter += 1
        task_id = f"task_{self._task_counter}_{int(time.time() * 1000)}"

        task_config = config or TaskConfig()

        task = Task(
            id=task_id,
            name=name,
            config=task_config,
            status=TaskStatus.PENDING,
            retry_count=0,
            created_at=int(time.time() * 1000),
        )

        # Create future for result
        future: asyncio.Future[Any] = asyncio.Future()

        async with self._lock:
            # Insert task by priority
            self._insert_task_by_priority(task, fn, future)

        self._emit_event(
            "task_queued",
            {"task_id": task_id, "name": name, "queue_length": len(self._task_queue)},
        )

        # Start processing if not already running
        if not self._is_processing:
            self._start_processing()

        # Wait for result
        return await future

    def _insert_task_by_priority(
        self,
        task: Task,
        fn: Callable[[], Any],
        future: asyncio.Future[Any],
    ) -> None:
        """Insert task into queue by priority."""
        priority_order = {
            TaskPriority.CRITICAL: 0,
            TaskPriority.HIGH: 1,
            TaskPriority.MEDIUM: 2,
            TaskPriority.LOW: 3,
        }
        task_priority = priority_order.get(task.config.priority, 2)

        insert_index = len(self._task_queue)

        for i, (queued_task, _, _) in enumerate(self._task_queue):
            queued_priority = priority_order.get(queued_task.config.priority, 2)
            if task_priority < queued_priority:
                insert_index = i
                break

        self._task_queue.insert(insert_index, (task, fn, future))

    def _start_processing(self) -> None:
        """Start task processing."""
        if self._is_processing:
            return

        self._is_processing = True
        self._processing_task = asyncio.create_task(self._process_queue())

    async def _process_queue(self) -> None:
        """Process tasks from the queue."""
        while self._is_processing:
            async with self._lock:
                available_slots = self._max_concurrency - len(self._running_tasks)

                if available_slots <= 0 or not self._task_queue:
                    pass
                else:
                    # Get tasks to run
                    tasks_to_run = self._task_queue[:available_slots]
                    self._task_queue = self._task_queue[available_slots:]

                    # Execute tasks
                    for task, fn, future in tasks_to_run:
                        asyncio.create_task(self._execute_task(task, fn, future))

            await asyncio.sleep(0.01)  # 10ms delay

    async def _execute_task(
        self,
        task: Task,
        fn: Callable[[], Any],
        future: asyncio.Future[Any],
    ) -> None:
        """Execute a single task."""
        try:
            task.status = TaskStatus.RUNNING
            task.start_time = time.time() * 1000
            self._running_tasks[task.id] = task

            self._emit_event(
                "task_started",
                {
                    "task_id": task.id,
                    "name": task.name,
                    "running_count": len(self._running_tasks),
                },
            )

            # Execute with timeout
            try:
                if asyncio.iscoroutinefunction(fn):
                    result = await asyncio.wait_for(
                        fn(), timeout=task.config.timeout / 1000
                    )
                else:
                    result = fn()

                task.result = result
                task.status = TaskStatus.COMPLETED
                task.end_time = time.time() * 1000
                task.duration = task.end_time - task.start_time

                del self._running_tasks[task.id]
                self._completed_tasks.append(task)

                self._emit_event("task_completed", task.model_dump())

                if not future.done():
                    future.set_result(result)

            except asyncio.TimeoutError:
                task.status = TaskStatus.TIMEOUT
                task.error = f"Task {task.name} timed out after {task.config.timeout}ms"
                await self._handle_task_error(task, fn, future, task.error)

            except Exception as e:
                await self._handle_task_error(task, fn, future, str(e))

        except Exception as e:
            if not future.done():
                future.set_exception(e)

    async def _handle_task_error(
        self,
        task: Task,
        fn: Callable[[], Any],
        future: asyncio.Future[Any],
        error: str,
    ) -> None:
        """Handle task error with retry logic."""
        task.error = error
        task.retry_count += 1

        # Check if can retry
        if task.retry_count <= task.config.retry_attempts:
            self._emit_event(
                "task_retry",
                {
                    "task_id": task.id,
                    "name": task.name,
                    "retry_count": task.retry_count,
                    "error": error,
                },
            )

            # Retry delay with exponential backoff
            delay = task.config.retry_delay * task.retry_count / 1000
            await asyncio.sleep(delay)

            # Re-queue with higher priority
            task.status = TaskStatus.PENDING
            task.config.priority = self._increase_priority(task.config.priority)

            if task.id in self._running_tasks:
                del self._running_tasks[task.id]

            async with self._lock:
                self._insert_task_by_priority(task, fn, future)
        else:
            # Max retries exceeded
            task.status = TaskStatus.FAILED
            task.end_time = time.time() * 1000
            if task.start_time:
                task.duration = task.end_time - task.start_time

            if task.id in self._running_tasks:
                del self._running_tasks[task.id]
            self._failed_tasks.append(task)

            self._emit_event("task_failed", task.model_dump())

            if not future.done():
                future.set_exception(Exception(error))

    def _increase_priority(self, current: TaskPriority) -> TaskPriority:
        """Increase task priority."""
        priorities = [
            TaskPriority.LOW,
            TaskPriority.MEDIUM,
            TaskPriority.HIGH,
            TaskPriority.CRITICAL,
        ]
        try:
            current_index = priorities.index(current)
            new_index = min(current_index + 1, len(priorities) - 1)
            return priorities[new_index]
        except ValueError:
            return TaskPriority.MEDIUM

    async def add_to_batch(
        self,
        batch_name: str,
        item: T,
        config: BatchConfig,
        processor: Callable[[list[Any]], Any],
    ) -> T:
        """
        Add item to a batch for processing.

        Args:
            batch_name: Name of the batch
            item: Item to add
            config: Batch configuration
            processor: Function to process the batch

        Returns:
            Processed result for this item
        """
        future: asyncio.Future[Any] = asyncio.Future()

        async with self._lock:
            if batch_name not in self._batch_queues:
                self._batch_queues[batch_name] = {
                    "items": [],
                    "config": config,
                    "processor": processor,
                    "timer": None,
                }

            batch = self._batch_queues[batch_name]
            batch["items"].append({"item": item, "future": future})

            # Process immediately if batch is full
            if len(batch["items"]) >= config.batch_size:
                asyncio.create_task(self._process_batch(batch_name))
            elif batch["timer"] is None:
                # Set timer for max wait time
                batch["timer"] = asyncio.create_task(
                    self._batch_timer(batch_name, config.max_wait_time)
                )

        return await future

    async def _batch_timer(self, batch_name: str, wait_time: int) -> None:
        """Timer for batch processing."""
        await asyncio.sleep(wait_time / 1000)
        await self._process_batch(batch_name)

    async def _process_batch(self, batch_name: str) -> None:
        """Process a batch of items."""
        async with self._lock:
            batch = self._batch_queues.get(batch_name)
            if not batch or not batch["items"]:
                return

            # Cancel timer if exists
            if batch["timer"] and not batch["timer"].done():
                batch["timer"].cancel()
                batch["timer"] = None

            items = batch["items"]
            batch["items"] = []
            processor = batch["processor"]

        try:
            # Extract items for processing
            raw_items = [entry["item"] for entry in items]

            # Process batch
            if asyncio.iscoroutinefunction(processor):
                results = await processor(raw_items)
            else:
                results = processor(raw_items)

            # Map results to futures
            for i, entry in enumerate(items):
                if not entry["future"].done():
                    entry["future"].set_result(results[i] if i < len(results) else None)

            self._emit_event(
                "batch_processed",
                {
                    "batch_name": batch_name,
                    "item_count": len(items),
                    "processing_time": int(time.time() * 1000),
                },
            )

        except Exception as e:
            # Propagate error to all futures
            for entry in items:
                if not entry["future"].done():
                    entry["future"].set_exception(e)

            self._emit_event(
                "batch_failed",
                {
                    "batch_name": batch_name,
                    "item_count": len(items),
                    "error": str(e),
                },
            )

    async def parallel(
        self,
        tasks: list[Callable[[], Any]],
        concurrency: Optional[int] = None,
    ) -> list[Any]:
        """
        Execute tasks in parallel with limited concurrency.

        Args:
            tasks: List of async functions to execute
            concurrency: Maximum concurrent tasks (default: max_concurrency)

        Returns:
            List of results in order

        Raises:
            AggregateError: If any tasks failed
        """
        max_concurrent = concurrency or self._max_concurrency
        results: list[Any] = [None] * len(tasks)
        semaphore = asyncio.Semaphore(max_concurrent)
        errors: list[Exception] = []

        async def execute_with_semaphore(index: int, task: Callable[[], Any]) -> None:
            async with semaphore:
                try:
                    if asyncio.iscoroutinefunction(task):
                        results[index] = await task()
                    else:
                        results[index] = task()
                except Exception as e:
                    errors.append(e)
                    results[index] = e

        await asyncio.gather(
            *[execute_with_semaphore(i, task) for i, task in enumerate(tasks)]
        )

        if errors:
            raise Exception(f"{len(errors)} tasks failed: {errors}")

        return results

    def create_resource_pool(self, name: str, resources: list[Any]) -> None:
        """
        Create a resource pool.

        Args:
            name: Pool name
            resources: Initial resources
        """
        self._resource_pools[name] = list(resources)
        self._resource_events[name] = asyncio.Event()
        self._resource_events[name].set()

        self._emit_event(
            "resource_pool_created",
            {"name": name, "size": len(resources)},
        )

    async def acquire_resource(
        self, pool_name: str, timeout: int = 30000
    ) -> Any:
        """
        Acquire a resource from a pool.

        Args:
            pool_name: Pool name
            timeout: Timeout in milliseconds

        Returns:
            Acquired resource

        Raises:
            Exception: If pool not found or timeout
        """
        if pool_name not in self._resource_pools:
            raise Exception(f"Resource pool {pool_name} not found")

        pool = self._resource_pools[pool_name]
        start_time = time.time()

        while True:
            if pool:
                resource = pool.pop()
                return resource

            # Check timeout
            elapsed = (time.time() - start_time) * 1000
            if elapsed > timeout:
                raise Exception(f"Resource acquisition timeout for pool {pool_name}")

            # Wait for resource release
            event = self._resource_events.get(pool_name)
            if event:
                event.clear()
                try:
                    await asyncio.wait_for(
                        event.wait(),
                        timeout=(timeout - elapsed) / 1000,
                    )
                except asyncio.TimeoutError:
                    raise Exception(
                        f"Resource acquisition timeout for pool {pool_name}"
                    )

    def release_resource(self, pool_name: str, resource: Any) -> None:
        """
        Release a resource back to the pool.

        Args:
            pool_name: Pool name
            resource: Resource to release
        """
        if pool_name in self._resource_pools:
            self._resource_pools[pool_name].append(resource)

            # Signal waiting tasks
            event = self._resource_events.get(pool_name)
            if event:
                event.set()

            self._emit_event(
                "resource_released",
                {
                    "pool_name": pool_name,
                    "resource_count": len(self._resource_pools[pool_name]),
                },
            )

    def get_stats(self) -> AsyncStats:
        """
        Get optimizer statistics.

        Returns:
            Current statistics
        """
        total_tasks = (
            len(self._completed_tasks)
            + len(self._failed_tasks)
            + len(self._running_tasks)
            + len(self._task_queue)
        )

        completed_count = len(self._completed_tasks)
        failed_count = len(self._failed_tasks)

        durations = [
            task.duration
            for task in self._completed_tasks
            if task.duration is not None
        ]

        avg_time = sum(durations) / len(durations) if durations else 0

        success_rate = (
            (completed_count / (completed_count + failed_count)) * 100
            if (completed_count + failed_count) > 0
            else 100
        )

        concurrency_util = (
            (len(self._running_tasks) / self._max_concurrency) * 100
            if self._max_concurrency > 0
            else 0
        )

        return AsyncStats(
            total_tasks=total_tasks,
            completed_tasks=completed_count,
            failed_tasks=failed_count,
            running_tasks=len(self._running_tasks),
            average_execution_time=avg_time,
            success_rate=success_rate,
            concurrency_utilization=concurrency_util,
            queue_length=len(self._task_queue),
        )

    def cancel_pending_tasks(
        self, predicate: Optional[Callable[[Task], bool]] = None
    ) -> int:
        """
        Cancel pending tasks.

        Args:
            predicate: Optional filter function

        Returns:
            Number of tasks cancelled
        """
        if predicate:
            to_cancel = [
                (task, fn, future)
                for task, fn, future in self._task_queue
                if predicate(task)
            ]
        else:
            to_cancel = self._task_queue.copy()

        for task, fn, future in to_cancel:
            if (task, fn, future) in self._task_queue:
                self._task_queue.remove((task, fn, future))
                task.status = TaskStatus.CANCELLED
                if not future.done():
                    future.cancel()
                self._emit_event(
                    "task_cancelled", {"task_id": task.id, "name": task.name}
                )

        return len(to_cancel)

    def update_concurrency(self, new_limit: int) -> None:
        """
        Update concurrency limit.

        Args:
            new_limit: New maximum concurrency
        """
        old_limit = self._max_concurrency
        self._max_concurrency = max(1, new_limit)

        self._emit_event(
            "concurrency_updated",
            {"old_limit": old_limit, "new_limit": self._max_concurrency},
        )

    def cleanup(self) -> None:
        """Clean up resources."""
        self._is_processing = False

        if self._processing_task:
            self._processing_task.cancel()

        # Cancel batch timers
        for batch in self._batch_queues.values():
            if batch.get("timer") and not batch["timer"].done():
                batch["timer"].cancel()

        self._task_queue.clear()
        self._running_tasks.clear()
        self._completed_tasks.clear()
        self._failed_tasks.clear()
        self._batch_queues.clear()
        self._resource_pools.clear()
        self._resource_events.clear()
        self._event_handlers.clear()


# Singleton instance
_async_optimizer: Optional[AsyncOptimizer] = None


def get_async_optimizer(max_concurrency: int = 10) -> AsyncOptimizer:
    """Get or create the async optimizer singleton."""
    global _async_optimizer
    if _async_optimizer is None:
        _async_optimizer = AsyncOptimizer(max_concurrency)
    return _async_optimizer


# Default singleton for convenience
async_optimizer = AsyncOptimizer()
