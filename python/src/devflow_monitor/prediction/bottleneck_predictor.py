"""
Bottleneck Prediction System.

Predicts potential bottlenecks before they occur based on
indicator analysis and historical patterns.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from ..analyzers.metrics_collector import MetricsCollector, get_metrics_collector
from ..events.engine import EventEngine, get_event_engine
from ..events.types.base import BaseEvent
from .pattern_recognizer import PatternRecognizer, get_pattern_recognizer
from .types import (
    BottleneckIndicator,
    BottleneckPrediction,
    BottleneckType,
    PredictionResult,
)


class BottleneckPredictor:
    """
    Bottleneck prediction system.

    Predicts potential bottlenecks before they occur by analyzing
    various indicators and historical patterns.
    """

    def __init__(
        self,
        metrics_collector: MetricsCollector | None = None,
        pattern_recognizer: PatternRecognizer | None = None,
        event_engine: EventEngine | None = None,
    ):
        """
        Initialize the bottleneck predictor.

        Args:
            metrics_collector: Optional metrics collector instance.
            pattern_recognizer: Optional pattern recognizer instance.
            event_engine: Optional event engine instance.
        """
        self._metrics_collector = metrics_collector or get_metrics_collector()
        self._pattern_recognizer = pattern_recognizer or get_pattern_recognizer()
        self._event_engine = event_engine or get_event_engine()

        self._indicators: dict[str, BottleneckIndicator] = {}
        self._prediction_history: list[BottleneckPrediction] = []
        self._is_running = False
        self._listeners: dict[str, list[Callable]] = {}

        self._initialize_indicators()

    def _initialize_indicators(self) -> None:
        """Initialize bottleneck indicators."""
        # Technical debt indicators
        self._add_indicator(BottleneckIndicator(
            type=BottleneckType.TECHNICAL_DEBT,
            indicator="code_complexity_trend",
            weight=0.8,
            threshold=0.3,
            current_value=0.0,
        ))
        self._add_indicator(BottleneckIndicator(
            type=BottleneckType.TECHNICAL_DEBT,
            indicator="test_coverage_decline",
            weight=0.7,
            threshold=-0.1,
            current_value=0.0,
        ))
        self._add_indicator(BottleneckIndicator(
            type=BottleneckType.TECHNICAL_DEBT,
            indicator="bug_rate_increase",
            weight=0.9,
            threshold=0.5,
            current_value=0.0,
        ))

        # Resource constraint indicators
        self._add_indicator(BottleneckIndicator(
            type=BottleneckType.RESOURCE_CONSTRAINT,
            indicator="memory_usage_trend",
            weight=0.7,
            threshold=0.85,
            current_value=0.0,
        ))
        self._add_indicator(BottleneckIndicator(
            type=BottleneckType.RESOURCE_CONSTRAINT,
            indicator="response_time_increase",
            weight=0.8,
            threshold=0.5,
            current_value=0.0,
        ))

        # Process inefficiency indicators
        self._add_indicator(BottleneckIndicator(
            type=BottleneckType.PROCESS_INEFFICIENCY,
            indicator="cycle_time_increase",
            weight=0.8,
            threshold=0.3,
            current_value=0.0,
        ))
        self._add_indicator(BottleneckIndicator(
            type=BottleneckType.PROCESS_INEFFICIENCY,
            indicator="wait_time_ratio",
            weight=0.7,
            threshold=0.4,
            current_value=0.0,
        ))

        # Skill gap indicators
        self._add_indicator(BottleneckIndicator(
            type=BottleneckType.SKILL_GAP,
            indicator="error_rate_by_area",
            weight=0.6,
            threshold=0.3,
            current_value=0.0,
        ))
        self._add_indicator(BottleneckIndicator(
            type=BottleneckType.SKILL_GAP,
            indicator="help_request_frequency",
            weight=0.5,
            threshold=0.7,
            current_value=0.0,
        ))

        # Dependency block indicators
        self._add_indicator(BottleneckIndicator(
            type=BottleneckType.DEPENDENCY_BLOCK,
            indicator="external_api_failures",
            weight=0.9,
            threshold=0.1,
            current_value=0.0,
        ))
        self._add_indicator(BottleneckIndicator(
            type=BottleneckType.DEPENDENCY_BLOCK,
            indicator="blocked_task_count",
            weight=0.8,
            threshold=3.0,
            current_value=0.0,
        ))

    def _add_indicator(self, indicator: BottleneckIndicator) -> None:
        """Add a bottleneck indicator."""
        self._indicators[indicator.indicator] = indicator

    def start(self) -> None:
        """Start bottleneck prediction."""
        self._is_running = True

    def stop(self) -> None:
        """Stop bottleneck prediction."""
        self._is_running = False

    def on(self, event_type: str, handler: Callable) -> None:
        """
        Register an event listener.

        Args:
            event_type: Event type to listen for.
            handler: Handler function.
        """
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append(handler)

    def emit(self, event_type: str, data: Any) -> None:
        """
        Emit an event to listeners.

        Args:
            event_type: Event type.
            data: Event data.
        """
        if event_type in self._listeners:
            for handler in self._listeners[event_type]:
                try:
                    handler(data)
                except Exception:
                    pass

    async def _run_predictions(self) -> list[BottleneckPrediction]:
        """
        Run bottleneck predictions.

        Returns:
            List of bottleneck predictions.
        """
        # Update indicator values
        await self._update_indicator_values()

        # Analyze each bottleneck type
        predictions: list[BottleneckPrediction] = []

        for bottleneck_type in BottleneckType:
            prediction = await self._predict_bottleneck(bottleneck_type)
            if prediction.probability > 0.3:
                predictions.append(prediction)

        # Sort by probability
        predictions.sort(key=lambda p: p.probability, reverse=True)

        # Store predictions
        self._prediction_history.extend(predictions)

        # Emit predictions
        self.emit("predictions-made", predictions)

        # Check for high-risk predictions
        high_risk = [p for p in predictions if p.probability > 0.7]
        if high_risk:
            self.emit("high-risk-bottlenecks", high_risk)

        return predictions

    async def _update_indicator_values(self) -> None:
        """Update current indicator values from metrics."""
        metrics = self._metrics_collector.get_all_metrics()

        # Get recent metrics (last 7 days)
        seven_days_ago = datetime.utcnow().timestamp() * 1000 - (7 * 24 * 60 * 60 * 1000)
        recent_metrics: list[dict[str, Any]] = []

        for metric_id, metric_data in metrics.items():
            for value in metric_data.values:
                if value.timestamp.timestamp() * 1000 > seven_days_ago:
                    recent_metrics.append({
                        "name": metric_id,
                        "value": value.value,
                        "timestamp": value.timestamp,
                        "category": metric_data.definition.category.value,
                        "metadata": {},
                    })

        # Update indicators
        await self._update_technical_debt_indicators(recent_metrics)
        await self._update_resource_indicators(recent_metrics)
        await self._update_process_indicators(recent_metrics)
        await self._update_skill_gap_indicators(recent_metrics)
        await self._update_dependency_indicators(recent_metrics)

    async def _update_technical_debt_indicators(
        self,
        metrics: list[dict[str, Any]],
    ) -> None:
        """Update technical debt indicators."""
        # Code complexity trend
        complexity_metrics = [m for m in metrics if m["name"] == "code_complexity"]
        if len(complexity_metrics) > 1:
            trend = self._calculate_trend([m["value"] for m in complexity_metrics])
            self._update_indicator_value("code_complexity_trend", trend)

        # Test coverage decline
        coverage_metrics = [m for m in metrics if m["name"] == "test_coverage"]
        if len(coverage_metrics) > 1:
            trend = self._calculate_trend([m["value"] for m in coverage_metrics])
            self._update_indicator_value("test_coverage_decline", -trend)

        # Bug rate increase
        bug_metrics = [
            m for m in metrics
            if m["category"] == "issue" and m.get("metadata", {}).get("type") == "bug"
        ]
        bug_rate = len(bug_metrics) / max(1, len(metrics))
        self._update_indicator_value("bug_rate_increase", bug_rate)

    async def _update_resource_indicators(
        self,
        metrics: list[dict[str, Any]],
    ) -> None:
        """Update resource constraint indicators."""
        # Memory usage trend
        memory_metrics = [m for m in metrics if m["name"] == "memory_usage"]
        if memory_metrics:
            avg_memory = sum(m["value"] for m in memory_metrics) / len(memory_metrics)
            self._update_indicator_value("memory_usage_trend", avg_memory / 100)

        # Response time increase
        response_metrics = [m for m in metrics if m["name"] == "response_time"]
        if len(response_metrics) > 1:
            trend = self._calculate_trend([m["value"] for m in response_metrics])
            self._update_indicator_value("response_time_increase", trend)

    async def _update_process_indicators(
        self,
        metrics: list[dict[str, Any]],
    ) -> None:
        """Update process efficiency indicators."""
        # Cycle time increase
        cycle_metrics = [m for m in metrics if m["name"] == "cycle_time"]
        if len(cycle_metrics) > 1:
            trend = self._calculate_trend([m["value"] for m in cycle_metrics])
            self._update_indicator_value("cycle_time_increase", trend)

        # Wait time ratio from workflow patterns
        patterns = self._pattern_recognizer.get_workflow_patterns()
        total_time = sum(p.avg_duration for p in patterns)
        active_time = sum(p.avg_duration * p.success_rate for p in patterns)
        wait_ratio = (total_time - active_time) / total_time if total_time > 0 else 0
        self._update_indicator_value("wait_time_ratio", wait_ratio)

    async def _update_skill_gap_indicators(
        self,
        metrics: list[dict[str, Any]],
    ) -> None:
        """Update skill gap indicators."""
        # Error rate by area
        error_metrics = [m for m in metrics if m["category"] == "error"]
        error_rate = len(error_metrics) / max(1, len(metrics))
        self._update_indicator_value("error_rate_by_area", error_rate)

        # Help request frequency (AI usage)
        ai_metrics = [m for m in metrics if m["category"] == "ai"]
        help_rate = len(ai_metrics) / max(1, len(metrics))
        self._update_indicator_value("help_request_frequency", help_rate)

    async def _update_dependency_indicators(
        self,
        metrics: list[dict[str, Any]],
    ) -> None:
        """Update dependency indicators."""
        # External API failures
        api_metrics = [m for m in metrics if m["category"] == "api"]
        api_failures = [
            m for m in api_metrics
            if m.get("metadata", {}).get("status") == "failure"
        ]
        failure_rate = len(api_failures) / max(1, len(api_metrics))
        self._update_indicator_value("external_api_failures", failure_rate)

        # Blocked task count
        blocked_metrics = [
            m for m in metrics
            if m.get("metadata", {}).get("status") == "blocked"
        ]
        self._update_indicator_value("blocked_task_count", len(blocked_metrics))

    def _update_indicator_value(self, indicator_name: str, value: float) -> None:
        """Update indicator value."""
        indicator = self._indicators.get(indicator_name)
        if indicator:
            indicator.current_value = value

    async def _predict_bottleneck(
        self,
        bottleneck_type: BottleneckType,
    ) -> BottleneckPrediction:
        """
        Predict specific bottleneck type.

        Args:
            bottleneck_type: Type of bottleneck to predict.

        Returns:
            Bottleneck prediction.
        """
        type_indicators = [
            i for i in self._indicators.values()
            if i.type == bottleneck_type
        ]

        if not type_indicators:
            return BottleneckPrediction(
                type=bottleneck_type,
                probability=0.0,
                timeframe="unknown",
                indicators=[],
                prevention_suggestions=[],
            )

        # Calculate weighted probability
        total_weight = 0.0
        weighted_sum = 0.0
        triggered_indicators: list[str] = []

        for indicator in type_indicators:
            normalized = self._normalize_indicator_value(indicator)
            if normalized > 0.3:
                triggered_indicators.append(indicator.indicator)
            weighted_sum += normalized * indicator.weight
            total_weight += indicator.weight

        probability = weighted_sum / total_weight if total_weight > 0 else 0

        # Determine timeframe
        timeframe = self._estimate_timeframe(probability)

        # Generate prevention suggestions
        prevention_suggestions = self._generate_prevention_suggestions(
            bottleneck_type,
            triggered_indicators,
        )

        return BottleneckPrediction(
            type=bottleneck_type,
            probability=probability,
            timeframe=timeframe,
            indicators=triggered_indicators,
            prevention_suggestions=prevention_suggestions,
        )

    def _normalize_indicator_value(
        self,
        indicator: BottleneckIndicator,
    ) -> float:
        """
        Normalize indicator value based on threshold.

        Args:
            indicator: Bottleneck indicator.

        Returns:
            Normalized value (0-1).
        """
        if indicator.threshold == 0:
            return 0.0

        ratio = indicator.current_value / indicator.threshold
        return min(1.0, max(0.0, ratio))

    def _calculate_trend(self, values: list[float]) -> float:
        """
        Calculate trend from values.

        Args:
            values: List of metric values.

        Returns:
            Trend value.
        """
        if len(values) < 2:
            return 0.0

        trend_sum = 0.0
        valid_count = 0
        for i in range(1, len(values)):
            current = values[i]
            previous = values[i - 1]
            if previous != 0:
                trend_sum += (current - previous) / previous
                valid_count += 1

        return trend_sum / valid_count if valid_count > 0 else 0.0

    def _estimate_timeframe(self, probability: float) -> str:
        """
        Estimate timeframe for bottleneck.

        Args:
            probability: Bottleneck probability.

        Returns:
            Estimated timeframe string.
        """
        if probability > 0.8:
            return "1-3 days"
        if probability > 0.6:
            return "1 week"
        if probability > 0.4:
            return "2-3 weeks"
        return "1 month+"

    def _generate_prevention_suggestions(
        self,
        bottleneck_type: BottleneckType,
        indicators: list[str],
    ) -> list[str]:
        """
        Generate prevention suggestions for bottleneck type.

        Args:
            bottleneck_type: Type of bottleneck.
            indicators: Triggered indicator names.

        Returns:
            List of prevention suggestions.
        """
        suggestions: list[str] = []

        if bottleneck_type == BottleneckType.TECHNICAL_DEBT:
            suggestions.extend([
                "Schedule refactoring sessions",
                "Increase test coverage requirements",
                "Implement code review standards",
            ])
            if "bug_rate_increase" in indicators:
                suggestions.append("Allocate time for bug fixing sprints")

        elif bottleneck_type == BottleneckType.RESOURCE_CONSTRAINT:
            suggestions.extend([
                "Optimize resource-intensive operations",
                "Implement caching strategies",
                "Consider horizontal scaling",
            ])
            if "memory_usage_trend" in indicators:
                suggestions.append("Profile memory usage and fix leaks")

        elif bottleneck_type == BottleneckType.PROCESS_INEFFICIENCY:
            suggestions.extend([
                "Review and optimize workflow",
                "Automate repetitive tasks",
                "Implement parallel processing where possible",
            ])

        elif bottleneck_type == BottleneckType.SKILL_GAP:
            suggestions.extend([
                "Provide targeted training sessions",
                "Implement pair programming",
                "Create knowledge sharing sessions",
            ])
            if "help_request_frequency" in indicators:
                suggestions.append("Document common issues and solutions")

        elif bottleneck_type == BottleneckType.DEPENDENCY_BLOCK:
            suggestions.extend([
                "Implement fallback mechanisms",
                "Cache external API responses",
                "Review and update dependencies",
                "Create mock services for development",
            ])

        return suggestions

    def predict_bottlenecks(self) -> list[BottleneckPrediction]:
        """
        Synchronously predict bottlenecks.

        Returns:
            List of bottleneck predictions.
        """
        import asyncio

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        return loop.run_until_complete(self._run_predictions())

    def get_current_predictions(self) -> list[BottleneckPrediction]:
        """
        Get current predictions from history.

        Returns:
            List of recent predictions.
        """
        # Filter predictions from last 24 hours
        now = datetime.utcnow().timestamp() * 1000
        one_day_ago = now - (24 * 60 * 60 * 1000)

        recent_predictions = [
            p for p in self._prediction_history
            if p.probability > 0.3  # Only meaningful predictions
        ]

        return sorted(recent_predictions, key=lambda p: p.probability, reverse=True)

    async def make_bottleneck_prediction(
        self,
    ) -> PredictionResult[list[BottleneckPrediction]]:
        """
        Make comprehensive bottleneck prediction.

        Returns:
            Prediction result with bottleneck predictions.
        """
        predictions = await self._run_predictions()
        current_predictions = self.get_current_predictions()
        high_risk = [p for p in current_predictions if p.probability > 0.7]
        medium_risk = [
            p for p in current_predictions
            if 0.4 < p.probability <= 0.7
        ]

        return PredictionResult(
            prediction=current_predictions,
            confidence=0.75 if current_predictions else 0.3,
            reasoning=[
                f"Analyzed {len(self._indicators)} indicators",
                f"Found {len(high_risk)} high-risk bottlenecks",
                f"Found {len(medium_risk)} medium-risk bottlenecks",
                "Based on 7-day rolling metrics",
            ],
            data_points=len([
                i for i in self._indicators.values()
                if i.current_value > 0
            ]),
            timestamp=datetime.utcnow(),
        )

    def _predict_technical_debt(self) -> BottleneckPrediction | None:
        """Predict technical debt bottleneck."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            self._predict_bottleneck(BottleneckType.TECHNICAL_DEBT)
        )

    def _predict_resource_constraints(self) -> BottleneckPrediction | None:
        """Predict resource constraint bottleneck."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            self._predict_bottleneck(BottleneckType.RESOURCE_CONSTRAINT)
        )

    def _predict_process_inefficiencies(self) -> BottleneckPrediction | None:
        """Predict process inefficiency bottleneck."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            self._predict_bottleneck(BottleneckType.PROCESS_INEFFICIENCY)
        )

    def _predict_skill_gaps(self) -> BottleneckPrediction | None:
        """Predict skill gap bottleneck."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            self._predict_bottleneck(BottleneckType.SKILL_GAP)
        )

    def _predict_dependency_blocks(self) -> BottleneckPrediction | None:
        """Predict dependency block bottleneck."""
        import asyncio
        return asyncio.get_event_loop().run_until_complete(
            self._predict_bottleneck(BottleneckType.DEPENDENCY_BLOCK)
        )

    def get_stats(self) -> dict[str, Any]:
        """
        Get bottleneck predictor statistics.

        Returns:
            Statistics dictionary.
        """
        return {
            "is_running": self._is_running,
            "indicators_count": len(self._indicators),
            "predictions_history_count": len(self._prediction_history),
            "current_indicators": {
                name: {
                    "type": ind.type.value,
                    "current_value": ind.current_value,
                    "threshold": ind.threshold,
                    "weight": ind.weight,
                }
                for name, ind in self._indicators.items()
            },
        }


# Singleton instance
_bottleneck_predictor: BottleneckPredictor | None = None


def get_bottleneck_predictor() -> BottleneckPredictor:
    """Get the singleton bottleneck predictor instance."""
    global _bottleneck_predictor
    if _bottleneck_predictor is None:
        _bottleneck_predictor = BottleneckPredictor()
    return _bottleneck_predictor


# Alias for compatibility
bottleneck_predictor = get_bottleneck_predictor()
