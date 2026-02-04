"""
Cross-Project Analyzer for DevFlow Monitor.

Provides analysis capabilities across multiple projects including
similarity detection, dependency analysis, performance comparison,
quality metrics, trend analysis, bottleneck detection, and
collaboration pattern analysis.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from ..utils.logger import Logger

from .types import (
    AnalysisResult,
    AnalysisType,
    CrossProjectAnalysis,
    DependencyType,
    Insight,
    ProjectMetadata,
    ProjectMetrics,
    ProjectPriority,
    Recommendation,
    ActionItem,
    CrossAnalyzerConfig,
)


@dataclass
class AnalysisContext:
    """Analysis context for tracking running analysis."""

    id: str
    projects: list[ProjectMetadata]
    metrics: dict[str, list[ProjectMetrics]]
    type: AnalysisType
    start_time: datetime
    config: CrossAnalyzerConfig


class CrossProjectAnalyzer:
    """
    Cross-Project Analyzer.

    Performs various types of analysis across multiple projects to identify
    patterns, dependencies, performance issues, and collaboration opportunities.

    Example:
        config = CrossAnalyzerConfig(min_confidence=0.7)
        analyzer = CrossProjectAnalyzer(config)

        analysis = await analyzer.analyze(
            projects=project_list,
            metrics=metrics_map,
            analysis_type=AnalysisType.SIMILARITY
        )
    """

    def __init__(self, config: CrossAnalyzerConfig | None = None) -> None:
        """
        Initialize cross-project analyzer.

        Args:
            config: Analyzer configuration.
        """
        self._config = config or CrossAnalyzerConfig()
        self._logger = Logger("CrossProjectAnalyzer")
        self._running_analysis: dict[str, AnalysisContext] = {}

        self._logger.info(
            f"Cross-project analyzer initialized with min_confidence={self._config.min_confidence}"
        )

    async def analyze(
        self,
        projects: list[ProjectMetadata],
        metrics: dict[str, list[ProjectMetrics]],
        analysis_type: AnalysisType,
    ) -> CrossProjectAnalysis:
        """
        Run cross-project analysis.

        Args:
            projects: List of projects to analyze.
            metrics: Dictionary of project metrics keyed by project ID.
            analysis_type: Type of analysis to perform.

        Returns:
            Analysis results.

        Raises:
            RuntimeError: If max concurrent analysis exceeded.
        """
        if len(self._running_analysis) >= self._config.max_concurrent_analysis:
            raise RuntimeError("Maximum concurrent analysis exceeded")

        analysis_id = str(uuid4())
        context = AnalysisContext(
            id=analysis_id,
            projects=projects,
            metrics=metrics,
            type=analysis_type,
            start_time=datetime.utcnow(),
            config=self._config,
        )

        self._running_analysis[analysis_id] = context

        try:
            self._logger.info(
                f"Starting analysis {analysis_id} of type {analysis_type.value} "
                f"with {len(projects)} projects"
            )

            analysis = CrossProjectAnalysis(
                id=analysis_id,
                timestamp=datetime.utcnow(),
                projects=[p.id for p in projects],
                type=analysis_type,
                results=[],
                insights=[],
                recommendations=[],
            )

            # Run analysis based on type
            if analysis_type == AnalysisType.SIMILARITY:
                analysis.results = await self._analyze_similarity(context)
            elif analysis_type == AnalysisType.DEPENDENCY:
                analysis.results = await self._analyze_dependencies(context)
            elif analysis_type == AnalysisType.PERFORMANCE:
                analysis.results = await self._analyze_performance(context)
            elif analysis_type == AnalysisType.QUALITY:
                analysis.results = await self._analyze_quality(context)
            elif analysis_type == AnalysisType.TREND:
                analysis.results = await self._analyze_trends(context)
            elif analysis_type == AnalysisType.BOTTLENECK:
                analysis.results = await self._analyze_bottlenecks(context)
            elif analysis_type == AnalysisType.COLLABORATION:
                analysis.results = await self._analyze_collaboration(context)
            else:
                raise ValueError(f"Unsupported analysis type: {analysis_type}")

            # Generate insights
            analysis.insights = self._generate_insights(analysis.results, context)

            # Generate recommendations
            analysis.recommendations = self._generate_recommendations(
                analysis.results, analysis.insights, context
            )

            duration = (datetime.utcnow() - context.start_time).total_seconds() * 1000
            self._logger.info(
                f"Analysis {analysis_id} completed in {duration:.2f}ms with "
                f"{len(analysis.results)} results, {len(analysis.insights)} insights, "
                f"{len(analysis.recommendations)} recommendations"
            )

            return analysis

        except Exception as e:
            self._logger.error(f"Analysis {analysis_id} failed: {e}")
            raise
        finally:
            del self._running_analysis[analysis_id]

    async def _analyze_similarity(
        self, context: AnalysisContext
    ) -> list[AnalysisResult]:
        """Analyze similarity between projects."""
        results: list[AnalysisResult] = []
        projects = context.projects

        # Compare each project pair
        for i in range(len(projects)):
            for j in range(i + 1, len(projects)):
                project1 = projects[i]
                project2 = projects[j]

                similarity = await self._calculate_project_similarity(
                    project1, project2, context
                )

                if similarity["score"] >= self._config.min_confidence:
                    results.append(
                        AnalysisResult(
                            type="similarity",
                            score=similarity["score"],
                            confidence=similarity["confidence"],
                            data={
                                "project1_id": project1.id,
                                "project1_name": project1.name,
                                "project2_id": project2.id,
                                "project2_name": project2.name,
                                "details": similarity["details"],
                            },
                            description=(
                                f"{project1.name} and {project2.name} similarity: "
                                f"{round(similarity['score'] * 100)}%"
                            ),
                        )
                    )

        return results

    async def _calculate_project_similarity(
        self,
        project1: ProjectMetadata,
        project2: ProjectMetadata,
        context: AnalysisContext,
    ) -> dict[str, Any]:
        """Calculate similarity between two projects."""
        weights = self._config.similarity_weights
        total_score = 0.0
        total_weight = 0.0
        details: dict[str, float] = {}

        # Tech stack similarity
        tech_stack_sim = self._calculate_tech_stack_similarity(project1, project2)
        total_score += tech_stack_sim * weights.get("tech_stack", 0.3)
        total_weight += weights.get("tech_stack", 0.3)
        details["tech_stack"] = tech_stack_sim

        # Project structure similarity
        structure_sim = self._calculate_structure_similarity(project1, project2)
        total_score += structure_sim * weights.get("project_structure", 0.2)
        total_weight += weights.get("project_structure", 0.2)
        details["structure"] = structure_sim

        # Code style similarity
        code_style_sim = await self._calculate_code_style_similarity(
            project1, project2
        )
        if code_style_sim >= 0:
            total_score += code_style_sim * weights.get("code_style", 0.2)
            total_weight += weights.get("code_style", 0.2)
            details["code_style"] = code_style_sim

        # Dependency similarity
        dep_sim = await self._calculate_dependency_similarity(project1, project2)
        if dep_sim >= 0:
            total_score += dep_sim * weights.get("dependencies", 0.2)
            total_weight += weights.get("dependencies", 0.2)
            details["dependencies"] = dep_sim

        # Team similarity
        team_sim = self._calculate_team_similarity(project1, project2)
        total_score += team_sim * weights.get("team_members", 0.1)
        total_weight += weights.get("team_members", 0.1)
        details["team"] = team_sim

        final_score = total_score / total_weight if total_weight > 0 else 0
        confidence = total_weight / sum(weights.values())

        return {
            "score": final_score,
            "confidence": confidence,
            "details": details,
        }

    def _calculate_tech_stack_similarity(
        self, project1: ProjectMetadata, project2: ProjectMetadata
    ) -> float:
        """Calculate tech stack similarity."""
        type1 = project1.type.value if hasattr(project1.type, "value") else project1.type
        type2 = project2.type.value if hasattr(project2.type, "value") else project2.type

        if type1 == type2:
            return 0.8

        related_types = {
            "web_application": ["api_service", "microservice"],
            "mobile_application": ["web_application"],
            "api_service": ["web_application", "microservice"],
            "microservice": ["api_service"],
            "library": ["cli_tool"],
            "cli_tool": ["library"],
        }

        related = related_types.get(type1, [])
        if type2 in related:
            return 0.6

        return 0.2

    def _calculate_structure_similarity(
        self, project1: ProjectMetadata, project2: ProjectMetadata
    ) -> float:
        """Calculate project structure similarity."""
        paths1 = project1.paths
        paths2 = project2.paths

        structure_keys = ["source", "test", "docs", "build", "config"]
        common_count = 0

        for key in structure_keys:
            p1_has = bool(getattr(paths1, key, None))
            p2_has = bool(getattr(paths2, key, None))
            if p1_has and p2_has:
                common_count += 1

        return common_count / len(structure_keys)

    async def _calculate_code_style_similarity(
        self, project1: ProjectMetadata, project2: ProjectMetadata
    ) -> float:
        """Calculate code style similarity based on config files."""
        try:
            config_files = [
                ".eslintrc.json",
                ".prettierrc",
                "tsconfig.json",
                ".editorconfig",
                "pyproject.toml",
                "setup.cfg",
            ]

            similarity = 0.0
            file_count = 0

            for config_file in config_files:
                path1 = Path(project1.paths.root) / config_file
                path2 = Path(project2.paths.root) / config_file

                if path1.exists() and path2.exists():
                    config1 = self._parse_config_file(str(path1))
                    config2 = self._parse_config_file(str(path2))

                    if config1 and config2:
                        similarity += self._compare_configs(config1, config2)
                        file_count += 1

            return similarity / file_count if file_count > 0 else -1
        except Exception:
            return -1

    def _parse_config_file(self, file_path: str) -> dict[str, Any] | None:
        """Parse a configuration file."""
        try:
            with open(file_path, "r") as f:
                content = f.read()
                return json.loads(content)
        except (json.JSONDecodeError, OSError):
            return None

    def _compare_configs(
        self, config1: dict[str, Any], config2: dict[str, Any]
    ) -> float:
        """Compare two configuration dictionaries."""
        keys1 = set(config1.keys())
        keys2 = set(config2.keys())

        common_keys = keys1 & keys2
        all_keys = keys1 | keys2

        return len(common_keys) / len(all_keys) if all_keys else 0

    async def _calculate_dependency_similarity(
        self, project1: ProjectMetadata, project2: ProjectMetadata
    ) -> float:
        """Calculate dependency similarity."""
        try:
            deps1 = await self._extract_dependencies(project1)
            deps2 = await self._extract_dependencies(project2)

            if not deps1 or not deps2:
                return -1

            set1 = set(deps1)
            set2 = set(deps2)

            intersection = set1 & set2
            union = set1 | set2

            return len(intersection) / len(union) if union else 0
        except Exception:
            return -1

    async def _extract_dependencies(
        self, project: ProjectMetadata
    ) -> list[str]:
        """Extract project dependencies."""
        deps: list[str] = []

        # Check package.json
        package_json_path = Path(project.paths.root) / "package.json"
        if package_json_path.exists():
            try:
                with open(package_json_path) as f:
                    pkg = json.load(f)
                    deps.extend(pkg.get("dependencies", {}).keys())
                    deps.extend(pkg.get("devDependencies", {}).keys())
                    deps.extend(pkg.get("peerDependencies", {}).keys())
            except (json.JSONDecodeError, OSError):
                pass

        # Check requirements.txt
        requirements_path = Path(project.paths.root) / "requirements.txt"
        if requirements_path.exists():
            try:
                with open(requirements_path) as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#"):
                            # Extract package name
                            pkg_name = line.split("==")[0].split(">=")[0].split("<=")[0]
                            deps.append(pkg_name.strip())
            except OSError:
                pass

        return deps

    def _calculate_team_similarity(
        self, project1: ProjectMetadata, project2: ProjectMetadata
    ) -> float:
        """Calculate team similarity."""
        # Same owner
        if project1.owner.user_id == project2.owner.user_id:
            return 1.0

        # Same team
        if (
            project1.owner.team_id
            and project1.owner.team_id == project2.owner.team_id
        ):
            return 0.8

        return 0.1

    async def _analyze_dependencies(
        self, context: AnalysisContext
    ) -> list[AnalysisResult]:
        """Analyze dependencies between projects."""
        results: list[AnalysisResult] = []
        projects = context.projects

        for i, source in enumerate(projects):
            for j, target in enumerate(projects):
                if i == j:
                    continue

                dependencies = await self._detect_project_dependencies(source, target)

                for dep in dependencies:
                    results.append(
                        AnalysisResult(
                            type="dependency",
                            score=dep["strength"],
                            confidence=0.8,
                            data={
                                "source_id": source.id,
                                "source_name": source.name,
                                "target_id": target.id,
                                "target_name": target.name,
                                "dependency_type": dep["type"],
                                "description": dep["description"],
                            },
                            description=f"{source.name} -> {target.name}: {dep['description']}",
                        )
                    )

        return results

    async def _detect_project_dependencies(
        self, source: ProjectMetadata, target: ProjectMetadata
    ) -> list[dict[str, Any]]:
        """Detect dependencies between two projects."""
        dependencies: list[dict[str, Any]] = []

        # Check direct dependency
        source_deps = await self._extract_dependencies(source)
        if target.name in source_deps:
            dependencies.append(
                {
                    "type": DependencyType.DIRECT.value,
                    "strength": 0.9,
                    "description": f"{source.name} directly depends on {target.name}",
                }
            )

        # Check shared resources
        if self._has_shared_resources(source, target):
            dependencies.append(
                {
                    "type": DependencyType.SHARED_RESOURCE.value,
                    "strength": 0.7,
                    "description": f"{source.name} and {target.name} share resources",
                }
            )

        # Check team dependency
        if (
            source.owner.team_id
            and source.owner.team_id == target.owner.team_id
        ):
            dependencies.append(
                {
                    "type": DependencyType.TEAM_DEPENDENCY.value,
                    "strength": 0.5,
                    "description": f"{source.name} and {target.name} are managed by the same team",
                }
            )

        return dependencies

    def _has_shared_resources(
        self, project1: ProjectMetadata, project2: ProjectMetadata
    ) -> bool:
        """Check if projects share resources."""
        type1 = project1.type.value if hasattr(project1.type, "value") else project1.type
        type2 = project2.type.value if hasattr(project2.type, "value") else project2.type
        return type1 == "api_service" and type2 == "api_service"

    async def _analyze_performance(
        self, context: AnalysisContext
    ) -> list[AnalysisResult]:
        """Analyze performance across projects."""
        results: list[AnalysisResult] = []
        thresholds = self._config.performance_thresholds

        for project in context.projects:
            project_metrics = context.metrics.get(project.id, [])
            if not project_metrics:
                continue

            latest = project_metrics[-1] if project_metrics else None
            if not latest or not latest.performance:
                continue

            perf = latest.performance

            # Build time check
            if perf.build_time > thresholds.get("build_time", 300):
                ratio = perf.build_time / thresholds.get("build_time", 300)
                results.append(
                    AnalysisResult(
                        type="performance_issue",
                        score=min(ratio, 2.0),
                        confidence=0.9,
                        data={
                            "project_id": project.id,
                            "project_name": project.name,
                            "metric": "build_time",
                            "value": perf.build_time,
                            "threshold": thresholds.get("build_time", 300),
                        },
                        description=(
                            f"{project.name} build time exceeds threshold "
                            f"({perf.build_time}s)"
                        ),
                    )
                )

            # Test time check
            if perf.test_time > thresholds.get("test_time", 120):
                ratio = perf.test_time / thresholds.get("test_time", 120)
                results.append(
                    AnalysisResult(
                        type="performance_issue",
                        score=min(ratio, 2.0),
                        confidence=0.9,
                        data={
                            "project_id": project.id,
                            "project_name": project.name,
                            "metric": "test_time",
                            "value": perf.test_time,
                            "threshold": thresholds.get("test_time", 120),
                        },
                        description=(
                            f"{project.name} test time exceeds threshold "
                            f"({perf.test_time}s)"
                        ),
                    )
                )

        return results

    async def _analyze_quality(
        self, context: AnalysisContext
    ) -> list[AnalysisResult]:
        """Analyze quality across projects."""
        results: list[AnalysisResult] = []
        thresholds = self._config.performance_thresholds

        for project in context.projects:
            project_metrics = context.metrics.get(project.id, [])
            if not project_metrics:
                continue

            latest = project_metrics[-1] if project_metrics else None
            if not latest or not latest.quality:
                continue

            quality = latest.quality

            # Code quality check
            quality_threshold = thresholds.get("code_quality", 80)
            if quality.code_quality < quality_threshold:
                score = (quality_threshold - quality.code_quality) / 100
                results.append(
                    AnalysisResult(
                        type="quality_issue",
                        score=score,
                        confidence=0.8,
                        data={
                            "project_id": project.id,
                            "project_name": project.name,
                            "metric": "code_quality",
                            "value": quality.code_quality,
                            "threshold": quality_threshold,
                        },
                        description=(
                            f"{project.name} code quality below standard "
                            f"({quality.code_quality}/100)"
                        ),
                    )
                )

            # Test coverage check
            coverage_threshold = thresholds.get("test_coverage", 80)
            if quality.test_coverage < coverage_threshold:
                score = (coverage_threshold - quality.test_coverage) / 100
                results.append(
                    AnalysisResult(
                        type="quality_issue",
                        score=score,
                        confidence=0.9,
                        data={
                            "project_id": project.id,
                            "project_name": project.name,
                            "metric": "test_coverage",
                            "value": quality.test_coverage,
                            "threshold": coverage_threshold,
                        },
                        description=(
                            f"{project.name} test coverage below standard "
                            f"({quality.test_coverage}%)"
                        ),
                    )
                )

        return results

    async def _analyze_trends(
        self, context: AnalysisContext
    ) -> list[AnalysisResult]:
        """Analyze trends across projects."""
        results: list[AnalysisResult] = []

        for project in context.projects:
            project_metrics = context.metrics.get(project.id, [])
            if len(project_metrics) < 2:
                continue

            trend = self._calculate_metrics_trend(project_metrics)

            results.append(
                AnalysisResult(
                    type="trend",
                    score=abs(trend["slope"]),
                    confidence=trend["confidence"],
                    data={
                        "project_id": project.id,
                        "project_name": project.name,
                        "trend": trend["direction"],
                        "slope": trend["slope"],
                        "metrics": trend["key_metrics"],
                    },
                    description=f"{project.name} overall trend: {trend['direction']}",
                )
            )

        return results

    def _calculate_metrics_trend(
        self, metrics: list[ProjectMetrics]
    ) -> dict[str, Any]:
        """Calculate metrics trend."""
        recent = metrics[-5:]  # Last 5 data points

        if len(recent) < 2:
            return {
                "direction": "stable",
                "slope": 0.0,
                "confidence": 0.0,
                "key_metrics": {},
            }

        first = recent[0]
        last = recent[-1]

        if not first.quality or not last.quality:
            return {
                "direction": "stable",
                "slope": 0.0,
                "confidence": 0.5,
                "key_metrics": {},
            }

        # Calculate changes
        quality_change = (last.quality.code_quality - first.quality.code_quality) * 0.4
        performance_change = 0.0
        if first.performance and last.performance:
            performance_change = -(last.performance.build_time - first.performance.build_time) * 0.3
        coverage_change = (last.quality.test_coverage - first.quality.test_coverage) * 0.3

        total_change = quality_change + performance_change + coverage_change

        if total_change > 5:
            direction = "improving"
        elif total_change < -5:
            direction = "declining"
        else:
            direction = "stable"

        return {
            "direction": direction,
            "slope": total_change,
            "confidence": 0.7,
            "key_metrics": {
                "quality_change": quality_change,
                "performance_change": performance_change,
                "coverage_change": coverage_change,
            },
        }

    async def _analyze_bottlenecks(
        self, context: AnalysisContext
    ) -> list[AnalysisResult]:
        """Analyze bottlenecks across projects."""
        results: list[AnalysisResult] = []

        # Gather all metrics
        all_metrics = []
        for metrics_list in context.metrics.values():
            all_metrics.extend(metrics_list)

        if not all_metrics:
            return results

        # Calculate averages
        valid_metrics = [m for m in all_metrics if m.performance]
        if not valid_metrics:
            return results

        avg_build_time = sum(m.performance.build_time for m in valid_metrics) / len(valid_metrics)
        avg_test_time = sum(m.performance.test_time for m in valid_metrics) / len(valid_metrics)

        # Check each project
        for project in context.projects:
            project_metrics = context.metrics.get(project.id, [])
            if not project_metrics:
                continue

            latest = project_metrics[-1]
            if not latest or not latest.performance:
                continue

            perf = latest.performance

            # Build time bottleneck
            if perf.build_time > avg_build_time * 1.5 and avg_build_time > 0:
                ratio = perf.build_time / avg_build_time
                results.append(
                    AnalysisResult(
                        type="bottleneck",
                        score=ratio,
                        confidence=0.8,
                        data={
                            "project_id": project.id,
                            "project_name": project.name,
                            "bottleneck_type": "build",
                            "value": perf.build_time,
                            "average": avg_build_time,
                        },
                        description=(
                            f"{project.name} build time is "
                            f"{round((ratio - 1) * 100)}% slower than average"
                        ),
                    )
                )

            # Test time bottleneck
            if perf.test_time > avg_test_time * 1.5 and avg_test_time > 0:
                ratio = perf.test_time / avg_test_time
                results.append(
                    AnalysisResult(
                        type="bottleneck",
                        score=ratio,
                        confidence=0.8,
                        data={
                            "project_id": project.id,
                            "project_name": project.name,
                            "bottleneck_type": "test",
                            "value": perf.test_time,
                            "average": avg_test_time,
                        },
                        description=(
                            f"{project.name} test time is "
                            f"{round((ratio - 1) * 100)}% slower than average"
                        ),
                    )
                )

        return results

    async def _analyze_collaboration(
        self, context: AnalysisContext
    ) -> list[AnalysisResult]:
        """Analyze collaboration patterns across projects."""
        results: list[AnalysisResult] = []

        for project in context.projects:
            project_metrics = context.metrics.get(project.id, [])
            if not project_metrics:
                continue

            latest = project_metrics[-1]
            if not latest:
                continue

            team = latest.team

            results.append(
                AnalysisResult(
                    type="collaboration",
                    score=team.collaboration_score if team else 0,
                    confidence=0.7,
                    data={
                        "project_id": project.id,
                        "project_name": project.name,
                        "active_developers": team.active_developers if team else 0,
                        "code_review_rate": team.code_review_rate if team else 0,
                        "avg_commit_size": team.avg_commit_size if team else 0,
                    },
                    description=(
                        f"{project.name} collaboration score: "
                        f"{round((team.collaboration_score if team else 0) * 100)}/100"
                    ),
                )
            )

        return results

    def _generate_insights(
        self, results: list[AnalysisResult], context: AnalysisContext
    ) -> list[Insight]:
        """Generate insights from analysis results."""
        insights: list[Insight] = []

        # Group results by type
        results_by_type: dict[str, list[AnalysisResult]] = {}
        for result in results:
            if result.type not in results_by_type:
                results_by_type[result.type] = []
            results_by_type[result.type].append(result)

        # Generate insight for each type
        for result_type, type_results in results_by_type.items():
            insight = self._generate_insight_for_type(result_type, type_results, context)
            if insight:
                insights.append(insight)

        return insights

    def _generate_insight_for_type(
        self,
        result_type: str,
        results: list[AnalysisResult],
        context: AnalysisContext,
    ) -> Insight | None:
        """Generate insight for a specific result type."""
        if not results:
            return None

        avg_score = sum(r.score for r in results) / len(results)

        insight_configs = {
            "similarity": {
                "title": "Project Similarity Patterns",
                "description": (
                    f"Found {len(results)} project similarity patterns. "
                    f"Average similarity: {round(avg_score * 100)}%"
                ),
                "category": "architecture",
            },
            "performance_issue": {
                "title": "Performance Issues Detected",
                "description": f"Found performance issues in {len(results)} projects.",
                "category": "performance",
            },
            "quality_issue": {
                "title": "Code Quality Issues",
                "description": f"Found quality issues in {len(results)} projects.",
                "category": "quality",
            },
            "bottleneck": {
                "title": "Bottlenecks Detected",
                "description": f"Found bottlenecks in {len(results)} projects.",
                "category": "performance",
            },
        }

        config = insight_configs.get(result_type, {
            "title": f"{result_type} Analysis Results",
            "description": f"Found {len(results)} {result_type} related results.",
            "category": "general",
        })

        # Determine importance
        if len(results) > 2:
            importance = "high" if result_type in ("performance_issue", "bottleneck") else "medium"
        else:
            importance = "medium" if result_type in ("performance_issue", "quality_issue") else "low"

        return Insight(
            id=str(uuid4()),
            title=config["title"],
            description=config["description"],
            importance=importance,
            category=config["category"],
            data={"type": result_type, "result_count": len(results), "avg_score": avg_score},
        )

    def _generate_recommendations(
        self,
        results: list[AnalysisResult],
        insights: list[Insight],
        context: AnalysisContext,
    ) -> list[Recommendation]:
        """Generate recommendations from insights."""
        recommendations: list[Recommendation] = []

        for insight in insights:
            recommendation = self._generate_recommendation_for_insight(
                insight, results, context
            )
            if recommendation:
                recommendations.append(recommendation)

        return recommendations

    def _generate_recommendation_for_insight(
        self,
        insight: Insight,
        results: list[AnalysisResult],
        context: AnalysisContext,
    ) -> Recommendation | None:
        """Generate recommendation for a specific insight."""
        related_results = [r for r in results if r.type == insight.data.get("type")]
        affected_projects = list(
            set(r.data.get("project_id") for r in related_results if r.data.get("project_id"))
        )

        recommendation_configs = {
            "performance": {
                "title": "Performance Optimization Needed",
                "description": "Optimize performance for projects with detected issues.",
                "impact": "high",
                "effort": "medium",
                "actions": [
                    {
                        "title": "Optimize Build Process",
                        "description": "Review and optimize build configuration.",
                    },
                    {
                        "title": "Improve Test Performance",
                        "description": "Optimize test execution time.",
                    },
                ],
            },
            "quality": {
                "title": "Code Quality Improvement Needed",
                "description": "Improve code quality for projects below standards.",
                "impact": "medium",
                "effort": "medium",
                "actions": [
                    {
                        "title": "Strengthen Code Review Process",
                        "description": "Improve code review rate and quality standards.",
                    },
                    {
                        "title": "Increase Test Coverage",
                        "description": "Improve test coverage to 80% or higher.",
                    },
                ],
            },
            "architecture": {
                "title": "Consider Architecture Standardization",
                "description": "Standardize architecture across similar projects.",
                "impact": "high",
                "effort": "high",
                "actions": [
                    {
                        "title": "Build Common Component Library",
                        "description": "Extract common functionality to shared library.",
                    },
                    {
                        "title": "Create Standard Project Template",
                        "description": "Develop standard templates for new projects.",
                    },
                ],
            },
        }

        config = recommendation_configs.get(insight.category)
        if not config:
            return None

        importance_priority_map = {
            "critical": ProjectPriority.CRITICAL,
            "high": ProjectPriority.HIGH,
            "medium": ProjectPriority.MEDIUM,
            "low": ProjectPriority.LOW,
        }

        return Recommendation(
            id=str(uuid4()),
            title=config["title"],
            description=config["description"],
            priority=importance_priority_map.get(insight.importance, ProjectPriority.MEDIUM),
            impact=config["impact"],
            effort=config["effort"],
            affected_projects=affected_projects,
            actions=[
                ActionItem(
                    id=str(uuid4()),
                    title=action["title"],
                    description=action["description"],
                    completed=False,
                )
                for action in config["actions"]
            ],
        )

    def get_running_analysis(self) -> list[dict[str, Any]]:
        """Get list of running analysis."""
        return [
            {
                "id": ctx.id,
                "type": ctx.type.value,
                "start_time": ctx.start_time.isoformat(),
                "project_count": len(ctx.projects),
            }
            for ctx in self._running_analysis.values()
        ]

    async def cancel_analysis(self, analysis_id: str) -> bool:
        """
        Cancel a running analysis.

        Args:
            analysis_id: Analysis ID to cancel.

        Returns:
            True if cancelled, False if not found.
        """
        if analysis_id in self._running_analysis:
            del self._running_analysis[analysis_id]
            self._logger.info(f"Analysis cancelled: {analysis_id}")
            return True
        return False
