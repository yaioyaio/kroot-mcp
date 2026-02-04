"""
Development Velocity Predictor.

Predicts development speed based on historical data and patterns
using moving average and trend analysis.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Callable

from ..events.engine import EventEngine, get_event_engine
from ..events.types.base import BaseEvent
from .pattern_recognizer import PatternRecognizer, get_pattern_recognizer
from .types import (
    DevelopmentVelocity,
    PredictionResult,
    VelocityDataPoint,
    VelocityFactor,
    VelocityPrediction,
    VelocityTrend,
)


class VelocityPredictor:
    """
    Development velocity predictor.

    Predicts development velocity based on historical data using
    moving averages and trend analysis.
    """

    def __init__(
        self,
        event_engine: EventEngine | None = None,
        pattern_recognizer: PatternRecognizer | None = None,
    ):
        """
        Initialize the velocity predictor.

        Args:
            event_engine: Optional event engine instance.
            pattern_recognizer: Optional pattern recognizer instance.
        """
        self._event_engine = event_engine or get_event_engine()
        self._pattern_recognizer = pattern_recognizer or get_pattern_recognizer()

        self._data_points: list[VelocityDataPoint] = []
        self._current_velocity: float = 0.0
        self._is_running = False
        self._subscription_id: str | None = None
        self._listeners: dict[str, list[Callable]] = {}

    def start(self) -> None:
        """Start velocity prediction (subscribes to events)."""
        if self._is_running:
            return

        self._is_running = True
        self._subscription_id = self._event_engine.subscribe(
            "*",
            self._handle_event,
        )

    def stop(self) -> None:
        """Stop velocity prediction."""
        if not self._is_running:
            return

        self._is_running = False
        if self._subscription_id:
            self._event_engine.unsubscribe(self._subscription_id)
            self._subscription_id = None

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

    async def _handle_event(self, event: BaseEvent) -> None:
        """Handle incoming events for velocity tracking."""
        # Update velocity data based on event type
        self._process_event_for_velocity(event)

    def _process_event_for_velocity(self, event: BaseEvent) -> None:
        """
        Process event to update velocity metrics.

        Args:
            event: Development event.
        """
        category = event.category
        if isinstance(category, str):
            category_value = category
        else:
            category_value = category.value

        # Calculate velocity contribution based on event type
        velocity_contribution = 0.0
        factors: list[VelocityFactor] = []

        if category_value == "file":
            velocity_contribution = 1.0
            factors.append(VelocityFactor(
                name="file_change",
                impact=0.1,
                description="File modification activity",
            ))

        elif category_value == "git":
            action = event.data.get("action", "")
            if action == "commit":
                velocity_contribution = 5.0
                factors.append(VelocityFactor(
                    name="commit",
                    impact=0.3,
                    description="Code committed to repository",
                ))

                # Check commit stats for additional impact
                stats = event.data.get("stats", {})
                insertions = stats.get("insertions", 0)
                deletions = stats.get("deletions", 0)
                if insertions + deletions > 100:
                    factors.append(VelocityFactor(
                        name="large_commit",
                        impact=0.2,
                        description="Large code change detected",
                    ))

        elif category_value == "test":
            velocity_contribution = 3.0
            passed = event.data.get("passed", True)
            if passed:
                factors.append(VelocityFactor(
                    name="test_pass",
                    impact=0.15,
                    description="Tests passing",
                ))
            else:
                factors.append(VelocityFactor(
                    name="test_fail",
                    impact=-0.2,
                    description="Test failures detected",
                ))

        elif category_value == "build":
            success = event.data.get("success", True)
            if success:
                velocity_contribution = 4.0
                factors.append(VelocityFactor(
                    name="build_success",
                    impact=0.25,
                    description="Successful build",
                ))
            else:
                velocity_contribution = -2.0
                factors.append(VelocityFactor(
                    name="build_fail",
                    impact=-0.4,
                    description="Build failure blocking progress",
                ))

        elif category_value == "ai":
            velocity_contribution = 2.0
            if event.data.get("accepted"):
                factors.append(VelocityFactor(
                    name="ai_assist",
                    impact=0.2,
                    description="AI assistance accepted",
                ))

        if velocity_contribution != 0:
            self._current_velocity += velocity_contribution
            self._data_points.append(VelocityDataPoint(
                timestamp=datetime.utcnow(),
                velocity=self._current_velocity,
                factors=factors,
            ))

            # Limit data points
            if len(self._data_points) > 1000:
                self._data_points = self._data_points[-500:]

    def _predict_future_velocity(self) -> VelocityPrediction:
        """
        Predict velocity for the next period.

        Returns:
            Velocity prediction.
        """
        if len(self._data_points) < 5:
            return VelocityPrediction(
                next_period=self._current_velocity,
                confidence=0.3,
                factors=[],
            )

        # Use moving average with trend
        recent_points = self._data_points[-10:]
        velocities = [p.velocity for p in recent_points]
        moving_average = sum(velocities) / len(velocities)

        # Calculate trend
        trend = self._calculate_detailed_trend(recent_points)

        # Apply factors
        predicted_velocity = moving_average + trend
        current_factors = recent_points[-1].factors if recent_points else []

        for factor in current_factors:
            predicted_velocity *= (1 + factor.impact)

        # Calculate confidence based on data consistency
        variance = self._calculate_variance(velocities)
        confidence = max(0.3, min(0.9, 1 - (variance / max(moving_average, 1))))

        return VelocityPrediction(
            next_period=max(0, predicted_velocity),
            confidence=confidence,
            factors=list(current_factors),
        )

    def _calculate_average_velocity(self) -> float:
        """
        Calculate average velocity from data points.

        Returns:
            Average velocity.
        """
        if len(self._data_points) == 0:
            return 0.0

        total = sum(point.velocity for point in self._data_points)
        return total / len(self._data_points)

    def _calculate_trend(self) -> VelocityTrend:
        """
        Determine velocity trend direction.

        Returns:
            Velocity trend.
        """
        if len(self._data_points) < 3:
            return VelocityTrend.STABLE

        recent_points = self._data_points[-5:]
        trend_value = self._calculate_detailed_trend(recent_points)

        if trend_value > 0.1:
            return VelocityTrend.INCREASING
        if trend_value < -0.1:
            return VelocityTrend.DECREASING
        return VelocityTrend.STABLE

    def _calculate_detailed_trend(self, points: list[VelocityDataPoint]) -> float:
        """
        Calculate detailed trend value from data points.

        Args:
            points: List of velocity data points.

        Returns:
            Trend value (positive = increasing, negative = decreasing).
        """
        if len(points) < 2:
            return 0.0

        trend_sum = 0.0
        for i in range(1, len(points)):
            current = points[i]
            previous = points[i - 1]
            trend_sum += current.velocity - previous.velocity

        return trend_sum / (len(points) - 1)

    def _calculate_variance(self, values: list[float]) -> float:
        """
        Calculate standard deviation of values.

        Args:
            values: List of numeric values.

        Returns:
            Standard deviation.
        """
        if len(values) == 0:
            return 0.0

        mean = sum(values) / len(values)
        squared_diffs = [(val - mean) ** 2 for val in values]

        return math.sqrt(sum(squared_diffs) / len(values))

    def get_current_velocity(self) -> DevelopmentVelocity:
        """
        Get current development velocity.

        Returns:
            Current velocity with prediction.
        """
        prediction = self._predict_future_velocity()

        return DevelopmentVelocity(
            current=self._current_velocity,
            average=self._calculate_average_velocity(),
            trend=self._calculate_trend(),
            prediction=prediction,
        )

    def calculate_velocity(self) -> DevelopmentVelocity:
        """
        Calculate and return current velocity (alias).

        Returns:
            Current development velocity.
        """
        return self.get_current_velocity()

    async def make_velocity_prediction(
        self,
        hours: int = 24,
    ) -> PredictionResult[list[float]]:
        """
        Make velocity prediction for specified hours.

        Args:
            hours: Number of hours to predict.

        Returns:
            Prediction result with hourly velocity predictions.
        """
        predictions: list[float] = []
        current_prediction = self._current_velocity

        for _ in range(hours):
            prediction = self._predict_future_velocity()
            current_prediction = prediction.next_period
            predictions.append(current_prediction)

        confidence = self._predict_future_velocity().confidence
        trend = self._calculate_trend()

        return PredictionResult(
            prediction=predictions,
            confidence=confidence,
            reasoning=[
                f"Based on {len(self._data_points)} historical data points",
                f"Current trend: {trend.value}",
                f"Average velocity: {self._calculate_average_velocity():.2f}",
            ],
            data_points=len(self._data_points),
            timestamp=datetime.utcnow(),
        )

    def add_velocity_sample(
        self,
        velocity: float,
        factors: list[VelocityFactor] | None = None,
    ) -> None:
        """
        Manually add a velocity sample.

        Args:
            velocity: Velocity value.
            factors: Optional list of factors.
        """
        self._data_points.append(VelocityDataPoint(
            timestamp=datetime.utcnow(),
            velocity=velocity,
            factors=factors or [],
        ))
        self._current_velocity = velocity

        # Limit data points
        if len(self._data_points) > 1000:
            self._data_points = self._data_points[-500:]

    def get_stats(self) -> dict[str, Any]:
        """
        Get velocity predictor statistics.

        Returns:
            Statistics dictionary.
        """
        return {
            "is_running": self._is_running,
            "current_velocity": self._current_velocity,
            "average_velocity": self._calculate_average_velocity(),
            "trend": self._calculate_trend().value,
            "data_points_count": len(self._data_points),
            "prediction": self._predict_future_velocity().model_dump(),
        }


# Singleton instance
_velocity_predictor: VelocityPredictor | None = None


def get_velocity_predictor() -> VelocityPredictor:
    """Get the singleton velocity predictor instance."""
    global _velocity_predictor
    if _velocity_predictor is None:
        _velocity_predictor = VelocityPredictor()
    return _velocity_predictor


# Alias for compatibility
velocity_predictor = get_velocity_predictor()
