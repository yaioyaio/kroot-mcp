"""
Plugin Sandbox.

This module provides isolated execution environments for plugins using
multiprocessing. Implements resource limits, security restrictions,
and monitored execution.
"""

import asyncio
import hashlib
import multiprocessing
import os
import time
from datetime import datetime
from multiprocessing import Process, Queue
from queue import Empty
from typing import Any, Callable, Optional

from .types import (
    IsolationLevel,
    PluginDescriptor,
    PluginPermission,
    PluginResourceLimits,
    PluginSandboxInfo,
)


class SandboxConfig:
    """Sandbox configuration."""

    def __init__(
        self,
        enabled: bool = True,
        memory_limit: int = 536870912,  # 512MB
        cpu_limit: int = 80,  # percentage
        network_allowed: bool = True,
        filesystem_access: str = "readonly",
    ):
        """
        Initialize sandbox configuration.

        Args:
            enabled: Whether sandboxing is enabled.
            memory_limit: Memory limit in bytes.
            cpu_limit: CPU limit percentage.
            network_allowed: Whether network access is allowed.
            filesystem_access: Filesystem access level (none/readonly/readwrite).
        """
        self.enabled = enabled
        self.memory_limit = memory_limit
        self.cpu_limit = cpu_limit
        self.network_allowed = network_allowed
        self.filesystem_access = filesystem_access


class SandboxEnvironment:
    """Sandbox environment for a plugin."""

    def __init__(
        self,
        env_id: str,
        plugin_id: str,
        isolation_level: IsolationLevel,
        resource_limits: PluginResourceLimits,
        allowed_apis: list[str],
    ):
        """
        Initialize sandbox environment.

        Args:
            env_id: Environment unique ID.
            plugin_id: Plugin ID.
            isolation_level: Isolation level.
            resource_limits: Resource limits.
            allowed_apis: List of allowed APIs.
        """
        self.id = env_id
        self.plugin_id = plugin_id
        self.isolation_level = isolation_level
        self.resource_limits = resource_limits
        self.allowed_apis = allowed_apis
        self.start_time = datetime.utcnow()
        self.last_activity = datetime.utcnow()
        self.process: Optional[Process] = None
        self.input_queue: Optional[Queue] = None
        self.output_queue: Optional[Queue] = None


def _sandbox_worker(
    plugin_path: str,
    plugin_manifest: dict[str, Any],
    environment: dict[str, Any],
    input_queue: Queue,
    output_queue: Queue,
) -> None:
    """
    Sandbox worker process function.

    Runs in a separate process with restricted capabilities.

    Args:
        plugin_path: Path to the plugin.
        plugin_manifest: Plugin manifest data.
        environment: Environment configuration.
        input_queue: Queue for receiving commands.
        output_queue: Queue for sending responses.
    """
    try:
        # Apply resource limits (platform specific)
        try:
            import resource

            # Set memory limit
            memory_limit = environment.get("resource_limits", {}).get(
                "memory", 536870912
            )
            resource.setrlimit(
                resource.RLIMIT_AS, (memory_limit, memory_limit)
            )

            # Set CPU time limit
            cpu_limit = environment.get("resource_limits", {}).get("timeout", 30)
            resource.setrlimit(resource.RLIMIT_CPU, (cpu_limit, cpu_limit))

        except (ImportError, OSError):
            # Resource module not available on all platforms
            pass

        # Restricted globals for exec
        restricted_globals = {
            "__builtins__": {
                "print": print,
                "len": len,
                "range": range,
                "str": str,
                "int": int,
                "float": float,
                "bool": bool,
                "list": list,
                "dict": dict,
                "tuple": tuple,
                "set": set,
                "True": True,
                "False": False,
                "None": None,
                "Exception": Exception,
                "ValueError": ValueError,
                "TypeError": TypeError,
                "RuntimeError": RuntimeError,
            }
        }

        # Add allowed APIs based on permissions
        allowed_apis = environment.get("allowed_apis", [])

        if "http" in allowed_apis:
            import urllib.request

            restricted_globals["__builtins__"]["urllib"] = urllib

        if "json" in allowed_apis:
            import json

            restricted_globals["json"] = json

        while True:
            try:
                # Wait for command from main process
                command = input_queue.get(timeout=1)

                if command is None or command.get("type") == "shutdown":
                    break

                command_type = command.get("type")
                call_id = command.get("call_id")

                if command_type == "execute":
                    code = command.get("code", "")
                    local_vars: dict[str, Any] = {}

                    try:
                        exec(code, restricted_globals, local_vars)
                        output_queue.put({
                            "type": "result",
                            "call_id": call_id,
                            "result": local_vars.get("result"),
                        })
                    except Exception as e:
                        output_queue.put({
                            "type": "error",
                            "call_id": call_id,
                            "error": str(e),
                        })

                elif command_type == "api_call":
                    api = command.get("api")
                    method = command.get("method")
                    args = command.get("args", [])

                    # Check if API is allowed
                    if api not in allowed_apis:
                        output_queue.put({
                            "type": "error",
                            "call_id": call_id,
                            "error": f"API '{api}' not allowed for this plugin",
                        })
                        continue

                    # Handle API calls (simplified)
                    output_queue.put({
                        "type": "api_response",
                        "call_id": call_id,
                        "result": None,
                        "message": f"API {api}.{method} called with {args}",
                    })

                elif command_type == "health_check":
                    output_queue.put({
                        "type": "health",
                        "call_id": call_id,
                        "status": "healthy",
                    })

            except Empty:
                continue
            except Exception as e:
                output_queue.put({
                    "type": "error",
                    "error": str(e),
                })

    except Exception as e:
        output_queue.put({
            "type": "fatal_error",
            "error": str(e),
        })


