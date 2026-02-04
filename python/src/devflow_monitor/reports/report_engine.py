"""
Report Engine.

Generates various types of reports by collecting data from analyzers
and formatting it according to report configuration.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

import aiofiles

from .types import (
    ChartData,
    DeliveryResult,
    GeneratedFile,
    ReportConfig,
    ReportData,
    ReportEventType,
    ReportFormat,
    ReportMetadata,
    ReportResult,
    ReportSection,
    ReportSectionType,
    ReportStatus,
    ReportType,
    TableData,
)


class ReportEngineConfig:
    """Report engine configuration."""

    def __init__(
        self,
        reports_path: str = "./reports",
        templates_path: str = "./report-templates",
        temp_path: str = "./temp",
        max_concurrent_generations: int = 3,
        generation_timeout: int = 300000,  # 5 minutes in ms
        enable_cache: bool = True,
        cache_ttl: int = 3600000,  # 1 hour in ms
    ):
        """
        Initialize report engine configuration.

        Args:
            reports_path: Path to store generated reports.
            templates_path: Path to report templates.
            temp_path: Path for temporary files.
            max_concurrent_generations: Maximum concurrent report generations.
            generation_timeout: Generation timeout in milliseconds.
            enable_cache: Enable report caching.
            cache_ttl: Cache TTL in milliseconds.
        """
        self.reports_path = reports_path
        self.templates_path = templates_path
        self.temp_path = temp_path
        self.max_concurrent_generations = max_concurrent_generations
        self.generation_timeout = generation_timeout
        self.enable_cache = enable_cache
        self.cache_ttl = cache_ttl


class ReportEngine:
    """
    Report generation engine.

    Coordinates data collection from various analyzers and generates
    reports in multiple formats.
    """

    def __init__(
        self,
        config: ReportEngineConfig | None = None,
        metrics_collector: Any = None,
        methodology_analyzer: Any = None,
        ai_monitor: Any = None,
        bottleneck_detector: Any = None,
        stage_analyzer: Any = None,
        event_engine: Any = None,
        storage_manager: Any = None,
    ):
        """
        Initialize the report engine.

        Args:
            config: Report engine configuration.
            metrics_collector: Metrics collector instance.
            methodology_analyzer: Methodology analyzer instance.
            ai_monitor: AI monitor instance.
            bottleneck_detector: Bottleneck detector instance.
            stage_analyzer: Stage analyzer instance.
            event_engine: Event engine instance.
            storage_manager: Storage manager instance.
        """
        self._config = config or ReportEngineConfig()
        self._metrics_collector = metrics_collector
        self._methodology_analyzer = methodology_analyzer
        self._ai_monitor = ai_monitor
        self._bottleneck_detector = bottleneck_detector
        self._stage_analyzer = stage_analyzer
        self._event_engine = event_engine
        self._storage_manager = storage_manager

        self._generation_queue: dict[str, asyncio.Task] = {}
        self._report_cache: dict[str, tuple[ReportResult, float]] = {}
        self._listeners: dict[str, list[Callable]] = {}

        asyncio.create_task(self._initialize())

    async def _initialize(self) -> None:
        """Initialize the engine and ensure directories exist."""
        await self._ensure_directories()
        if self._config.enable_cache:
            asyncio.create_task(self._cache_cleanup_loop())

    async def _ensure_directories(self) -> None:
        """Ensure required directories exist."""
        for path in [
            self._config.reports_path,
            self._config.templates_path,
            self._config.temp_path,
        ]:
            Path(path).mkdir(parents=True, exist_ok=True)

    async def _cache_cleanup_loop(self) -> None:
        """Periodically clean up expired cache entries."""
        while True:
            await asyncio.sleep(60)  # 1 minute
            self._cleanup_cache()

    def _cleanup_cache(self) -> None:
        """Remove expired cache entries."""
        now = datetime.utcnow().timestamp() * 1000
        expired_keys = [
            key
            for key, (_, timestamp) in self._report_cache.items()
            if now - timestamp > self._config.cache_ttl
        ]
        for key in expired_keys:
            del self._report_cache[key]

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

    async def generate_report(
        self,
        config: ReportConfig,
        project_ids: list[str] | None = None,
        period_start: datetime | None = None,
        period_end: datetime | None = None,
    ) -> ReportResult:
        """
        Generate a report based on configuration.

        Args:
            config: Report configuration.
            project_ids: List of project IDs to include.
            period_start: Report period start date.
            period_end: Report period end date.

        Returns:
            Report generation result.

        Raises:
            RuntimeError: If max concurrent generations reached.
        """
        report_id = str(uuid4())
        now = datetime.utcnow()

        # Check cache
        if self._config.enable_cache:
            cache_key = self._get_cache_key(config, project_ids, period_start, period_end)
            if cache_key in self._report_cache:
                cached_result, timestamp = self._report_cache[cache_key]
                if now.timestamp() * 1000 - timestamp < self._config.cache_ttl:
                    return cached_result

        # Check concurrent generation limit
        if len(self._generation_queue) >= self._config.max_concurrent_generations:
            raise RuntimeError("Maximum concurrent report generations reached")

        # Create metadata
        metadata = ReportMetadata(
            id=report_id,
            type=config.type,
            title=self._generate_title(config),
            description=config.parameters.get("description") if config.parameters else None,
            status=ReportStatus.PENDING,
            period_start=period_start or now,
            period_end=period_end or now,
            project_ids=project_ids or [],
            created_by=config.parameters.get("created_by", "system") if config.parameters else "system",
            tags=config.parameters.get("tags", []) if config.parameters else [],
        )

        # Start generation
        task = asyncio.create_task(self._do_generate_report(metadata, config))
        self._generation_queue[report_id] = task

        try:
            result = await task

            # Cache result
            if self._config.enable_cache:
                cache_key = self._get_cache_key(config, project_ids, period_start, period_end)
                self._report_cache[cache_key] = (result, now.timestamp() * 1000)

            return result
        finally:
            del self._generation_queue[report_id]

    async def _do_generate_report(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
    ) -> ReportResult:
        """Perform actual report generation."""
        start_time = datetime.utcnow()

        try:
            metadata.status = ReportStatus.GENERATING
            self.emit(ReportEventType.GENERATION_STARTED.value, {"report_id": metadata.id})

            # Collect data
            data = await self._collect_report_data(metadata, config)

            # Generate files
            files: list[GeneratedFile] = []
            for fmt in config.formats:
                file = await self._generate_report_file(metadata, config, data, fmt)
                files.append(file)

            # Create result
            end_time = datetime.utcnow()
            generation_time = int((end_time - start_time).total_seconds() * 1000)

            result = ReportResult(
                metadata=ReportMetadata(
                    **{**metadata.model_dump(), "status": ReportStatus.COMPLETED, "updated_at": end_time}
                ),
                files=files,
                generation_time=generation_time,
                warnings=[],
            )

            self.emit(ReportEventType.GENERATION_COMPLETED.value, {"report_id": metadata.id, "result": result})
            return result

        except Exception as e:
            metadata.status = ReportStatus.FAILED
            metadata.updated_at = datetime.utcnow()

            end_time = datetime.utcnow()
            generation_time = int((end_time - start_time).total_seconds() * 1000)

            result = ReportResult(
                metadata=metadata,
                files=[],
                generation_time=generation_time,
                error=str(e),
            )

            self.emit(ReportEventType.GENERATION_FAILED.value, {"report_id": metadata.id, "error": str(e)})
            raise

    async def _collect_report_data(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
    ) -> ReportData:
        """Collect data for all enabled report sections."""
        data = ReportData()

        for section in config.sections:
            if section.enabled:
                await self._collect_section_data(section, metadata, config, data)

        return data

    async def _collect_section_data(
        self,
        section: ReportSection,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect data for a specific section."""
        section_handlers = {
            ReportSectionType.EXECUTIVE_SUMMARY: self._collect_executive_summary,
            ReportSectionType.METRICS_OVERVIEW: self._collect_metrics_overview,
            ReportSectionType.ACTIVITY_TIMELINE: self._collect_activity_timeline,
            ReportSectionType.DEVELOPMENT_STAGES: self._collect_development_stages,
            ReportSectionType.METHODOLOGY_COMPLIANCE: self._collect_methodology_compliance,
            ReportSectionType.AI_COLLABORATION: self._collect_ai_collaboration,
            ReportSectionType.BOTTLENECK_ANALYSIS: self._collect_bottleneck_analysis,
            ReportSectionType.PERFORMANCE_TRENDS: self._collect_performance_trends,
            ReportSectionType.QUALITY_METRICS: self._collect_quality_metrics,
            ReportSectionType.TEAM_PRODUCTIVITY: self._collect_team_productivity,
            ReportSectionType.RECOMMENDATIONS: self._collect_recommendations,
            ReportSectionType.CUSTOM: lambda m, c, d: self._collect_custom_section(section, m, c, d),
        }

        handler = section_handlers.get(section.type)
        if handler:
            await handler(metadata, config, data)

    async def _collect_executive_summary(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect executive summary data."""
        metrics_snapshot = {}
        bottlenecks: list[Any] = []

        if self._metrics_collector:
            metrics_snapshot = self._metrics_collector.get_metrics_snapshot()

        if self._bottleneck_detector:
            bottlenecks = self._bottleneck_detector.get_all_bottlenecks()

        critical_bottlenecks = [b for b in bottlenecks if getattr(b, "severity", "") == "critical"]

        data.analysis["executive_summary"] = {
            "total_events": metrics_snapshot.get("total_events", 0),
            "active_users": 0,  # TODO: Implement user tracking
            "productivity_score": 0,  # TODO: Calculate productivity score
            "quality_score": 0,  # TODO: Calculate quality score
            "critical_bottlenecks": len(critical_bottlenecks),
            "key_highlights": self._generate_key_highlights(metrics_snapshot, bottlenecks),
        }

    async def _collect_metrics_overview(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect metrics overview data."""
        if not self._metrics_collector:
            return

        metrics = self._metrics_collector.get_all_metrics()
        data.metrics = metrics

        # Create metrics chart
        data.charts.append(
            ChartData(
                id="metrics-timeline",
                type="line",
                title="Metrics Timeline",
                series=self._create_metrics_time_series(metrics),
                options={"x_axis": {"type": "datetime"}, "y_axis": {"title": "Value"}},
            )
        )

    async def _collect_activity_timeline(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect activity timeline data."""
        events: list[dict[str, Any]] = []
        # TODO: Query events from storage

        data.events = events

        data.charts.append(
            ChartData(
                id="activity-heatmap",
                type="heatmap",
                title="Activity Heatmap",
                series=self._create_activity_heatmap(events),
                options={"x_axis": {"type": "datetime"}, "y_axis": {"type": "category"}},
            )
        )

    async def _collect_development_stages(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect development stages data."""
        current_stage = "unknown"
        if self._stage_analyzer:
            current_stage = self._stage_analyzer.get_current_stage()

        stage_analysis = {"stages": [{"name": current_stage, "progress": 50}]}
        data.analysis["development_stages"] = stage_analysis

        data.charts.append(
            ChartData(
                id="stage-progress",
                type="bar",
                title="Stage Progress",
                series=[
                    {
                        "name": "Progress",
                        "data": [{"x": s["name"], "y": s["progress"]} for s in stage_analysis["stages"]],
                    }
                ],
                options={"x_axis": {"type": "category"}, "y_axis": {"max": 100}},
            )
        )

    async def _collect_methodology_compliance(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect methodology compliance data."""
        methodology_scores: dict[str, Any] = {"scores": {}}

        if self._methodology_analyzer:
            analysis_result = self._methodology_analyzer.analyze()
            methodology_scores = {
                "scores": {
                    m.value: s.score
                    for m, s in analysis_result.scores.items()
                }
            }

        data.analysis["methodology_compliance"] = methodology_scores

        data.charts.append(
            ChartData(
                id="methodology-scores",
                type="donut",
                title="Methodology Compliance",
                series=[
                    {"name": method.upper(), "value": score}
                    for method, score in methodology_scores.get("scores", {}).items()
                ],
                options={"legend": {"position": "right"}},
            )
        )

    async def _collect_ai_collaboration(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect AI collaboration data."""
        ai_analysis = {"interactions": [], "insights": [], "collaboration": {"score": 0}}

        if self._ai_monitor:
            # TODO: Get AI analysis data
            pass

        data.analysis["ai_collaboration"] = ai_analysis

        data.charts.append(
            ChartData(
                id="ai-usage",
                type="area",
                title="AI Tool Usage",
                series=self._create_ai_usage_time_series(ai_analysis),
                options={"x_axis": {"type": "datetime"}, "y_axis": {"title": "Sessions"}, "stacked": True},
            )
        )

    async def _collect_bottleneck_analysis(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect bottleneck analysis data."""
        bottlenecks: list[Any] = []

        if self._bottleneck_detector:
            bottlenecks = self._bottleneck_detector.get_all_bottlenecks()

        data.analysis["bottlenecks"] = [
            {
                "type": getattr(b, "type", "unknown"),
                "severity": getattr(b, "severity", "unknown"),
                "description": getattr(b, "description", ""),
                "impact": getattr(b, "impact", 0),
            }
            for b in bottlenecks
        ]

        data.tables.append(
            TableData(
                id="bottleneck-list",
                title="Detected Bottlenecks",
                columns=[
                    {"key": "type", "title": "Type", "sortable": True},
                    {"key": "severity", "title": "Severity", "sortable": True},
                    {"key": "description", "title": "Description"},
                    {"key": "impact", "title": "Impact", "type": "number", "sortable": True},
                ],
                rows=data.analysis["bottlenecks"],
            )
        )

    async def _collect_performance_trends(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect performance trends data."""
        if not self._metrics_collector:
            return

        trends = self._metrics_collector.get_all_metrics()

        data.analysis["performance_trends"] = {
            "build_time": self._calculate_trend(trends, "build_time"),
            "test_time": self._calculate_trend(trends, "test_time"),
            "deployment_frequency": self._calculate_trend(trends, "deployment_frequency"),
            "lead_time": self._calculate_trend(trends, "lead_time"),
        }

    async def _collect_quality_metrics(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect quality metrics data."""
        if not self._metrics_collector:
            return

        metrics_snapshot = self._metrics_collector.get_metrics_snapshot()

        data.analysis["quality_metrics"] = {
            "test_coverage": metrics_snapshot.get("average_test_coverage", 0),
            "code_review_rate": metrics_snapshot.get("code_review_rate", 0),
            "bug_density": metrics_snapshot.get("bug_density", 0),
            "technical_debt": metrics_snapshot.get("technical_debt", 0),
        }

        data.charts.append(
            ChartData(
                id="quality-trends",
                type="line",
                title="Quality Trends",
                series=[
                    {"name": "Test Coverage", "data": []},
                    {"name": "Code Review Rate", "data": []},
                    {"name": "Bug Density", "data": []},
                ],
                options={"x_axis": {"type": "datetime"}, "y_axis": {"title": "Percentage"}},
            )
        )

    async def _collect_team_productivity(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect team productivity data."""
        if not self._metrics_collector:
            return

        metrics_snapshot = self._metrics_collector.get_metrics_snapshot()

        data.analysis["team_productivity"] = {
            "average_velocity": metrics_snapshot.get("average_velocity", 0),
            "cycle_time": metrics_snapshot.get("cycle_time", 0),
            "throughput": metrics_snapshot.get("throughput", 0),
            "collaboration_score": metrics_snapshot.get("collaboration_score", 0),
        }

    async def _collect_recommendations(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect recommendations data."""
        bottlenecks: list[Any] = []
        methodology_scores: dict[str, Any] = {"scores": {}}

        if self._bottleneck_detector:
            bottlenecks = self._bottleneck_detector.get_all_bottlenecks()

        if self._methodology_analyzer:
            methodology_scores = {"scores": {}}

        data.analysis["recommendations"] = self._generate_recommendations(
            bottlenecks, methodology_scores, data.metrics
        )

    async def _collect_custom_section(
        self,
        section: ReportSection,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> None:
        """Collect custom section data."""
        if section.config and "handler" in section.config:
            handler = section.config["handler"]
            if callable(handler):
                custom_data = await handler(metadata, config, self)
                data.custom[section.id] = custom_data

    async def _generate_report_file(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
        fmt: ReportFormat,
    ) -> GeneratedFile:
        """Generate a report file in the specified format."""
        filename = self._generate_filename(metadata, fmt)
        filepath = Path(self._config.reports_path) / filename

        if fmt == ReportFormat.HTML:
            content = await self._generate_html_report(metadata, config, data)
            mime_type = "text/html"
        elif fmt == ReportFormat.MARKDOWN:
            content = await self._generate_markdown_report(metadata, config, data)
            mime_type = "text/markdown"
        elif fmt == ReportFormat.JSON:
            content = json.dumps(
                {"metadata": metadata.model_dump(mode="json"), "data": data.model_dump(mode="json")},
                indent=2,
                default=str,
            ).encode()
            mime_type = "application/json"
        elif fmt == ReportFormat.PDF:
            # PDF generation handled by PDFGenerator
            content = b"PDF generation requires PDFGenerator"
            mime_type = "application/pdf"
        else:
            raise ValueError(f"Unsupported format: {fmt}")

        async with aiofiles.open(filepath, "wb") as f:
            await f.write(content if isinstance(content, bytes) else content.encode())

        return GeneratedFile(
            format=fmt,
            path=str(filepath),
            size=len(content),
            mime_type=mime_type,
        )

    async def _generate_html_report(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> bytes:
        """Generate HTML report content."""
        custom_css = config.styling.custom_css if config.styling else ""

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{metadata.title}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        h1, h2, h3 {{ color: #333; }}
        .section {{ margin: 30px 0; }}
        .metric {{ display: inline-block; margin: 10px; padding: 10px; background: #f0f0f0; }}
        .chart {{ margin: 20px 0; }}
        table {{ border-collapse: collapse; width: 100%; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f2f2f2; }}
        {custom_css}
    </style>
</head>
<body>
    <h1>{metadata.title}</h1>
    <p>Period: {metadata.period_start.strftime('%Y-%m-%d')} - {metadata.period_end.strftime('%Y-%m-%d')}</p>
"""

        for section in config.sections:
            if section.enabled:
                html += self._render_html_section(section, data)

        html += "</body></html>"
        return html.encode()

    async def _generate_markdown_report(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
    ) -> bytes:
        """Generate Markdown report content."""
        md = f"# {metadata.title}\n\n"
        md += f"**Period**: {metadata.period_start.strftime('%Y-%m-%d')} - {metadata.period_end.strftime('%Y-%m-%d')}\n\n"

        for section in config.sections:
            if section.enabled:
                md += self._render_markdown_section(section, data)

        return md.encode()

    def _render_html_section(self, section: ReportSection, data: ReportData) -> str:
        """Render a section to HTML."""
        html = f'<div class="section">\n<h2>{section.name}</h2>\n'

        if section.type == ReportSectionType.EXECUTIVE_SUMMARY:
            summary = data.analysis.get("executive_summary", {})
            html += f"""
            <div class="metric">Total Events: {summary.get('total_events', 0)}</div>
            <div class="metric">Active Users: {summary.get('active_users', 0)}</div>
            <div class="metric">Productivity Score: {summary.get('productivity_score', 0):.1f}</div>
            <div class="metric">Quality Score: {summary.get('quality_score', 0):.1f}</div>
            """

        html += "</div>\n"
        return html

    def _render_markdown_section(self, section: ReportSection, data: ReportData) -> str:
        """Render a section to Markdown."""
        md = f"## {section.name}\n\n"

        if section.type == ReportSectionType.EXECUTIVE_SUMMARY:
            summary = data.analysis.get("executive_summary", {})
            md += f"- **Total Events**: {summary.get('total_events', 0)}\n"
            md += f"- **Active Users**: {summary.get('active_users', 0)}\n"
            md += f"- **Productivity Score**: {summary.get('productivity_score', 0):.1f}\n"
            md += f"- **Quality Score**: {summary.get('quality_score', 0):.1f}\n\n"

        return md

    def _generate_title(self, config: ReportConfig) -> str:
        """Generate report title from config."""
        type_labels = {
            ReportType.DAILY: "Daily Report",
            ReportType.WEEKLY: "Weekly Report",
            ReportType.MONTHLY: "Monthly Report",
            ReportType.QUARTERLY: "Quarterly Report",
            ReportType.CUSTOM: "Custom Report",
            ReportType.INCIDENT: "Incident Report",
            ReportType.PERFORMANCE: "Performance Report",
            ReportType.METHODOLOGY: "Methodology Report",
            ReportType.AI_USAGE: "AI Usage Report",
            ReportType.CROSS_PROJECT: "Cross-Project Report",
        }

        if config.parameters and "title" in config.parameters:
            return config.parameters["title"]

        return type_labels.get(config.type, "Report")

    def _generate_filename(self, metadata: ReportMetadata, fmt: ReportFormat) -> str:
        """Generate report filename."""
        date_str = metadata.created_at.strftime("%Y-%m-%d")
        type_str = metadata.type.value.replace("_", "-")
        return f"{type_str}-{date_str}-{metadata.id[:8]}.{fmt.value}"

    def _get_cache_key(
        self,
        config: ReportConfig,
        project_ids: list[str] | None,
        period_start: datetime | None,
        period_end: datetime | None,
    ) -> str:
        """Generate cache key for report."""
        project_str = ",".join(project_ids or [])
        start_str = period_start.isoformat() if period_start else ""
        end_str = period_end.isoformat() if period_end else ""
        return f"{config.type.value}-{project_str}-{start_str}-{end_str}"

    def _generate_key_highlights(
        self,
        metrics: dict[str, Any],
        bottlenecks: list[Any],
    ) -> list[str]:
        """Generate key highlights for executive summary."""
        highlights: list[str] = []

        scores = metrics.get("scores", {})
        if scores.get("productivity", 0) > 80:
            highlights.append("High productivity score indicates efficient development")

        critical_bottlenecks = [b for b in bottlenecks if getattr(b, "severity", "") == "critical"]
        if critical_bottlenecks:
            highlights.append("Critical bottlenecks detected requiring immediate attention")

        if metrics.get("average_test_coverage", 100) < 60:
            highlights.append("Test coverage below recommended threshold")

        return highlights

    def _generate_recommendations(
        self,
        bottlenecks: list[Any],
        methodology_scores: dict[str, Any],
        metrics: dict[str, Any],
    ) -> list[str]:
        """Generate recommendations based on analysis."""
        recommendations: list[str] = []

        # Bottleneck-based recommendations
        for b in bottlenecks:
            if getattr(b, "type", "") == "process" and getattr(b, "severity", "") == "critical":
                recommendations.append("Review and optimize development process workflows")
                break

        # Methodology-based recommendations
        scores = methodology_scores.get("scores", {})
        if scores.get("tdd", 100) < 50:
            recommendations.append("Increase test-driven development practices")

        # Metrics-based recommendations
        if metrics.get("average_test_coverage", 100) < 70:
            recommendations.append("Improve test coverage to at least 70%")

        return recommendations

    def _create_metrics_time_series(self, metrics: dict[str, Any]) -> list[dict[str, Any]]:
        """Create time series data for metrics."""
        return []  # TODO: Implement

    def _create_activity_heatmap(self, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Create heatmap data for activities."""
        return []  # TODO: Implement

    def _create_ai_usage_time_series(self, analysis: dict[str, Any]) -> list[dict[str, Any]]:
        """Create time series data for AI usage."""
        return []  # TODO: Implement

    def _calculate_trend(self, data: dict[str, Any], metric: str) -> dict[str, Any]:
        """Calculate trend for a metric."""
        return {"value": 0, "change": 0, "trend": "stable"}

    async def get_report(self, report_id: str) -> ReportResult | None:
        """
        Get a previously generated report.

        Args:
            report_id: Report ID to retrieve.

        Returns:
            Report result if found, None otherwise.
        """
        reports_path = Path(self._config.reports_path)

        try:
            # Find JSON file with report ID
            for file in reports_path.glob(f"*{report_id[:8]}*.json"):
                async with aiofiles.open(file, "r") as f:
                    content = await f.read()
                    data = json.loads(content)
                    return ReportResult(**data)
        except Exception:
            pass

        return None


# Singleton instance
_report_engine: ReportEngine | None = None


def get_report_engine() -> ReportEngine:
    """Get the singleton report engine instance."""
    global _report_engine
    if _report_engine is None:
        _report_engine = ReportEngine()
    return _report_engine
