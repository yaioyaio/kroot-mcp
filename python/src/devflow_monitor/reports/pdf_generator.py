"""
PDF Report Generator.

Generates PDF reports using reportlab library with charts,
tables, and custom styling.
"""

from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter, legal
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, mm
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .types import (
    ChartData,
    ReportConfig,
    ReportData,
    ReportMetadata,
    ReportSection,
    ReportSectionType,
    ReportStyling,
    TableData,
)


class PDFGeneratorConfig:
    """PDF generator configuration."""

    def __init__(
        self,
        fonts_path: str = "./fonts",
        images_path: str = "./images",
        margins: dict[str, float] | None = None,
        page_size: str = "A4",
        orientation: str = "portrait",
    ):
        """
        Initialize PDF generator configuration.

        Args:
            fonts_path: Path to custom fonts directory.
            images_path: Path to images directory.
            margins: Page margins in points (top, bottom, left, right).
            page_size: Page size (A4, Letter, Legal).
            orientation: Page orientation (portrait, landscape).
        """
        self.fonts_path = fonts_path
        self.images_path = images_path
        self.margins = margins or {"top": 72, "bottom": 72, "left": 72, "right": 72}
        self.page_size = page_size
        self.orientation = orientation


class PDFGenerator:
    """
    PDF report generator.

    Generates PDF documents with cover pages, table of contents,
    sections with charts and tables, and page numbers.
    """

    PAGE_SIZES = {
        "A4": A4,
        "Letter": letter,
        "Legal": legal,
    }

    def __init__(self, config: PDFGeneratorConfig | None = None):
        """
        Initialize the PDF generator.

        Args:
            config: PDF generator configuration.
        """
        self._config = config or PDFGeneratorConfig()
        self._styles = getSampleStyleSheet()
        self._setup_custom_styles()

    def _setup_custom_styles(self) -> None:
        """Setup custom paragraph styles."""
        self._styles.add(
            ParagraphStyle(
                name="ReportTitle",
                parent=self._styles["Title"],
                fontSize=32,
                spaceAfter=30,
                textColor=colors.HexColor("#333333"),
            )
        )

        self._styles.add(
            ParagraphStyle(
                name="ReportSubtitle",
                parent=self._styles["Normal"],
                fontSize=16,
                spaceAfter=20,
                textColor=colors.HexColor("#666666"),
            )
        )

        self._styles.add(
            ParagraphStyle(
                name="SectionTitle",
                parent=self._styles["Heading1"],
                fontSize=20,
                spaceBefore=20,
                spaceAfter=10,
                textColor=colors.HexColor("#333333"),
            )
        )

        self._styles.add(
            ParagraphStyle(
                name="MetricLabel",
                parent=self._styles["Normal"],
                fontSize=9,
                textColor=colors.HexColor("#666666"),
            )
        )

        self._styles.add(
            ParagraphStyle(
                name="MetricValue",
                parent=self._styles["Normal"],
                fontSize=16,
                textColor=colors.HexColor("#333333"),
            )
        )

    def _get_page_size(self) -> tuple[float, float]:
        """Get page size tuple."""
        base_size = self.PAGE_SIZES.get(self._config.page_size, A4)
        if self._config.orientation == "landscape":
            return (base_size[1], base_size[0])
        return base_size

    async def generate_pdf(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        data: ReportData,
        output_path: str | None = None,
    ) -> bytes:
        """
        Generate a PDF report.

        Args:
            metadata: Report metadata.
            config: Report configuration.
            data: Report data.
            output_path: Optional output file path.

        Returns:
            PDF content as bytes.
        """
        buffer = io.BytesIO()
        page_size = self._get_page_size()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=page_size,
            topMargin=self._config.margins["top"],
            bottomMargin=self._config.margins["bottom"],
            leftMargin=self._config.margins["left"],
            rightMargin=self._config.margins["right"],
        )

        # Build story (content)
        story: list[Any] = []

        # Apply custom styling
        styling = config.styling if config.styling else None

        # Cover page
        story.extend(self._build_cover_page(metadata, config, styling))
        story.append(PageBreak())

        # Table of contents
        story.extend(self._build_table_of_contents(config.sections))
        story.append(PageBreak())

        # Sections
        for section in config.sections:
            if section.enabled:
                story.extend(self._build_section(section, data, styling))
                story.append(PageBreak())

        # Build PDF
        doc.build(
            story,
            onFirstPage=self._add_page_number,
            onLaterPages=self._add_page_number,
        )

        pdf_content = buffer.getvalue()
        buffer.close()

        # Save to file if path provided
        if output_path:
            Path(output_path).write_bytes(pdf_content)

        return pdf_content

    def _build_cover_page(
        self,
        metadata: ReportMetadata,
        config: ReportConfig,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build cover page elements."""
        elements: list[Any] = []

        # Add spacer for top margin
        elements.append(Spacer(1, 100))

        # Logo (if available)
        if styling and styling.logo_url:
            logo_path = Path(self._config.images_path) / "logo.png"
            if logo_path.exists():
                # TODO: Add image
                pass

        # Title
        primary_color = (
            colors.HexColor(styling.colors.get("primary", "#333333"))
            if styling and styling.colors
            else colors.HexColor("#333333")
        )
        title_style = ParagraphStyle(
            name="CoverTitle",
            parent=self._styles["ReportTitle"],
            textColor=primary_color,
            alignment=1,  # Center
        )
        elements.append(Paragraph(metadata.title, title_style))

        # Description
        if metadata.description:
            elements.append(Spacer(1, 20))
            subtitle_style = ParagraphStyle(
                name="CoverSubtitle",
                parent=self._styles["ReportSubtitle"],
                alignment=1,
            )
            elements.append(Paragraph(metadata.description, subtitle_style))

        elements.append(Spacer(1, 50))

        # Report period
        period_text = (
            f"Report Period: {metadata.period_start.strftime('%Y-%m-%d')} - "
            f"{metadata.period_end.strftime('%Y-%m-%d')}"
        )
        period_style = ParagraphStyle(
            name="CoverPeriod",
            parent=self._styles["Normal"],
            fontSize=14,
            textColor=colors.HexColor("#333333"),
            alignment=1,
        )
        elements.append(Paragraph(period_text, period_style))

        elements.append(Spacer(1, 30))

        # Generation info
        gen_text = (
            f"Generated on {metadata.created_at.strftime('%Y-%m-%d %H:%M:%S')}<br/>"
            f"Created by {metadata.created_by}"
        )
        gen_style = ParagraphStyle(
            name="CoverGenInfo",
            parent=self._styles["Normal"],
            fontSize=10,
            textColor=colors.HexColor("#999999"),
            alignment=1,
        )
        elements.append(Paragraph(gen_text, gen_style))

        return elements

    def _build_table_of_contents(self, sections: list[ReportSection]) -> list[Any]:
        """Build table of contents."""
        elements: list[Any] = []

        elements.append(Paragraph("Table of Contents", self._styles["SectionTitle"]))
        elements.append(Spacer(1, 20))

        toc_style = ParagraphStyle(
            name="TOCEntry",
            parent=self._styles["Normal"],
            fontSize=12,
            textColor=colors.HexColor("#0066cc"),
            spaceBefore=5,
            spaceAfter=5,
        )

        enabled_sections = [s for s in sections if s.enabled]
        for i, section in enumerate(enabled_sections, 1):
            entry = f"{i}. {section.name}"
            elements.append(Paragraph(entry, toc_style))

        return elements

    def _build_section(
        self,
        section: ReportSection,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build a report section."""
        elements: list[Any] = []

        # Section title
        elements.append(Paragraph(section.name, self._styles["SectionTitle"]))
        elements.append(Spacer(1, 10))

        # Section content based on type
        section_builders = {
            ReportSectionType.EXECUTIVE_SUMMARY: self._build_executive_summary,
            ReportSectionType.METRICS_OVERVIEW: self._build_metrics_overview,
            ReportSectionType.ACTIVITY_TIMELINE: self._build_activity_timeline,
            ReportSectionType.DEVELOPMENT_STAGES: self._build_development_stages,
            ReportSectionType.METHODOLOGY_COMPLIANCE: self._build_methodology_compliance,
            ReportSectionType.AI_COLLABORATION: self._build_ai_collaboration,
            ReportSectionType.BOTTLENECK_ANALYSIS: self._build_bottleneck_analysis,
            ReportSectionType.PERFORMANCE_TRENDS: self._build_performance_trends,
            ReportSectionType.QUALITY_METRICS: self._build_quality_metrics,
            ReportSectionType.TEAM_PRODUCTIVITY: self._build_team_productivity,
            ReportSectionType.RECOMMENDATIONS: self._build_recommendations,
            ReportSectionType.CUSTOM: lambda d, s: self._build_custom_section(section, d, s),
        }

        builder = section_builders.get(section.type)
        if builder:
            elements.extend(builder(data, styling))

        return elements

    def _build_executive_summary(
        self,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build executive summary section."""
        elements: list[Any] = []
        summary = data.analysis.get("executive_summary", {})

        # Metrics boxes
        metrics_data = [
            ["Total Events", "Active Users", "Productivity", "Quality"],
            [
                str(summary.get("total_events", 0)),
                str(summary.get("active_users", 0)),
                f"{summary.get('productivity_score', 0):.1f}%",
                f"{summary.get('quality_score', 0):.1f}%",
            ],
        ]

        metrics_table = Table(metrics_data, colWidths=[120, 120, 120, 120])
        metrics_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f0")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#666666")),
                    ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#333333")),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 1), (-1, 1), 16),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                    ("GRID", (0, 0), (-1, -1), 1, colors.HexColor("#dddddd")),
                ]
            )
        )
        elements.append(metrics_table)
        elements.append(Spacer(1, 20))

        # Key highlights
        highlights = summary.get("key_highlights", [])
        if highlights:
            elements.append(
                Paragraph("Key Highlights", ParagraphStyle(
                    name="SubHeading",
                    parent=self._styles["Heading2"],
                    fontSize=14,
                ))
            )
            elements.append(Spacer(1, 10))

            for highlight in highlights:
                bullet_style = ParagraphStyle(
                    name="Bullet",
                    parent=self._styles["Normal"],
                    fontSize=11,
                    leftIndent=20,
                    bulletIndent=10,
                )
                elements.append(Paragraph(f"• {highlight}", bullet_style))

        return elements

    def _build_metrics_overview(
        self,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build metrics overview section."""
        elements: list[Any] = []

        # Chart placeholder
        chart = next((c for c in data.charts if c.id == "metrics-timeline"), None)
        if chart:
            elements.extend(self._build_chart_placeholder(chart))

        # Metrics table
        if data.metrics:
            elements.append(Spacer(1, 20))
            elements.extend(self._build_metrics_table(data.metrics))

        return elements

    def _build_activity_timeline(
        self,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build activity timeline section."""
        elements: list[Any] = []

        # Heatmap chart placeholder
        chart = next((c for c in data.charts if c.id == "activity-heatmap"), None)
        if chart:
            elements.extend(self._build_chart_placeholder(chart))

        # Recent activities
        if data.events:
            elements.append(Spacer(1, 20))
            elements.append(
                Paragraph("Recent Activities", self._styles["Heading2"])
            )
            elements.append(Spacer(1, 10))

            for event in data.events[:10]:
                timestamp = event.get("timestamp", "")
                category = event.get("category", "")
                description = event.get("description", "")
                text = f"{timestamp} - {category}: {description}"
                elements.append(Paragraph(text, self._styles["Normal"]))

        return elements

    def _build_development_stages(
        self,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build development stages section."""
        elements: list[Any] = []
        stages = data.analysis.get("development_stages", {})

        current_stage = stages.get("current_stage", "Unknown")
        elements.append(
            Paragraph(f"Current Stage: {current_stage}", self._styles["Heading2"])
        )

        # Stage progress chart placeholder
        chart = next((c for c in data.charts if c.id == "stage-progress"), None)
        if chart:
            elements.extend(self._build_chart_placeholder(chart))

        return elements

    def _build_methodology_compliance(
        self,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build methodology compliance section."""
        elements: list[Any] = []
        compliance = data.analysis.get("methodology_compliance", {})

        # Scores chart placeholder
        chart = next((c for c in data.charts if c.id == "methodology-scores"), None)
        if chart:
            elements.extend(self._build_chart_placeholder(chart))

        # Score details
        scores = compliance.get("scores", {})
        if scores:
            elements.append(Spacer(1, 20))
            for method, score in scores.items():
                elements.extend(self._build_progress_bar(method.upper(), score))
                elements.append(Spacer(1, 10))

        return elements

    def _build_ai_collaboration(
        self,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build AI collaboration section."""
        elements: list[Any] = []
        ai = data.analysis.get("ai_collaboration", {})

        # Usage chart placeholder
        chart = next((c for c in data.charts if c.id == "ai-usage"), None)
        if chart:
            elements.extend(self._build_chart_placeholder(chart))

        # Effectiveness metrics
        effectiveness = ai.get("effectiveness", {})
        if effectiveness:
            elements.append(Spacer(1, 20))
            elements.append(
                Paragraph("AI Effectiveness Metrics", self._styles["Heading2"])
            )
            elements.append(Spacer(1, 10))

            metrics_text = (
                f"Acceptance Rate: {effectiveness.get('acceptance_rate', 0) * 100:.1f}%\n"
                f"Modification Rate: {effectiveness.get('modification_rate', 0) * 100:.1f}%\n"
                f"Time Saved: {effectiveness.get('time_saved', 0)} hours"
            )
            elements.append(Paragraph(metrics_text, self._styles["Normal"]))

        return elements

    def _build_bottleneck_analysis(
        self,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build bottleneck analysis section."""
        elements: list[Any] = []

        # Bottleneck table
        table = next((t for t in data.tables if t.id == "bottleneck-list"), None)
        if table:
            elements.extend(self._build_data_table(table))

        return elements

    def _build_performance_trends(
        self,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build performance trends section."""
        elements: list[Any] = []
        trends = data.analysis.get("performance_trends", {})

        for metric, trend in trends.items():
            if isinstance(trend, dict):
                elements.extend(self._build_trend_indicator(metric, trend))
                elements.append(Spacer(1, 10))

        return elements

    def _build_quality_metrics(
        self,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build quality metrics section."""
        elements: list[Any] = []

        # Quality trends chart placeholder
        chart = next((c for c in data.charts if c.id == "quality-trends"), None)
        if chart:
            elements.extend(self._build_chart_placeholder(chart))

        # Quality metrics
        quality = data.analysis.get("quality_metrics", {})
        if quality:
            elements.append(Spacer(1, 20))
            for metric, value in quality.items():
                if isinstance(value, (int, float)):
                    text = f"{metric.replace('_', ' ').title()}: {value:.2f}"
                    elements.append(Paragraph(text, self._styles["Normal"]))

        return elements

    def _build_team_productivity(
        self,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build team productivity section."""
        elements: list[Any] = []
        productivity = data.analysis.get("team_productivity", {})

        for metric, value in productivity.items():
            if isinstance(value, (int, float)):
                elements.extend(
                    self._build_metric_box(metric.replace("_", " ").title(), f"{value:.2f}")
                )
                elements.append(Spacer(1, 10))

        return elements

    def _build_recommendations(
        self,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build recommendations section."""
        elements: list[Any] = []
        recommendations = data.analysis.get("recommendations", [])

        if not recommendations:
            elements.append(Paragraph("No recommendations at this time.", self._styles["Normal"]))
            return elements

        for i, rec in enumerate(recommendations, 1):
            bullet_style = ParagraphStyle(
                name="RecBullet",
                parent=self._styles["Normal"],
                fontSize=10,
                leftIndent=20,
                spaceBefore=5,
                spaceAfter=5,
            )
            elements.append(Paragraph(f"{i}. {rec}", bullet_style))

        return elements

    def _build_custom_section(
        self,
        section: ReportSection,
        data: ReportData,
        styling: ReportStyling | None,
    ) -> list[Any]:
        """Build custom section."""
        elements: list[Any] = []
        custom_data = data.custom.get(section.id)

        if custom_data:
            import json
            text = json.dumps(custom_data, indent=2, default=str)
            code_style = ParagraphStyle(
                name="Code",
                parent=self._styles["Normal"],
                fontName="Courier",
                fontSize=8,
            )
            elements.append(Paragraph(f"<pre>{text}</pre>", code_style))

        return elements

    def _build_chart_placeholder(self, chart: ChartData) -> list[Any]:
        """Build a placeholder for a chart."""
        elements: list[Any] = []

        # Create a placeholder table for the chart
        placeholder_data = [
            [chart.title],
            [f"Chart Type: {chart.type}"],
            ["(Chart rendering requires additional visualization library)"],
        ]

        placeholder_table = Table(placeholder_data, colWidths=[400])
        placeholder_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f9f9f9")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#333333")),
                    ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#999999")),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 12),
                    ("FONTSIZE", (0, 1), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 20),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 20),
                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#dddddd")),
                ]
            )
        )
        elements.append(placeholder_table)

        return elements

    def _build_data_table(self, table_data: TableData) -> list[Any]:
        """Build a data table."""
        elements: list[Any] = []

        elements.append(Paragraph(table_data.title, self._styles["Heading2"]))
        elements.append(Spacer(1, 10))

        # Build table data
        headers = [col["title"] for col in table_data.columns]
        rows = [[row.get(col["key"], "") for col in table_data.columns] for row in table_data.rows[:10]]

        data = [headers] + rows

        col_widths = [100] * len(headers)
        table = Table(data, colWidths=col_widths)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f0f0f0")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#333333")),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 10),
                    ("FONTSIZE", (0, 1), (-1, -1), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
                ]
            )
        )
        elements.append(table)

        return elements

    def _build_metrics_table(self, metrics: dict[str, Any]) -> list[Any]:
        """Build a table of metrics."""
        elements: list[Any] = []

        # Filter only numeric values
        numeric_metrics = {
            k: v for k, v in metrics.items()
            if isinstance(v, (int, float, str))
        }

        if not numeric_metrics:
            return elements

        data = [[k.replace("_", " ").title(), str(v)] for k, v in list(numeric_metrics.items())[:20]]
        table = Table(data, colWidths=[200, 200])
        table.setStyle(
            TableStyle(
                [
                    ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#666666")),
                    ("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#333333")),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("LINEBELOW", (0, 0), (-1, -2), 0.5, colors.HexColor("#eeeeee")),
                ]
            )
        )
        elements.append(table)

        return elements

    def _build_progress_bar(self, label: str, value: float) -> list[Any]:
        """Build a progress bar representation."""
        elements: list[Any] = []

        text = f"{label}: {value}%"
        elements.append(Paragraph(text, self._styles["Normal"]))

        # Create a simple progress bar using a table
        bar_width = 200
        filled_width = int(bar_width * value / 100)
        empty_width = bar_width - filled_width

        bar_data = [["", ""]]
        bar_table = Table(bar_data, colWidths=[filled_width or 1, empty_width or 1])
        bar_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#4CAF50")),
                    ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#f0f0f0")),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        elements.append(bar_table)

        return elements

    def _build_trend_indicator(self, label: str, trend: dict[str, Any]) -> list[Any]:
        """Build a trend indicator."""
        elements: list[Any] = []

        value = trend.get("value", 0)
        change = trend.get("change", 0)
        trend_dir = trend.get("trend", "stable")

        arrow = "→" if trend_dir == "stable" else ("↑" if change > 0 else "↓")
        color = "#4CAF50" if change > 0 else ("#f44336" if change < 0 else "#666666")

        text = f"{label.replace('_', ' ').title()}: {value} {arrow} {abs(change)}%"
        style = ParagraphStyle(
            name="TrendText",
            parent=self._styles["Normal"],
            textColor=colors.HexColor(color),
        )
        elements.append(Paragraph(text, style))

        return elements

    def _build_metric_box(self, label: str, value: str) -> list[Any]:
        """Build a metric box."""
        elements: list[Any] = []

        data = [[label], [value]]
        table = Table(data, colWidths=[120])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0f0f0")),
                    ("TEXTCOLOR", (0, 0), (0, 0), colors.HexColor("#666666")),
                    ("TEXTCOLOR", (0, 1), (0, 1), colors.HexColor("#333333")),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("FONTSIZE", (0, 0), (0, 0), 9),
                    ("FONTSIZE", (0, 1), (0, 1), 16),
                    ("FONTNAME", (0, 1), (0, 1), "Helvetica-Bold"),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                    ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#dddddd")),
                ]
            )
        )
        elements.append(table)

        return elements

    def _add_page_number(self, canvas_obj: canvas.Canvas, doc: SimpleDocTemplate) -> None:
        """Add page number to the canvas."""
        page_num = canvas_obj.getPageNumber()

        # Skip page number on cover page
        if page_num <= 1:
            return

        canvas_obj.saveState()
        canvas_obj.setFont("Helvetica", 9)
        canvas_obj.setFillColor(colors.HexColor("#999999"))

        page_size = self._get_page_size()
        text = f"Page {page_num - 1}"
        canvas_obj.drawCentredString(page_size[0] / 2, 30, text)

        canvas_obj.restoreState()


# Singleton instance
_pdf_generator: PDFGenerator | None = None


def get_pdf_generator() -> PDFGenerator:
    """Get the singleton PDF generator instance."""
    global _pdf_generator
    if _pdf_generator is None:
        _pdf_generator = PDFGenerator()
    return _pdf_generator