class PluginSandbox:
    """
    Plugin Sandbox Manager.

    Provides isolated execution environments for plugins using multiprocessing.
    Implements resource limits, security restrictions, and API access control.

    Args:
        config: Sandbox configuration.

    Example:
        >>> config = SandboxConfig(enabled=True, memory_limit=512*1024*1024)
        >>> sandbox = PluginSandbox(config)
        >>> info = await sandbox.create_environment(descriptor)
        >>> result = await sandbox.execute(plugin_id, "result = 1 + 1")
    """

    def __init__(self, config: SandboxConfig):
        """Initialize the plugin sandbox."""
        self.config = config
        self._environments: dict[str, SandboxEnvironment] = {}
        self._monitor_task: Optional[asyncio.Task] = None
        self._event_handlers: dict[str, list[Callable[..., Any]]] = {}

        if self.config.enabled:
            self._start_resource_monitoring()

    def on(self, event: str, handler: Callable[..., Any]) -> None:
        """
        Register an event handler.

        Args:
            event: Event name.
            handler: Event handler function.
        """
        if event not in self._event_handlers:
            self._event_handlers[event] = []
        self._event_handlers[event].append(handler)

    def emit(self, event: str, data: Any) -> None:
        """
        Emit an event to all registered handlers.

        Args:
            event: Event name.
            data: Event data.
        """
        handlers = self._event_handlers.get(event, [])
        for handler in handlers:
            try:
                handler(data)
            except Exception:
                pass

    async def create_environment(
        self, descriptor: PluginDescriptor
    ) -> PluginSandboxInfo:
        """
        Create a sandbox environment for a plugin.

        Args:
            descriptor: Plugin descriptor.

        Returns:
            PluginSandboxInfo with environment details.
        """
        plugin_id = descriptor.id
        permissions = descriptor.manifest.permissions or []

        # Determine isolation level based on permissions
        isolation_level = self._determine_isolation_level(permissions)

        # Set resource limits
        resource_limits = PluginResourceLimits(
            memory=self.config.memory_limit,
            cpu=self.config.cpu_limit,
            files=self._get_file_limit(permissions),
        )

        # Generate allowed APIs based on permissions
        allowed_apis = self._generate_allowed_apis(permissions)

        environment = SandboxEnvironment(
            env_id=self._generate_environment_id(plugin_id),
            plugin_id=plugin_id,
            isolation_level=isolation_level,
            resource_limits=resource_limits,
            allowed_apis=allowed_apis,
        )

        # Create worker process for strict isolation
        if isolation_level == IsolationLevel.STRICT:
            await self._create_worker_process(descriptor, environment)

        self._environments[plugin_id] = environment

        sandbox_info = PluginSandboxInfo(
            pid=environment.process.pid if environment.process else None,
            isolation_level=isolation_level,
            resource_limits=resource_limits,
            allowed_apis=allowed_apis,
        )

        self.emit("environment.created", {"plugin_id": plugin_id, "environment": sandbox_info})
        return sandbox_info

    async def destroy_environment(self, plugin_id: str) -> None:
        """
        Destroy a sandbox environment.

        Args:
            plugin_id: Plugin identifier.
        """
        environment = self._environments.get(plugin_id)
        if not environment:
            return

        # Terminate worker process
        if environment.process and environment.process.is_alive():
            # Send shutdown command
            if environment.input_queue:
                environment.input_queue.put({"type": "shutdown"})

            # Wait for graceful shutdown
            environment.process.join(timeout=5)

            # Force terminate if still running
            if environment.process.is_alive():
                environment.process.terminate()
                environment.process.join(timeout=2)

        del self._environments[plugin_id]
        self.emit("environment.destroyed", {"plugin_id": plugin_id})

    async def execute(
        self,
        plugin_id: str,
        code: str,
        context: Optional[dict[str, Any]] = None,
        timeout: float = 30.0,
    ) -> Any:
        """
        Execute code in a sandbox environment.

        Args:
            plugin_id: Plugin identifier.
            code: Code to execute.
            context: Optional execution context.
            timeout: Execution timeout in seconds.

        Returns:
            Execution result.

        Raises:
            ValueError: If environment not found.
            TimeoutError: If execution times out.
            RuntimeError: If execution fails.
        """
        environment = self._environments.get(plugin_id)
        if not environment:
            raise ValueError(f"Sandbox environment not found for plugin: {plugin_id}")

        environment.last_activity = datetime.utcnow()

        if environment.isolation_level == IsolationLevel.STRICT:
            return await self._execute_in_process(environment, code, context, timeout)
        else:
            return await self._execute_inline(environment, code, context, timeout)

    async def _execute_in_process(
        self,
        environment: SandboxEnvironment,
        code: str,
        context: Optional[dict[str, Any]],
        timeout: float,
    ) -> Any:
        """
        Execute code in a separate process.

        Args:
            environment: Sandbox environment.
            code: Code to execute.
            context: Execution context.
            timeout: Timeout in seconds.

        Returns:
            Execution result.
        """
        if not environment.input_queue or not environment.output_queue:
            raise RuntimeError("Process communication not initialized")

        call_id = hashlib.md5(f"{time.time()}{code}".encode()).hexdigest()[:8]

        # Send execute command
        environment.input_queue.put({
            "type": "execute",
            "call_id": call_id,
            "code": code,
            "context": context,
        })

        # Wait for response
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                response = environment.output_queue.get(timeout=0.1)
                if response.get("call_id") == call_id:
                    if response.get("type") == "error":
                        raise RuntimeError(response.get("error"))
                    return response.get("result")
            except Empty:
                continue

        raise TimeoutError(f"Execution timeout ({timeout}s)")

    async def _execute_inline(
        self,
        environment: SandboxEnvironment,
        code: str,
        context: Optional[dict[str, Any]],
        timeout: float,
    ) -> Any:
        """
        Execute code inline with basic restrictions.

        Args:
            environment: Sandbox environment.
            code: Code to execute.
            context: Execution context.
            timeout: Timeout in seconds.

        Returns:
            Execution result.
        """
        # Create restricted execution environment
        restricted_globals = {
            "__builtins__": {
                "print": print,
                "len": len,
                "range": range,
                "str": str,
                "int": int,
                "float": float,
                "bool": bool,
                "list": list,
                "dict": dict,
                "tuple": tuple,
                "set": set,
                "True": True,
                "False": False,
                "None": None,
                "Exception": Exception,
            }
        }

        if context:
            restricted_globals.update(context)

        local_vars: dict[str, Any] = {}

        try:
            exec(code, restricted_globals, local_vars)
            return local_vars.get("result")
        except Exception as e:
            raise RuntimeError(f"Execution failed: {e}")

    async def _create_worker_process(
        self,
        descriptor: PluginDescriptor,
        environment: SandboxEnvironment,
    ) -> None:
        """
        Create a worker process for strict isolation.

        Args:
            descriptor: Plugin descriptor.
            environment: Sandbox environment.
        """
        environment.input_queue = multiprocessing.Queue()
        environment.output_queue = multiprocessing.Queue()

        environment.process = Process(
            target=_sandbox_worker,
            args=(
                descriptor.path,
                descriptor.manifest.model_dump(),
                {
                    "id": environment.id,
                    "resource_limits": environment.resource_limits.model_dump(),
                    "allowed_apis": environment.allowed_apis,
                },
                environment.input_queue,
                environment.output_queue,
            ),
        )

        environment.process.start()

        # Wait for process to be ready
        await asyncio.sleep(0.1)

    def _determine_isolation_level(
        self, permissions: list[PluginPermission]
    ) -> IsolationLevel:
        """
        Determine isolation level based on permissions.

        Args:
            permissions: List of required permissions.

        Returns:
            Appropriate isolation level.
        """
        # Dangerous permissions require strict isolation
        dangerous_permissions = [
            PluginPermission.FILE_WRITE,
            PluginPermission.NETWORK_ACCESS,
            PluginPermission.SYSTEM_INFO,
            PluginPermission.DATABASE_WRITE,
            PluginPermission.SECURITY,
        ]

        # Moderate permissions require basic isolation
        moderate_permissions = [
            PluginPermission.FILE_READ,
            PluginPermission.DATABASE_READ,
            PluginPermission.USER_DATA,
        ]

        if isinstance(permissions, list):
            perm_set = set(permissions)
        else:
            perm_set = set()

        if perm_set & set(dangerous_permissions):
            return IsolationLevel.STRICT
        elif perm_set & set(moderate_permissions):
            return IsolationLevel.BASIC
        else:
            return IsolationLevel.NONE

    def _get_file_limit(self, permissions: list[PluginPermission]) -> int:
        """
        Get file handle limit based on permissions.

        Args:
            permissions: List of permissions.

        Returns:
            Maximum file handles.
        """
        if PluginPermission.FILE_WRITE in permissions:
            return 1000
        elif PluginPermission.FILE_READ in permissions:
            return 500
        else:
            return 0

    def _generate_allowed_apis(
        self, permissions: list[PluginPermission]
    ) -> list[str]:
        """
        Generate list of allowed APIs based on permissions.

        Args:
            permissions: List of permissions.

        Returns:
            List of allowed API names.
        """
        allowed_apis = ["logger", "events", "storage", "communication"]

        perm_set = set(permissions) if isinstance(permissions, list) else set()

        if (
            PluginPermission.FILE_READ in perm_set
            or PluginPermission.FILE_WRITE in perm_set
        ):
            allowed_apis.append("fs")

        if PluginPermission.NETWORK_ACCESS in perm_set:
            allowed_apis.append("http")
            allowed_apis.append("json")

        if (
            PluginPermission.DATABASE_READ in perm_set
            or PluginPermission.DATABASE_WRITE in perm_set
        ):
            allowed_apis.append("database")

        if PluginPermission.MCP_TOOLS in perm_set:
            allowed_apis.append("mcp")

        if PluginPermission.NOTIFICATIONS in perm_set:
            allowed_apis.append("notifications")

        return allowed_apis

    def _generate_environment_id(self, plugin_id: str) -> str:
        """
        Generate unique environment ID.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            Unique environment ID.
        """
        timestamp = str(time.time())
        hash_input = f"{plugin_id}{timestamp}"
        return f"env_{hashlib.sha256(hash_input.encode()).hexdigest()[:8]}"

    def get_environment(self, plugin_id: str) -> Optional[SandboxEnvironment]:
        """
        Get sandbox environment for a plugin.

        Args:
            plugin_id: Plugin identifier.

        Returns:
            SandboxEnvironment if exists, None otherwise.
        """
        return self._environments.get(plugin_id)

    def get_all_environments(self) -> list[SandboxEnvironment]:
        """
        Get all sandbox environments.

        Returns:
            List of all environments.
        """
        return list(self._environments.values())

    def _start_resource_monitoring(self) -> None:
        """Start resource monitoring task."""
        async def monitor_loop():
            while True:
                await asyncio.sleep(5)  # Check every 5 seconds
                self._monitor_resources()

        try:
            loop = asyncio.get_event_loop()
            self._monitor_task = loop.create_task(monitor_loop())
        except RuntimeError:
            # No event loop running yet
            pass

    def _monitor_resources(self) -> None:
        """Monitor resource usage of all environments."""
        for plugin_id, environment in list(self._environments.items()):
            try:
                self._check_resource_usage(plugin_id, environment)
            except Exception as e:
                print(f"[PluginSandbox] Error monitoring {plugin_id}: {e}")

    def _check_resource_usage(
        self, plugin_id: str, environment: SandboxEnvironment
    ) -> None:
        """
        Check resource usage for an environment.

        Args:
            plugin_id: Plugin identifier.
            environment: Sandbox environment.
        """
        if not environment.process:
            return

        # Check if process is still alive
        if not environment.process.is_alive():
            self.emit("environment.exited", {
                "plugin_id": plugin_id,
                "exit_code": environment.process.exitcode,
            })
            return

        # Check for inactive environments (30 minutes)
        inactive_time = (
            datetime.utcnow() - environment.last_activity
        ).total_seconds()
        if inactive_time > 30 * 60:
            self.emit("environment.inactive", {
                "plugin_id": plugin_id,
                "inactive_time": inactive_time,
            })

    async def dispose(self) -> None:
        """Dispose of the sandbox manager and all environments."""
        # Cancel monitor task
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass

        # Destroy all environments
        for plugin_id in list(self._environments.keys()):
            await self.destroy_environment(plugin_id)
