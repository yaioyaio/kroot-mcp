"""
Report Template Manager.

Manages report templates with CRUD operations and default templates.
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
    DeliveryConfig,
    ReportConfig,
    ReportFormat,
    ReportSection,
    ReportSectionType,
    ReportTemplate,
    ReportType,
)


class TemplateManagerConfig:
    """Template manager configuration."""

    def __init__(
        self,
        templates_path: str = "./report-templates",
        enable_default_templates: bool = True,
        enable_cache: bool = True,
        cache_ttl: int = 3600000,  # 1 hour in ms
    ):
        """
        Initialize template manager configuration.

        Args:
            templates_path: Path to store templates.
            enable_default_templates: Create default templates on init.
            enable_cache: Enable template caching.
            cache_ttl: Cache TTL in milliseconds.
        """
        self.templates_path = templates_path
        self.enable_default_templates = enable_default_templates
        self.enable_cache = enable_cache
        self.cache_ttl = cache_ttl


class TemplateManager:
    """
    Report template manager.

    Provides CRUD operations for report templates and
    includes default templates for common report types.
    """

    def __init__(self, config: TemplateManagerConfig | None = None):
        """
        Initialize the template manager.

        Args:
            config: Template manager configuration.
        """
        self._config = config or TemplateManagerConfig()
        self._templates: dict[str, ReportTemplate] = {}
        self._template_cache: dict[str, tuple[ReportTemplate, float]] = {}
        self._listeners: dict[str, list[Callable]] = {}

        asyncio.create_task(self._initialize())

    async def _initialize(self) -> None:
        """Initialize the template manager."""
        await self._ensure_template_directory()

        if self._config.enable_default_templates:
            await self._create_default_templates()

        await self._load_templates()

        if self._config.enable_cache:
            asyncio.create_task(self._cache_cleanup_loop())

    async def _ensure_template_directory(self) -> None:
        """Ensure template directory exists."""
        Path(self._config.templates_path).mkdir(parents=True, exist_ok=True)

    async def _cache_cleanup_loop(self) -> None:
        """Periodically clean up expired cache entries."""
        while True:
            await asyncio.sleep(60)
            self._cleanup_cache()

    def _cleanup_cache(self) -> None:
        """Remove expired cache entries."""
        now = datetime.utcnow().timestamp() * 1000
        expired_keys = [
            key
            for key, (_, timestamp) in self._template_cache.items()
            if now - timestamp > self._config.cache_ttl
        ]
        for key in expired_keys:
            del self._template_cache[key]

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

    async def _create_default_templates(self) -> None:
        """Create default report templates."""
        default_templates = [
            {
                "name": "Daily Development Report",
                "description": "Comprehensive daily report for development activities",
                "type": ReportType.DAILY,
                "config": self._create_daily_report_config(),
            },
            {
                "name": "Weekly Team Summary",
                "description": "Weekly summary of team productivity and progress",
                "type": ReportType.WEEKLY,
                "config": self._create_weekly_report_config(),
            },
            {
                "name": "Monthly Performance Analysis",
                "description": "In-depth monthly performance and quality analysis",
                "type": ReportType.MONTHLY,
                "config": self._create_monthly_report_config(),
            },
            {
                "name": "Methodology Compliance Report",
                "description": "Analysis of development methodology compliance",
                "type": ReportType.METHODOLOGY,
                "config": self._create_methodology_report_config(),
            },
            {
                "name": "AI Collaboration Analysis",
                "description": "Detailed analysis of AI tool usage and effectiveness",
                "type": ReportType.AI_USAGE,
                "config": self._create_ai_usage_report_config(),
            },
        ]

        for template_data in default_templates:
            existing = next(
                (
                    t
                    for t in self._templates.values()
                    if t.name == template_data["name"] and t.type == template_data["type"]
                ),
                None,
            )

            if not existing:
                await self.create_template(
                    name=template_data["name"],
                    description=template_data["description"],
                    template_type=template_data["type"],
                    default_config=template_data["config"],
                    created_by="system",
                    is_public=True,
                )

    def _create_daily_report_config(self) -> ReportConfig:
        """Create daily report configuration."""
        return ReportConfig(
            type=ReportType.DAILY,
            sections=[
                ReportSection(
                    id="executive-summary",
                    name="Executive Summary",
                    type=ReportSectionType.EXECUTIVE_SUMMARY,
                    enabled=True,
                    order=1,
                ),
                ReportSection(
                    id="activity-timeline",
                    name="Activity Timeline",
                    type=ReportSectionType.ACTIVITY_TIMELINE,
                    enabled=True,
                    order=2,
                ),
                ReportSection(
                    id="development-stages",
                    name="Development Progress",
                    type=ReportSectionType.DEVELOPMENT_STAGES,
                    enabled=True,
                    order=3,
                ),
                ReportSection(
                    id="bottlenecks",
                    name="Bottleneck Analysis",
                    type=ReportSectionType.BOTTLENECK_ANALYSIS,
                    enabled=True,
                    order=4,
                ),
                ReportSection(
                    id="recommendations",
                    name="Recommendations",
                    type=ReportSectionType.RECOMMENDATIONS,
                    enabled=True,
                    order=5,
                ),
            ],
            formats=[ReportFormat.HTML, ReportFormat.PDF],
            delivery_channels=[],
            parameters={
                "include_charts": True,
                "include_tables": True,
                "max_events": 100,
            },
        )

    def _create_weekly_report_config(self) -> ReportConfig:
        """Create weekly report configuration."""
        return ReportConfig(
            type=ReportType.WEEKLY,
            sections=[
                ReportSection(
                    id="executive-summary",
                    name="Executive Summary",
                    type=ReportSectionType.EXECUTIVE_SUMMARY,
                    enabled=True,
                    order=1,
                ),
                ReportSection(
                    id="metrics-overview",
                    name="Metrics Overview",
                    type=ReportSectionType.METRICS_OVERVIEW,
                    enabled=True,
                    order=2,
                ),
                ReportSection(
                    id="team-productivity",
                    name="Team Productivity",
                    type=ReportSectionType.TEAM_PRODUCTIVITY,
                    enabled=True,
                    order=3,
                ),
                ReportSection(
                    id="quality-metrics",
                    name="Quality Metrics",
                    type=ReportSectionType.QUALITY_METRICS,
                    enabled=True,
                    order=4,
                ),
                ReportSection(
                    id="performance-trends",
                    name="Performance Trends",
                    type=ReportSectionType.PERFORMANCE_TRENDS,
                    enabled=True,
                    order=5,
                ),
                ReportSection(
                    id="recommendations",
                    name="Recommendations",
                    type=ReportSectionType.RECOMMENDATIONS,
                    enabled=True,
                    order=6,
                ),
            ],
            formats=[ReportFormat.HTML, ReportFormat.PDF, ReportFormat.MARKDOWN],
            delivery_channels=[],
            parameters={
                "include_charts": True,
                "include_tables": True,
                "compare_with_previous": True,
            },
        )

    def _create_monthly_report_config(self) -> ReportConfig:
        """Create monthly report configuration."""
        return ReportConfig(
            type=ReportType.MONTHLY,
            sections=[
                ReportSection(
                    id="executive-summary",
                    name="Executive Summary",
                    type=ReportSectionType.EXECUTIVE_SUMMARY,
                    enabled=True,
                    order=1,
                ),
                ReportSection(
                    id="metrics-overview",
                    name="Comprehensive Metrics",
                    type=ReportSectionType.METRICS_OVERVIEW,
                    enabled=True,
                    order=2,
                ),
                ReportSection(
                    id="methodology-compliance",
                    name="Methodology Compliance",
                    type=ReportSectionType.METHODOLOGY_COMPLIANCE,
                    enabled=True,
                    order=3,
                ),
                ReportSection(
                    id="ai-collaboration",
                    name="AI Tool Usage",
                    type=ReportSectionType.AI_COLLABORATION,
                    enabled=True,
                    order=4,
                ),
                ReportSection(
                    id="quality-metrics",
                    name="Quality Analysis",
                    type=ReportSectionType.QUALITY_METRICS,
                    enabled=True,
                    order=5,
                ),
                ReportSection(
                    id="performance-trends",
                    name="Performance Trends",
                    type=ReportSectionType.PERFORMANCE_TRENDS,
                    enabled=True,
                    order=6,
                ),
                ReportSection(
                    id="team-productivity",
                    name="Team Performance",
                    type=ReportSectionType.TEAM_PRODUCTIVITY,
                    enabled=True,
                    order=7,
                ),
                ReportSection(
                    id="bottlenecks",
                    name="Bottleneck Analysis",
                    type=ReportSectionType.BOTTLENECK_ANALYSIS,
                    enabled=True,
                    order=8,
                ),
                ReportSection(
                    id="recommendations",
                    name="Strategic Recommendations",
                    type=ReportSectionType.RECOMMENDATIONS,
                    enabled=True,
                    order=9,
                ),
            ],
            formats=[ReportFormat.PDF, ReportFormat.HTML],
            delivery_channels=[],
            parameters={
                "include_charts": True,
                "include_tables": True,
                "include_comparison": True,
                "detail_level": "high",
            },
        )

    def _create_methodology_report_config(self) -> ReportConfig:
        """Create methodology report configuration."""
        return ReportConfig(
            type=ReportType.METHODOLOGY,
            sections=[
                ReportSection(
                    id="executive-summary",
                    name="Executive Summary",
                    type=ReportSectionType.EXECUTIVE_SUMMARY,
                    enabled=True,
                    order=1,
                ),
                ReportSection(
                    id="methodology-compliance",
                    name="Methodology Compliance Analysis",
                    type=ReportSectionType.METHODOLOGY_COMPLIANCE,
                    enabled=True,
                    order=2,
                    config={
                        "methodologies": ["DDD", "TDD", "BDD", "EDA"],
                        "include_details": True,
                        "include_history": True,
                    },
                ),
                ReportSection(
                    id="development-stages",
                    name="Development Process Analysis",
                    type=ReportSectionType.DEVELOPMENT_STAGES,
                    enabled=True,
                    order=3,
                ),
                ReportSection(
                    id="recommendations",
                    name="Improvement Recommendations",
                    type=ReportSectionType.RECOMMENDATIONS,
                    enabled=True,
                    order=4,
                ),
            ],
            formats=[ReportFormat.PDF, ReportFormat.MARKDOWN],
            delivery_channels=[],
            parameters={
                "focus_on_methodology": True,
                "include_examples": True,
            },
        )

    def _create_ai_usage_report_config(self) -> ReportConfig:
        """Create AI usage report configuration."""
        return ReportConfig(
            type=ReportType.AI_USAGE,
            sections=[
                ReportSection(
                    id="executive-summary",
                    name="Executive Summary",
                    type=ReportSectionType.EXECUTIVE_SUMMARY,
                    enabled=True,
                    order=1,
                ),
                ReportSection(
                    id="ai-collaboration",
                    name="AI Collaboration Analysis",
                    type=ReportSectionType.AI_COLLABORATION,
                    enabled=True,
                    order=2,
                    config={
                        "include_tools": ["Claude", "GitHub Copilot", "ChatGPT", "Cursor"],
                        "include_effectiveness": True,
                        "include_patterns": True,
                    },
                ),
                ReportSection(
                    id="metrics-overview",
                    name="AI Usage Metrics",
                    type=ReportSectionType.METRICS_OVERVIEW,
                    enabled=True,
                    order=3,
                ),
                ReportSection(
                    id="performance-trends",
                    name="AI Impact on Performance",
                    type=ReportSectionType.PERFORMANCE_TRENDS,
                    enabled=True,
                    order=4,
                ),
                ReportSection(
                    id="recommendations",
                    name="AI Usage Recommendations",
                    type=ReportSectionType.RECOMMENDATIONS,
                    enabled=True,
                    order=5,
                ),
            ],
            formats=[ReportFormat.PDF, ReportFormat.HTML],
            delivery_channels=[],
            parameters={
                "focus_on_ai": True,
                "include_roi": True,
            },
        )

    async def create_template(
        self,
        name: str,
        description: str,
        template_type: ReportType,
        default_config: ReportConfig,
        created_by: str = "user",
        is_public: bool = False,
        category: str | None = None,
        tags: list[str] | None = None,
    ) -> ReportTemplate:
        """
        Create a new report template.

        Args:
            name: Template name.
            description: Template description.
            template_type: Report type.
            default_config: Default report configuration.
            created_by: Creator identifier.
            is_public: Whether template is public.
            category: Template category.
            tags: Template tags.

        Returns:
            Created template.
        """
        template = ReportTemplate(
            id=str(uuid4()),
            name=name,
            description=description,
            type=template_type,
            default_config=default_config,
            category=category,
            tags=tags or [],
            public=is_public,
            created_by=created_by,
        )

        # Store template
        self._templates[template.id] = template
        await self._save_template(template)

        self.emit("template_created", template)

        return template

    async def update_template(
        self,
        template_id: str,
        updates: dict[str, Any],
    ) -> ReportTemplate | None:
        """
        Update an existing template.

        Args:
            template_id: Template ID to update.
            updates: Updates to apply.

        Returns:
            Updated template or None if not found.
        """
        template = self._templates.get(template_id)
        if not template:
            return None

        # System templates cannot be modified
        if template.created_by == "system":
            raise RuntimeError("Cannot modify system templates")

        # Apply updates
        template_dict = template.model_dump()
        template_dict.update(updates)
        template_dict["id"] = template.id
        template_dict["created_by"] = template.created_by
        template_dict["created_at"] = template.created_at
        template_dict["updated_at"] = datetime.utcnow()

        updated_template = ReportTemplate(**template_dict)

        # Update storage
        self._templates[template_id] = updated_template
        await self._save_template(updated_template)

        # Invalidate cache
        if template_id in self._template_cache:
            del self._template_cache[template_id]

        self.emit("template_updated", updated_template)

        return updated_template

    async def delete_template(self, template_id: str) -> bool:
        """
        Delete a template.

        Args:
            template_id: Template ID to delete.

        Returns:
            True if deleted, False if not found.
        """
        template = self._templates.get(template_id)
        if not template:
            return False

        # System templates cannot be deleted
        if template.created_by == "system":
            raise RuntimeError("Cannot delete system templates")

        # Remove from storage
        del self._templates[template_id]
        await self._remove_template(template_id)

        # Invalidate cache
        if template_id in self._template_cache:
            del self._template_cache[template_id]

        self.emit("template_deleted", template_id)

        return True

    def get_template(self, template_id: str) -> ReportTemplate | None:
        """
        Get a template by ID.

        Args:
            template_id: Template ID.

        Returns:
            Template or None if not found.
        """
        return self._templates.get(template_id)

    def get_all_templates(
        self,
        filters: dict[str, Any] | None = None,
    ) -> list[ReportTemplate]:
        """
        Get all templates, optionally filtered.

        Args:
            filters: Optional filters (type, category, tags, public, created_by).

        Returns:
            List of templates.
        """
        templates = list(self._templates.values())

        if filters:
            if "type" in filters:
                templates = [t for t in templates if t.type == filters["type"]]

            if "category" in filters:
                templates = [t for t in templates if t.category == filters["category"]]

            if "tags" in filters and filters["tags"]:
                templates = [
                    t
                    for t in templates
                    if any(tag in t.tags for tag in filters["tags"])
                ]

            if "public" in filters:
                templates = [t for t in templates if t.public == filters["public"]]

            if "created_by" in filters:
                templates = [t for t in templates if t.created_by == filters["created_by"]]

        return templates

    def create_config_from_template(
        self,
        template_id: str,
        overrides: dict[str, Any] | None = None,
    ) -> ReportConfig | None:
        """
        Create a report configuration from a template.

        Args:
            template_id: Template ID.
            overrides: Optional configuration overrides.

        Returns:
            Report configuration or None if template not found.
        """
        template = self.get_template(template_id)
        if not template:
            return None

        config_dict = template.default_config.model_dump()
        if overrides:
            config_dict.update(overrides)
        config_dict["template_id"] = template_id

        return ReportConfig(**config_dict)

    async def clone_template(
        self,
        template_id: str,
        new_name: str,
        created_by: str,
    ) -> ReportTemplate | None:
        """
        Clone an existing template.

        Args:
            template_id: Template ID to clone.
            new_name: Name for the new template.
            created_by: Creator identifier.

        Returns:
            Cloned template or None if source not found.
        """
        template = self.get_template(template_id)
        if not template:
            return None

        return await self.create_template(
            name=new_name,
            description=f"Clone of {template.description or template.name}",
            template_type=template.type,
            default_config=ReportConfig(**template.default_config.model_dump()),
            created_by=created_by,
            is_public=False,
            category=template.category,
            tags=[*template.tags, "cloned"],
        )

    async def export_template(self, template_id: str) -> str | None:
        """
        Export a template as JSON string.

        Args:
            template_id: Template ID to export.

        Returns:
            JSON string or None if not found.
        """
        template = self.get_template(template_id)
        if not template:
            return None

        export_data = template.model_dump(mode="json")
        # Remove sensitive fields
        export_data.pop("id", None)
        export_data.pop("created_by", None)
        export_data.pop("created_at", None)
        export_data.pop("updated_at", None)

        return json.dumps(export_data, indent=2, default=str)

    async def import_template(
        self,
        template_data: str,
        created_by: str,
    ) -> ReportTemplate:
        """
        Import a template from JSON string.

        Args:
            template_data: JSON template data.
            created_by: Creator identifier.

        Returns:
            Imported template.

        Raises:
            ValueError: If template data is invalid.
        """
        data = json.loads(template_data)

        if not data.get("name") or not data.get("type") or not data.get("default_config"):
            raise ValueError("Invalid template data")

        return await self.create_template(
            name=data["name"],
            description=data.get("description", ""),
            template_type=ReportType(data["type"]),
            default_config=ReportConfig(**data["default_config"]),
            created_by=created_by,
            is_public=False,
            category=data.get("category"),
            tags=data.get("tags", []),
        )

    def validate_template(self, template: ReportTemplate) -> list[str]:
        """
        Validate a template.

        Args:
            template: Template to validate.

        Returns:
            List of validation errors.
        """
        errors: list[str] = []

        if not template.name or not template.name.strip():
            errors.append("Template name is required")

        if not template.type:
            errors.append("Template type is required")

        if not template.default_config:
            errors.append("Default configuration is required")
        else:
            if not template.default_config.sections:
                errors.append("At least one section is required")
            if not template.default_config.formats:
                errors.append("At least one format is required")

        return errors

    def get_categories(self) -> list[str]:
        """
        Get list of template categories.

        Returns:
            List of category names.
        """
        categories = set()
        for template in self._templates.values():
            if template.category:
                categories.add(template.category)
        return sorted(categories)

    def get_tags(self) -> list[str]:
        """
        Get list of all template tags.

        Returns:
            List of tag names.
        """
        tags = set()
        for template in self._templates.values():
            tags.update(template.tags)
        return sorted(tags)

    async def _save_template(self, template: ReportTemplate) -> None:
        """Save template to file."""
        filepath = Path(self._config.templates_path) / f"{template.id}.json"
        content = template.model_dump_json(indent=2)

        async with aiofiles.open(filepath, "w") as f:
            await f.write(content)

    async def _remove_template(self, template_id: str) -> None:
        """Remove template file."""
        filepath = Path(self._config.templates_path) / f"{template_id}.json"
        try:
            filepath.unlink()
        except FileNotFoundError:
            pass

    async def _load_templates(self) -> None:
        """Load templates from files."""
        templates_path = Path(self._config.templates_path)

        for filepath in templates_path.glob("*.json"):
            try:
                async with aiofiles.open(filepath, "r") as f:
                    content = await f.read()
                    data = json.loads(content)
                    template = ReportTemplate(**data)
                    self._templates[template.id] = template
            except Exception:
                pass


# Singleton instance
_template_manager: TemplateManager | None = None


def get_template_manager() -> TemplateManager:
    """Get the singleton template manager instance."""
    global _template_manager
    if _template_manager is None:
        _template_manager = TemplateManager()
    return _template_manager
