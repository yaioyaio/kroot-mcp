"""
DevFlow Monitor - Feedback Analyzer.

Analyzes collected feedback to extract insights, detect patterns,
and generate improvement suggestions.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from ..storage.database import DatabaseManager
from ..utils.logger import Logger
from .types import (
    Feedback,
    FeedbackAnalysis,
    FeedbackAnalysisSummary,
    FeedbackEvent,
    FeedbackEventType,
    FeedbackPriority,
    FeedbackType,
    Impact,
    ImpactSeverity,
    ImprovementStatus,
    ImprovementSuggestion,
    ImprovementType,
    SentimentAnalysis,
    SentimentLabel,
    SimilarFeedback,
    SuggestedCategory,
    SuggestedPriority,
    Trend,
)

logger = Logger("FeedbackAnalyzer")


@dataclass
class FeedbackAnalyzerConfig:
    """Configuration for feedback analyzer."""

    similarity_threshold: float = 0.7
    min_feedback_for_suggestion: int = 3
    enable_sentiment_analysis: bool = True
    max_keywords: int = 10


class FeedbackAnalyzer:
    """
    Analyzes feedback to extract insights and generate recommendations.

    Provides sentiment analysis, keyword extraction, similarity detection,
    and automatic improvement suggestion generation.

    Example:
        analyzer = FeedbackAnalyzer(db)
        await analyzer.initialize()

        analysis = await analyzer.analyze(feedback)
        print(f"Sentiment: {analysis.sentiment.label}")
    """

    def __init__(
        self,
        database: DatabaseManager,
        config: FeedbackAnalyzerConfig | None = None,
    ) -> None:
        """
        Initialize feedback analyzer.

        Args:
            database: Database manager instance.
            config: Analyzer configuration.
        """
        self._db = database
        self._config = config or FeedbackAnalyzerConfig()
        self._event_handlers: dict[str, list[Callable]] = {}

    async def initialize(self) -> None:
        """Initialize database tables for analysis."""
        # Analysis results table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS feedback_analysis (
                id TEXT PRIMARY KEY,
                feedback_id TEXT NOT NULL,
                sentiment_score REAL,
                sentiment_label TEXT,
                sentiment_confidence REAL,
                suggested_priority TEXT,
                priority_confidence REAL,
                keywords TEXT,
                analyzed_at INTEGER NOT NULL,
                FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
            )
        """)
        await self._db.commit()

        # Similar feedback table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS similar_feedback (
                feedback_id TEXT NOT NULL,
                similar_id TEXT NOT NULL,
                similarity REAL NOT NULL,
                PRIMARY KEY (feedback_id, similar_id),
                FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE,
                FOREIGN KEY (similar_id) REFERENCES feedback(id) ON DELETE CASCADE
            )
        """)
        await self._db.commit()

        # Improvement suggestions table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS improvement_suggestions (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                impact_users INTEGER,
                impact_severity TEXT,
                impact_effort TEXT,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                feedback_ids TEXT NOT NULL
            )
        """)
        await self._db.commit()

        # Create indexes
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_analysis_feedback ON feedback_analysis(feedback_id)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_similar_feedback ON similar_feedback(feedback_id)"
        )
        await self._db.commit()

        logger.info("Feedback analyzer initialized")

    def on(self, event: str, handler: Callable) -> None:
        """Register an event handler."""
        if event not in self._event_handlers:
            self._event_handlers[event] = []
        self._event_handlers[event].append(handler)

    def _emit(self, event: str, data: Any) -> None:
        """Emit an event to registered handlers."""
        if event in self._event_handlers:
            for handler in self._event_handlers[event]:
                try:
                    handler(data)
                except Exception as e:
                    logger.error(f"Event handler error: {e}")

    async def analyze(self, feedback: Feedback) -> FeedbackAnalysis:
        """
        Analyze a feedback item.

        Args:
            feedback: Feedback to analyze.

        Returns:
            Analysis results.
        """
        logger.info("Analyzing feedback", {"id": feedback.id, "type": feedback.type.value})

        # Sentiment analysis
        sentiment = (
            self._analyze_sentiment(feedback)
            if self._config.enable_sentiment_analysis
            else SentimentAnalysis(score=0, label=SentimentLabel.NEUTRAL, confidence=0)
        )

        # Category suggestions
        suggested_categories = self._suggest_categories(feedback)

        # Priority suggestion
        suggested_priority = self._suggest_priority(feedback)

        # Find similar feedback
        similar_feedback = await self._find_similar_feedback(feedback)

        # Extract keywords
        keywords = self._extract_keywords(feedback)

        # Create analysis result
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        analysis = FeedbackAnalysis(
            id=str(uuid.uuid4()),
            feedback_id=feedback.id,
            sentiment=sentiment,
            suggested_categories=suggested_categories,
            suggested_priority=suggested_priority,
            similar_feedback=similar_feedback,
            keywords=keywords,
            analyzed_at=now,
        )

        # Save analysis
        await self._save_analysis(analysis)

        # Save similar feedback relations
        if similar_feedback:
            await self._save_similar_feedback(feedback.id, similar_feedback)

        # Check for improvement suggestions
        await self._check_for_improvement_suggestions(feedback, analysis)

        # Emit event
        event = FeedbackEvent(
            type=FeedbackEventType.FEEDBACK_ANALYZED,
            feedback_id=feedback.id,
            timestamp=now,
            details={
                "sentiment": sentiment.label.value,
                "similar_count": len(similar_feedback),
            },
        )
        self._emit("feedback_analyzed", event)

        return analysis

    def _analyze_sentiment(self, feedback: Feedback) -> SentimentAnalysis:
        """Analyze sentiment of feedback text."""
        text = f"{feedback.title} {feedback.description}".lower()

        # Positive keywords
        positive_words = [
            "great",
            "excellent",
            "love",
            "amazing",
            "wonderful",
            "fantastic",
            "helpful",
            "useful",
            "perfect",
            "awesome",
            "good",
            "nice",
            "thank",
            "appreciate",
            "satisfied",
            "happy",
            "pleased",
            "impressive",
        ]

        # Negative keywords
        negative_words = [
            "bad",
            "terrible",
            "hate",
            "awful",
            "horrible",
            "useless",
            "broken",
            "frustrating",
            "annoying",
            "disappointed",
            "unhappy",
            "poor",
            "worst",
            "fail",
            "crash",
            "bug",
            "issue",
            "problem",
            "error",
            "slow",
        ]

        # Intensifiers
        intensifiers = ["very", "extremely", "really", "totally", "absolutely"]

        score = 0.0
        word_count = 0

        words = text.split()
        for i, word in enumerate(words):
            word_score = 0.0

            if word.lower() in positive_words:
                word_score = 1.0
            elif word.lower() in negative_words:
                word_score = -1.0

            # Check for intensifier
            if word_score != 0 and i > 0 and words[i - 1].lower() in intensifiers:
                word_score *= 1.5

            if word_score != 0:
                score += word_score
                word_count += 1

        # Normalize score (-1 to 1)
        normalized_score = max(-1, min(1, score / word_count)) if word_count > 0 else 0

        # Determine label
        if normalized_score > 0.3:
            label = SentimentLabel.POSITIVE
        elif normalized_score < -0.3:
            label = SentimentLabel.NEGATIVE
        else:
            label = SentimentLabel.NEUTRAL

        # Calculate confidence
        confidence = min(1.0, word_count / 10)

        return SentimentAnalysis(
            score=normalized_score, label=label, confidence=confidence
        )

    def _suggest_categories(self, feedback: Feedback) -> list[SuggestedCategory]:
        """Suggest categories based on feedback content."""
        text = f"{feedback.title} {feedback.description}".lower()
        categories: list[SuggestedCategory] = []

        # Category keywords
        category_keywords = {
            "ui_ux": [
                "ui",
                "ux",
                "interface",
                "design",
                "layout",
                "button",
                "screen",
                "display",
                "visual",
            ],
            "performance": [
                "slow",
                "fast",
                "speed",
                "performance",
                "lag",
                "freeze",
                "memory",
                "cpu",
            ],
            "functionality": [
                "feature",
                "function",
                "work",
                "behavior",
                "action",
                "operation",
            ],
            "integration": [
                "api",
                "integration",
                "connect",
                "sync",
                "webhook",
                "external",
            ],
            "documentation": [
                "docs",
                "documentation",
                "guide",
                "tutorial",
                "help",
                "readme",
            ],
            "security": [
                "security",
                "auth",
                "permission",
                "access",
                "token",
                "password",
            ],
            "workflow": [
                "workflow",
                "process",
                "flow",
                "step",
                "sequence",
                "automation",
            ],
        }

        # Calculate score for each category
        for category, keywords in category_keywords.items():
            matches = sum(1 for keyword in keywords if keyword in text)

            if matches > 0:
                confidence = min(1.0, matches / len(keywords))
                categories.append(
                    SuggestedCategory(category=category, confidence=confidence)
                )

        # Sort by confidence and return top 3
        categories.sort(key=lambda x: x.confidence, reverse=True)
        return categories[:3]

    def _suggest_priority(self, feedback: Feedback) -> SuggestedPriority:
        """Suggest priority based on feedback content."""
        text = f"{feedback.title} {feedback.description}".lower()

        # Priority keywords with weights
        priority_keywords = {
            FeedbackPriority.CRITICAL: {
                "keywords": [
                    "crash",
                    "data loss",
                    "security breach",
                    "critical",
                    "emergency",
                    "urgent",
                ],
                "weight": 4,
            },
            FeedbackPriority.HIGH: {
                "keywords": [
                    "bug",
                    "error",
                    "broken",
                    "fail",
                    "issue",
                    "problem",
                    "important",
                ],
                "weight": 3,
            },
            FeedbackPriority.MEDIUM: {
                "keywords": [
                    "improve",
                    "enhance",
                    "update",
                    "change",
                    "modify",
                    "adjust",
                ],
                "weight": 2,
            },
            FeedbackPriority.LOW: {
                "keywords": [
                    "nice to have",
                    "minor",
                    "small",
                    "cosmetic",
                    "typo",
                    "suggestion",
                ],
                "weight": 1,
            },
        }

        # Calculate scores
        scores = {p: 0.0 for p in FeedbackPriority}
        total_matches = 0

        for priority, config in priority_keywords.items():
            for keyword in config["keywords"]:
                if keyword in text:
                    scores[priority] += config["weight"]
                    total_matches += 1

        # Find highest score
        suggested_priority = FeedbackPriority.MEDIUM
        max_score = 0.0

        for priority, score in scores.items():
            if score > max_score:
                max_score = score
                suggested_priority = priority

        # Calculate confidence
        confidence = min(1.0, total_matches / 5) if total_matches > 0 else 0.3

        return SuggestedPriority(priority=suggested_priority, confidence=confidence)

    async def _find_similar_feedback(self, feedback: Feedback) -> list[SimilarFeedback]:
        """Find similar feedback items."""
        # Search in last 30 days
        thirty_days_ago = int(
            datetime.now(timezone.utc).timestamp() * 1000
        ) - (30 * 24 * 60 * 60 * 1000)

        candidates = await self._db.fetch_all(
            """
            SELECT id, title, description, type
            FROM feedback
            WHERE id != ? AND submitted_at > ?
            ORDER BY submitted_at DESC
            LIMIT 100
            """,
            (feedback.id, thirty_days_ago),
        )

        similar: list[SimilarFeedback] = []

        for candidate in candidates:
            similarity = self._calculate_similarity(
                f"{feedback.title} {feedback.description}",
                f"{candidate['title']} {candidate['description']}",
            )

            if similarity >= self._config.similarity_threshold:
                similar.append(
                    SimilarFeedback(
                        id=candidate["id"],
                        similarity=similarity,
                        title=candidate["title"],
                    )
                )

        # Sort by similarity and return top 5
        similar.sort(key=lambda x: x.similarity, reverse=True)
        return similar[:5]

    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate Jaccard similarity between two texts."""
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())

        intersection = words1 & words2
        union = words1 | words2

        return len(intersection) / len(union) if union else 0.0

    def _extract_keywords(self, feedback: Feedback) -> list[str]:
        """Extract keywords from feedback."""
        text = f"{feedback.title} {feedback.description}".lower()

        # Stop words
        stop_words = {
            "the",
            "a",
            "an",
            "and",
            "or",
            "but",
            "in",
            "on",
            "at",
            "to",
            "for",
            "of",
            "with",
            "by",
            "from",
            "up",
            "about",
            "into",
            "through",
            "during",
            "is",
            "are",
            "was",
            "were",
            "been",
            "be",
            "have",
            "has",
            "had",
            "do",
            "does",
            "did",
            "will",
            "would",
            "could",
            "should",
            "may",
            "might",
        }

        # Extract and filter words
        words = [
            "".join(c for c in word if c.isalnum())
            for word in text.split()
            if word.lower() not in stop_words
        ]
        words = [w for w in words if len(w) > 2]

        # Count word frequency
        word_freq: dict[str, int] = {}
        for word in words:
            word_freq[word] = word_freq.get(word, 0) + 1

        # Sort by frequency and return top keywords
        sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        return [word for word, _ in sorted_words[: self._config.max_keywords]]

    async def _check_for_improvement_suggestions(
        self, feedback: Feedback, analysis: FeedbackAnalysis
    ) -> None:
        """Check if improvement suggestion should be generated."""
        # Need enough similar feedback
        if len(analysis.similar_feedback) < self._config.min_feedback_for_suggestion - 1:
            return

        # Check if suggestion already exists
        existing = await self._db.fetch_one(
            "SELECT id FROM improvement_suggestions WHERE feedback_ids LIKE ?",
            (f"%{feedback.id}%",),
        )

        if existing:
            return

        # Gather similar feedback IDs
        similar_ids = [feedback.id] + [sf.id for sf in analysis.similar_feedback]

        # Get similar feedbacks
        placeholders = ",".join("?" * len(similar_ids))
        similar_feedbacks = await self._db.fetch_all(
            f"SELECT * FROM feedback WHERE id IN ({placeholders})",
            tuple(similar_ids),
        )

        # Find common keywords
        common_keywords = self._find_common_keywords(similar_feedbacks)

        # Calculate average priority
        avg_priority = self._calculate_average_priority(similar_feedbacks)

        # Generate improvement suggestion
        now = int(datetime.now(timezone.utc).timestamp() * 1000)
        suggestion = ImprovementSuggestion(
            id=str(uuid.uuid4()),
            feedback_ids=similar_ids,
            type=self._determine_improvement_type(feedback.type),
            title=f"Address recurring {feedback.type.value.replace('_', ' ')}: {', '.join(common_keywords[:3])}",
            description=self._generate_improvement_description(
                similar_feedbacks, common_keywords
            ),
            impact=Impact(
                users=len(similar_feedbacks),
                severity=self._calculate_impact_severity(avg_priority),
                effort=ImpactSeverity.MEDIUM,
            ),
            status=ImprovementStatus.PROPOSED,
            created_at=now,
        )

        # Save suggestion
        await self._save_improvement_suggestion(suggestion)

        # Emit event
        event = FeedbackEvent(
            type=FeedbackEventType.IMPROVEMENT_SUGGESTED,
            timestamp=now,
            details={
                "suggestion_id": suggestion.id,
                "feedback_count": len(similar_ids),
            },
        )
        self._emit("improvement_suggested", event)

        logger.info(
            "Improvement suggestion generated",
            {"suggestion_id": suggestion.id, "feedback_count": len(similar_ids)},
        )

    def _find_common_keywords(self, feedbacks: list[dict]) -> list[str]:
        """Find keywords common to multiple feedbacks."""
        all_keywords: dict[str, int] = {}

        for fb in feedbacks:
            # Create a temporary Feedback object for keyword extraction
            temp_feedback = Feedback(
                id=fb["id"],
                type=FeedbackType(fb["type"]),
                title=fb["title"],
                description=fb["description"],
                status=FeedbackStatus.NEW,
                priority=FeedbackPriority.MEDIUM,
                source=FeedbackSource.IN_APP,
                submitted_at=0,
                updated_at=0,
            )
            keywords = self._extract_keywords(temp_feedback)

            for keyword in keywords:
                all_keywords[keyword] = all_keywords.get(keyword, 0) + 1

        # Filter keywords appearing in at least 50% of feedbacks
        threshold = len(feedbacks) * 0.5
        common = [kw for kw, count in all_keywords.items() if count >= threshold]

        return common[:5]

    def _calculate_average_priority(self, feedbacks: list[dict]) -> float:
        """Calculate average priority value."""
        priority_values = {
            FeedbackPriority.CRITICAL.value: 4,
            FeedbackPriority.HIGH.value: 3,
            FeedbackPriority.MEDIUM.value: 2,
            FeedbackPriority.LOW.value: 1,
        }

        total = sum(priority_values.get(fb["priority"], 2) for fb in feedbacks)
        return total / len(feedbacks) if feedbacks else 2.0

    def _determine_improvement_type(self, feedback_type: FeedbackType) -> ImprovementType:
        """Determine improvement type from feedback type."""
        type_mapping = {
            FeedbackType.BUG_REPORT: ImprovementType.FIX,
            FeedbackType.PERFORMANCE_ISSUE: ImprovementType.FIX,
            FeedbackType.FEATURE_REQUEST: ImprovementType.FEATURE,
            FeedbackType.DOCUMENTATION: ImprovementType.DOCUMENTATION,
        }
        return type_mapping.get(feedback_type, ImprovementType.ENHANCEMENT)

    def _calculate_impact_severity(self, avg_priority: float) -> ImpactSeverity:
        """Calculate impact severity from average priority."""
        if avg_priority >= 3.5:
            return ImpactSeverity.HIGH
        if avg_priority >= 2.5:
            return ImpactSeverity.MEDIUM
        return ImpactSeverity.LOW

    def _generate_improvement_description(
        self, feedbacks: list[dict], keywords: list[str]
    ) -> str:
        """Generate improvement suggestion description."""
        types = set(fb["type"] for fb in feedbacks)
        type_list = ", ".join(types)

        return (
            f"Multiple users ({len(feedbacks)}) have reported similar {type_list} "
            f"related to: {', '.join(keywords)}. This recurring pattern suggests "
            f"a systematic issue that should be addressed to improve user experience."
        )

    async def _save_analysis(self, analysis: FeedbackAnalysis) -> None:
        """Save analysis to database."""
        await self._db.execute(
            """
            INSERT INTO feedback_analysis (
                id, feedback_id, sentiment_score, sentiment_label, sentiment_confidence,
                suggested_priority, priority_confidence, keywords, analyzed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                analysis.id,
                analysis.feedback_id,
                analysis.sentiment.score,
                analysis.sentiment.label.value,
                analysis.sentiment.confidence,
                analysis.suggested_priority.priority.value,
                analysis.suggested_priority.confidence,
                json.dumps(analysis.keywords),
                analysis.analyzed_at,
            ),
        )
        await self._db.commit()

    async def _save_similar_feedback(
        self, feedback_id: str, similar_feedback: list[SimilarFeedback]
    ) -> None:
        """Save similar feedback relations."""
        for similar in similar_feedback:
            await self._db.execute(
                """
                INSERT OR REPLACE INTO similar_feedback (feedback_id, similar_id, similarity)
                VALUES (?, ?, ?)
                """,
                (feedback_id, similar.id, similar.similarity),
            )
        await self._db.commit()

    async def _save_improvement_suggestion(
        self, suggestion: ImprovementSuggestion
    ) -> None:
        """Save improvement suggestion to database."""
        await self._db.execute(
            """
            INSERT INTO improvement_suggestions (
                id, type, title, description, impact_users, impact_severity,
                impact_effort, status, created_at, feedback_ids
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                suggestion.id,
                suggestion.type.value,
                suggestion.title,
                suggestion.description,
                suggestion.impact.users,
                suggestion.impact.severity.value,
                suggestion.impact.effort.value,
                suggestion.status.value,
                suggestion.created_at,
                json.dumps(suggestion.feedback_ids),
            ),
        )
        await self._db.commit()

    async def get_analysis(self, feedback_id: str) -> FeedbackAnalysis | None:
        """
        Get analysis for a feedback item.

        Args:
            feedback_id: Feedback ID.

        Returns:
            Analysis result or None if not found.
        """
        row = await self._db.fetch_one(
            "SELECT * FROM feedback_analysis WHERE feedback_id = ?",
            (feedback_id,),
        )

        if not row:
            return None

        # Get similar feedback
        similar_rows = await self._db.fetch_all(
            """
            SELECT sf.similar_id, sf.similarity, f.title
            FROM similar_feedback sf
            JOIN feedback f ON sf.similar_id = f.id
            WHERE sf.feedback_id = ?
            ORDER BY sf.similarity DESC
            """,
            (feedback_id,),
        )

        similar_feedback = [
            SimilarFeedback(
                id=r["similar_id"],
                similarity=r["similarity"],
                title=r["title"],
            )
            for r in similar_rows
        ]

        return FeedbackAnalysis(
            id=row["id"],
            feedback_id=row["feedback_id"],
            sentiment=SentimentAnalysis(
                score=row["sentiment_score"],
                label=SentimentLabel(row["sentiment_label"]),
                confidence=row["sentiment_confidence"],
            ),
            suggested_categories=[],
            suggested_priority=SuggestedPriority(
                priority=FeedbackPriority(row["suggested_priority"]),
                confidence=row["priority_confidence"],
            ),
            similar_feedback=similar_feedback,
            keywords=json.loads(row["keywords"]) if row.get("keywords") else [],
            analyzed_at=row["analyzed_at"],
        )

    async def list_improvement_suggestions(
        self, status: ImprovementStatus | None = None, limit: int = 50
    ) -> list[ImprovementSuggestion]:
        """
        List improvement suggestions.

        Args:
            status: Optional status filter.
            limit: Maximum results.

        Returns:
            List of improvement suggestions.
        """
        query = "SELECT * FROM improvement_suggestions"
        params: list[Any] = []

        if status:
            query += " WHERE status = ?"
            params.append(status.value)

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        rows = await self._db.fetch_all(query, tuple(params))

        return [
            ImprovementSuggestion(
                id=row["id"],
                feedback_ids=json.loads(row["feedback_ids"]),
                type=ImprovementType(row["type"]),
                title=row["title"],
                description=row["description"],
                impact=Impact(
                    users=row["impact_users"],
                    severity=ImpactSeverity(row["impact_severity"]),
                    effort=ImpactSeverity(row["impact_effort"]),
                ),
                status=ImprovementStatus(row["status"]),
                created_at=row["created_at"],
            )
            for row in rows
        ]

    def get_recommendations(self, feedbacks: list[Feedback]) -> list[str]:
        """
        Generate recommendations based on feedback collection.

        Args:
            feedbacks: List of feedbacks to analyze.

        Returns:
            List of recommendation strings.
        """
        recommendations: list[str] = []

        if not feedbacks:
            return recommendations

        # Count by type
        type_counts: dict[str, int] = {}
        for fb in feedbacks:
            type_counts[fb.type.value] = type_counts.get(fb.type.value, 0) + 1

        # Generate type-based recommendations
        if type_counts.get(FeedbackType.BUG_REPORT.value, 0) > 5:
            recommendations.append(
                "High number of bug reports detected. Consider prioritizing stability improvements."
            )

        if type_counts.get(FeedbackType.PERFORMANCE_ISSUE.value, 0) > 3:
            recommendations.append(
                "Multiple performance issues reported. Review performance monitoring and optimization."
            )

        if type_counts.get(FeedbackType.USABILITY_ISSUE.value, 0) > 3:
            recommendations.append(
                "Usability issues detected. Consider conducting user experience review."
            )

        if type_counts.get(FeedbackType.FEATURE_REQUEST.value, 0) > 10:
            recommendations.append(
                "Many feature requests received. Prioritize based on user impact and effort."
            )

        return recommendations
