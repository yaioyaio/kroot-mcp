"""
Integration tests for MCP server.

Tests the MCP server startup, tool registration, and tool execution.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from devflow_monitor.server.main import DevFlowMonitorServer


@pytest.mark.integration
class TestServerStart:
    """Tests for MCP server startup."""

    def test_server_initialization(self) -> None:
        """Test that server initializes correctly."""
        server = DevFlowMonitorServer()

        assert server.server is not None
        assert server.config is not None

    def test_server_has_name(self) -> None:
        """Test that server has a configured name."""
        server = DevFlowMonitorServer()

        assert server.config.server.name is not None
        assert len(server.config.server.name) > 0

    def test_server_has_version(self) -> None:
        """Test that server has a configured version."""
        server = DevFlowMonitorServer()

        assert server.config.server.version is not None

    def test_logging_setup(self) -> None:
        """Test that logging is properly configured."""
        with patch("devflow_monitor.server.main.logging") as mock_logging:
            mock_logging.INFO = 20
            mock_logging.DEBUG = 10
            server = DevFlowMonitorServer()

            # basicConfig should have been called
            assert mock_logging.basicConfig.called


@pytest.mark.integration
class TestToolRegistration:
    """Tests for MCP tool registration."""

    def test_tools_are_registered(self) -> None:
        """Test that all expected tools are registered."""
        server = DevFlowMonitorServer()
        tools = server._get_tools()

        assert len(tools) >= 6

        tool_names = {tool.name for tool in tools}

        expected_tools = {
            "getProjectStatus",
            "getMetrics",
            "getActivityLog",
            "analyzeBottlenecks",
            "checkMethodology",
            "generateReport",
        }

        assert expected_tools.issubset(tool_names)

    def test_tool_has_name_and_description(self) -> None:
        """Test that each tool has a name and description."""
        server = DevFlowMonitorServer()
        tools = server._get_tools()

        for tool in tools:
            assert tool.name is not None
            assert len(tool.name) > 0
            assert tool.description is not None
            assert len(tool.description) > 0

    def test_tool_has_input_schema(self) -> None:
        """Test that each tool has an input schema."""
        server = DevFlowMonitorServer()
        tools = server._get_tools()

        for tool in tools:
            assert tool.inputSchema is not None
            assert "type" in tool.inputSchema
            assert tool.inputSchema["type"] == "object"

    def test_get_project_status_schema(self) -> None:
        """Test getProjectStatus tool schema."""
        server = DevFlowMonitorServer()
        tools = server._get_tools()

        tool = next((t for t in tools if t.name == "getProjectStatus"), None)
        assert tool is not None

        schema = tool.inputSchema
        assert "properties" in schema
        assert "includeDetails" in schema["properties"]

    def test_get_metrics_schema(self) -> None:
        """Test getMetrics tool schema."""
        server = DevFlowMonitorServer()
        tools = server._get_tools()

        tool = next((t for t in tools if t.name == "getMetrics"), None)
        assert tool is not None

        schema = tool.inputSchema
        assert "properties" in schema
        assert "timeRange" in schema["properties"]
        assert "metricType" in schema["properties"]

    def test_get_activity_log_schema(self) -> None:
        """Test getActivityLog tool schema."""
        server = DevFlowMonitorServer()
        tools = server._get_tools()

        tool = next((t for t in tools if t.name == "getActivityLog"), None)
        assert tool is not None

        schema = tool.inputSchema
        assert "properties" in schema
        assert "limit" in schema["properties"]
        assert "stage" in schema["properties"]


@pytest.mark.integration
class TestToolExecution:
    """Tests for MCP tool execution."""

    @pytest.mark.asyncio
    async def test_get_project_status_execution(self) -> None:
        """Test getProjectStatus tool execution."""
        server = DevFlowMonitorServer()

        result = await server._handle_tool_call(
            "getProjectStatus",
            {"includeDetails": True},
        )

        assert len(result) == 1
        assert result[0].type == "text"
        assert "Project Status" in result[0].text

    @pytest.mark.asyncio
    async def test_get_metrics_execution(self) -> None:
        """Test getMetrics tool execution."""
        server = DevFlowMonitorServer()

        result = await server._handle_tool_call(
            "getMetrics",
            {"timeRange": "1d", "metricType": "all"},
        )

        assert len(result) == 1
        assert result[0].type == "text"
        assert "Metrics" in result[0].text

    @pytest.mark.asyncio
    async def test_get_activity_log_execution(self) -> None:
        """Test getActivityLog tool execution."""
        server = DevFlowMonitorServer()

        result = await server._handle_tool_call(
            "getActivityLog",
            {"limit": 10},
        )

        assert len(result) == 1
        assert result[0].type == "text"
        assert "Activity Log" in result[0].text

    @pytest.mark.asyncio
    async def test_analyze_bottlenecks_execution(self) -> None:
        """Test analyzeBottlenecks tool execution."""
        server = DevFlowMonitorServer()

        result = await server._handle_tool_call(
            "analyzeBottlenecks",
            {"analysisDepth": "basic"},
        )

        assert len(result) == 1
        assert result[0].type == "text"
        assert "Bottleneck Analysis" in result[0].text

    @pytest.mark.asyncio
    async def test_check_methodology_execution(self) -> None:
        """Test checkMethodology tool execution."""
        server = DevFlowMonitorServer()

        result = await server._handle_tool_call(
            "checkMethodology",
            {"methodology": "all", "includeRecommendations": True},
        )

        assert len(result) == 1
        assert result[0].type == "text"
        assert "Methodology Check" in result[0].text

    @pytest.mark.asyncio
    async def test_generate_report_execution(self) -> None:
        """Test generateReport tool execution."""
        server = DevFlowMonitorServer()

        result = await server._handle_tool_call(
            "generateReport",
            {"reportType": "daily", "format": "summary"},
        )

        assert len(result) == 1
        assert result[0].type == "text"
        assert "Generated Report" in result[0].text

    @pytest.mark.asyncio
    async def test_unknown_tool_returns_error(self) -> None:
        """Test that unknown tool returns error message."""
        server = DevFlowMonitorServer()

        result = await server._handle_tool_call(
            "unknownTool",
            {},
        )

        assert len(result) == 1
        assert "Unknown tool" in result[0].text

    @pytest.mark.asyncio
    async def test_tool_with_empty_arguments(self) -> None:
        """Test tool execution with empty arguments."""
        server = DevFlowMonitorServer()

        result = await server._handle_tool_call(
            "getProjectStatus",
            {},
        )

        assert len(result) == 1
        assert result[0].type == "text"

    @pytest.mark.asyncio
    async def test_tool_execution_error_handling(self) -> None:
        """Test error handling during tool execution."""
        server = DevFlowMonitorServer()

        # Mock the handler to raise an exception
        with patch.object(
            server,
            "_handle_get_project_status",
            side_effect=Exception("Test error"),
        ):
            result = await server._handle_tool_call(
                "getProjectStatus",
                {},
            )

            assert len(result) == 1
            assert "Error executing tool" in result[0].text


@pytest.mark.integration
class TestServerRun:
    """Tests for server run functionality."""

    @pytest.mark.asyncio
    async def test_server_run_cancellation(self) -> None:
        """Test that server can be cancelled gracefully."""
        server = DevFlowMonitorServer()

        # Create a task that we'll cancel
        with patch("devflow_monitor.server.main.stdio_server") as mock_stdio:
            mock_read = AsyncMock()
            mock_write = AsyncMock()
            mock_context = MagicMock()
            mock_context.__aenter__ = AsyncMock(return_value=(mock_read, mock_write))
            mock_context.__aexit__ = AsyncMock(return_value=None)
            mock_stdio.return_value = mock_context

            # Mock the server.run to be cancellable
            server.server.run = AsyncMock(side_effect=asyncio.CancelledError)

            with pytest.raises(asyncio.CancelledError):
                await server.run()


@pytest.mark.integration
class TestToolHandlers:
    """Tests for individual tool handlers."""

    @pytest.mark.asyncio
    async def test_get_project_status_with_details(self) -> None:
        """Test getProjectStatus with includeDetails=True."""
        server = DevFlowMonitorServer()

        result = await server._handle_get_project_status(
            {"includeDetails": True},
        )

        assert "Project Status" in result
        assert "project" in result

    @pytest.mark.asyncio
    async def test_get_metrics_different_ranges(self) -> None:
        """Test getMetrics with different time ranges."""
        server = DevFlowMonitorServer()

        for time_range in ["1h", "1d", "1w", "1m"]:
            result = await server._handle_get_metrics(
                {"timeRange": time_range},
            )
            assert "Metrics" in result

    @pytest.mark.asyncio
    async def test_get_activity_log_with_stage_filter(self) -> None:
        """Test getActivityLog with stage filter."""
        server = DevFlowMonitorServer()

        result = await server._handle_get_activity_log(
            {"limit": 10, "stage": "coding"},
        )

        assert "Activity Log" in result

    @pytest.mark.asyncio
    async def test_analyze_bottlenecks_different_depths(self) -> None:
        """Test analyzeBottlenecks with different analysis depths."""
        server = DevFlowMonitorServer()

        for depth in ["basic", "detailed", "comprehensive"]:
            result = await server._handle_analyze_bottlenecks(
                {"analysisDepth": depth},
            )
            assert "Bottleneck Analysis" in result

    @pytest.mark.asyncio
    async def test_check_methodology_individual(self) -> None:
        """Test checkMethodology for individual methodologies."""
        server = DevFlowMonitorServer()

        for methodology in ["ddd", "tdd", "bdd", "eda"]:
            result = await server._handle_check_methodology(
                {"methodology": methodology, "includeRecommendations": True},
            )
            assert "Methodology Check" in result

    @pytest.mark.asyncio
    async def test_generate_report_different_formats(self) -> None:
        """Test generateReport with different formats."""
        server = DevFlowMonitorServer()

        for fmt in ["json", "markdown", "summary"]:
            result = await server._handle_generate_report(
                {"reportType": "daily", "format": fmt},
            )
            assert "Generated Report" in result
