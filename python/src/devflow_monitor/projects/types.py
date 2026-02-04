"""
Multi-Project Types and Interfaces.

Type definitions for multi-project management, cross-project analysis,
and synchronization features. All models use Pydantic for validation
and serialization.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class ProjectType(str, Enum):
    """Project type enumeration."""

    WEB_APPLICATION = "web_application"
    MOBILE_APPLICATION = "mobile_application"
    API_SERVICE = "api_service"
    LIBRARY = "library"
    CLI_TOOL = "cli_tool"
    MICROSERVICE = "microservice"
    MONOLITH = "monolith"
    DATA_PIPELINE = "data_pipeline"
    INFRASTRUCTURE = "infrastructure"
    DOCUMENTATION = "documentation"
    OTHER = "other"


class ProjectStatus(str, Enum):
    """Project status enumeration."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"
    MAINTENANCE = "maintenance"
    DEVELOPMENT = "development"
    PRODUCTION = "production"
    DEPRECATED = "deprecated"


class ProjectPriority(str, Enum):
    """Project priority levels."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ProjectRole(str, Enum):
    """Project role enumeration."""

    OWNER = "owner"
    MAINTAINER = "maintainer"
    DEVELOPER = "developer"
    CONTRIBUTOR = "contributor"
    VIEWER = "viewer"


class DevelopmentStage(str, Enum):
    """Development stage enumeration (13 stages)."""

    PRD = "prd"
    PLANNING = "planning"
    ERD = "erd"
    WIREFRAME = "wireframe"
    SCREEN_SPEC = "screen_spec"
    DESIGN = "design"
    FRONTEND = "frontend"
    BACKEND = "backend"
    AI_COLLABORATION = "ai_collaboration"
    CODING = "coding"
    GIT_MANAGEMENT = "git_management"
    DEPLOYMENT = "deployment"
    OPERATIONS = "operations"


class ConflictResolutionStrategy(str, Enum):
    """Conflict resolution strategies for sync."""

    LAST_WRITE_WINS = "last_write_wins"
    PRESERVE_ALL = "preserve_all"
    MANUAL_RESOLVE = "manual_resolve"


class SyncStatus(str, Enum):
    """Synchronization status."""

    PENDING = "pending"
    SYNCING = "syncing"
    SYNCED = "synced"
    FAILED = "failed"
    CONFLICT = "conflict"


class DependencyType(str, Enum):
    """Project dependency types."""

    DIRECT = "direct"
    INDIRECT = "indirect"
    SHARED_RESOURCE = "shared_resource"
    DATA_DEPENDENCY = "data_dependency"
    API_DEPENDENCY = "api_dependency"
    TEAM_DEPENDENCY = "team_dependency"


class AnalysisType(str, Enum):
    """Cross-project analysis types."""

    DEPENDENCY = "dependency"
    SIMILARITY = "similarity"
    PERFORMANCE = "performance"
    QUALITY = "quality"
    TREND = "trend"
    BOTTLENECK = "bottleneck"
    COLLABORATION = "collaboration"


# ============ Owner & Settings Models ============


class ProjectOwner(BaseModel):
    """Project owner information."""

    user_id: str
    name: str
    email: str
    team_id: str | None = None
    team_name: str | None = None
    role: ProjectRole = ProjectRole.OWNER


class QuietHours(BaseModel):
    """Quiet hours configuration."""

    enabled: bool = False
    start_time: str = "22:00"  # HH:mm format
    end_time: str = "08:00"
    timezone: str = "UTC"


class NotificationChannel(BaseModel):
    """Notification channel configuration."""

    type: str  # 'email', 'slack', 'webhook', 'dashboard'
    enabled: bool = True
    config: dict[str, Any] = Field(default_factory=dict)


class NotificationRule(BaseModel):
    """Notification rule definition."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    condition: str
    action: str
    enabled: bool = True
    priority: str = "medium"  # 'low', 'medium', 'high', 'critical'


class NotificationSettings(BaseModel):
    """Notification settings."""

    enabled: bool = True
    channels: list[NotificationChannel] = Field(default_factory=list)
    rules: list[NotificationRule] = Field(default_factory=list)
    quiet_hours: QuietHours | None = None


class OfflineQueueSettings(BaseModel):
    """Offline queue configuration."""

    enabled: bool = True
    max_size: int = 1000
    retention: int = 7  # days


class SyncSettings(BaseModel):
    """Synchronization settings."""

    enabled: bool = False
    interval: int = 300  # seconds
    batch_size: int = 100
    auto_sync: bool = False
    conflict_resolution: ConflictResolutionStrategy = ConflictResolutionStrategy.LAST_WRITE_WINS
    offline_queue: OfflineQueueSettings = Field(default_factory=OfflineQueueSettings)


class ReportSection(BaseModel):
    """Report section configuration."""

    type: str  # 'metrics', 'analysis', 'trends', 'issues'
    config: dict[str, Any] = Field(default_factory=dict)


class ReportTemplate(BaseModel):
    """Report template definition."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    type: str = "custom"  # 'daily', 'weekly', 'monthly', 'custom'
    sections: list[ReportSection] = Field(default_factory=list)
    enabled: bool = True


class ReportSchedule(BaseModel):
    """Report schedule configuration."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    template_id: str
    frequency: str = "weekly"  # 'daily', 'weekly', 'monthly'
    time: str = "09:00"
    recipients: list[str] = Field(default_factory=list)
    enabled: bool = True


class ReportingSettings(BaseModel):
    """Reporting configuration."""

    auto_generate: bool = False
    templates: list[ReportTemplate] = Field(default_factory=list)
    schedules: list[ReportSchedule] = Field(default_factory=list)
    formats: list[str] = Field(default_factory=lambda: ["json"])  # 'pdf', 'html', 'markdown', 'json'


class FileFilter(BaseModel):
    """File filter configuration."""

    include_extensions: list[str] = Field(
        default_factory=lambda: [".ts", ".js", ".jsx", ".tsx", ".py", ".java", ".go", ".rs"]
    )
    exclude_extensions: list[str] = Field(default_factory=lambda: [".log", ".tmp", ".cache"])
    include_paths: list[str] = Field(default_factory=lambda: ["src/", "lib/", "app/"])
    exclude_paths: list[str] = Field(
        default_factory=lambda: ["node_modules/", ".git/", "dist/", "build/", "__pycache__/"]
    )
    max_file_size: int = 1024 * 1024  # 1MB


class EventFilter(BaseModel):
    """Event filter configuration."""

    include_types: list[str] = Field(default_factory=list)
    exclude_types: list[str] = Field(default_factory=list)
    min_severity: str = "info"  # 'debug', 'info', 'warning', 'error', 'critical'


class AnalysisFilter(BaseModel):
    """Analysis filter configuration."""

    time_window: int = 30  # days
    min_confidence: float = 0.7
    patterns: list[str] = Field(default_factory=list)


class FilterSettings(BaseModel):
    """Combined filter settings."""

    files: FileFilter = Field(default_factory=FileFilter)
    events: EventFilter = Field(default_factory=EventFilter)
    analysis: AnalysisFilter = Field(default_factory=AnalysisFilter)


class ProjectSettings(BaseModel):
    """Project settings."""

    monitoring_enabled: bool = True
    auto_analysis_enabled: bool = True
    notifications: NotificationSettings = Field(default_factory=NotificationSettings)
    sync: SyncSettings = Field(default_factory=SyncSettings)
    reporting: ReportingSettings = Field(default_factory=ReportingSettings)
    filters: FilterSettings = Field(default_factory=FilterSettings)
    custom: dict[str, Any] = Field(default_factory=dict)


class ProjectPaths(BaseModel):
    """Project path configuration."""

    root: str
    source: list[str] = Field(default_factory=list)
    test: list[str] = Field(default_factory=list)
    docs: list[str] = Field(default_factory=list)
    build: list[str] = Field(default_factory=list)
    config: list[str] = Field(default_factory=list)


class RepositoryStatus(BaseModel):
    """Repository status information."""

    modified_files: int = 0
    staged_files: int = 0
    added_files: int = 0
    deleted_files: int = 0
    untracked_files: int = 0
    ahead: int = 0
    behind: int = 0


class RepositoryInfo(BaseModel):
    """Repository information."""

    type: str = "git"  # 'git', 'svn', 'mercurial'
    remote_url: str = ""
    default_branch: str = "main"
    current_branch: str = "main"
    last_commit: str = ""
    last_commit_time: int = 0
    status: RepositoryStatus = Field(default_factory=RepositoryStatus)


# ============ Project Model ============


class ProjectMetadata(BaseModel):
    """
    Complete project metadata.

    Contains all information about a project including identification,
    configuration, paths, and repository information.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    description: str | None = None
    version: str = "1.0.0"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    status: ProjectStatus = ProjectStatus.DEVELOPMENT
    type: ProjectType = ProjectType.OTHER
    priority: ProjectPriority = ProjectPriority.MEDIUM
    tags: list[str] = Field(default_factory=list)
    owner: ProjectOwner
    settings: ProjectSettings = Field(default_factory=ProjectSettings)
    paths: ProjectPaths
    repository: RepositoryInfo | None = None

    class Config:
        """Pydantic configuration."""

        use_enum_values = True


# ============ Metrics Models ============


class CodeMetrics(BaseModel):
    """Code-related metrics."""

    total_lines: int = 0
    code_lines: int = 0
    comment_lines: int = 0
    blank_lines: int = 0
    file_count: int = 0
    function_count: int = 0
    class_count: int = 0
    complexity: float = 0.0
    duplication: float = 0.0


class ActivityMetrics(BaseModel):
    """Activity-related metrics."""

    commits: int = 0
    active_time: int = 0  # minutes
    file_changes: int = 0
    lines_added: int = 0
    lines_deleted: int = 0
    builds: int = 0
    test_runs: int = 0


class QualityMetrics(BaseModel):
    """Quality-related metrics."""

    test_coverage: float = 0.0
    test_success_rate: float = 0.0
    code_quality: float = 0.0
    bug_count: int = 0
    vulnerabilities: int = 0
    technical_debt: float = 0.0


class PerformanceMetrics(BaseModel):
    """Performance-related metrics."""

    build_time: float = 0.0  # seconds
    test_time: float = 0.0  # seconds
    cicd_time: float = 0.0  # seconds
    memory_usage: float = 0.0  # MB
    cpu_usage: float = 0.0  # percentage


class TeamMetrics(BaseModel):
    """Team-related metrics."""

    active_developers: int = 0
    avg_commit_size: float = 0.0
    code_review_rate: float = 0.0
    collaboration_score: float = 0.0


class ProjectMetrics(BaseModel):
    """Complete project metrics."""

    project_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    code: CodeMetrics = Field(default_factory=CodeMetrics)
    activity: ActivityMetrics = Field(default_factory=ActivityMetrics)
    quality: QualityMetrics = Field(default_factory=QualityMetrics)
    performance: PerformanceMetrics = Field(default_factory=PerformanceMetrics)
    team: TeamMetrics = Field(default_factory=TeamMetrics)


# ============ Analysis Models ============


class AnalysisResult(BaseModel):
    """Single analysis result."""

    type: str
    score: float
    confidence: float
    data: dict[str, Any] = Field(default_factory=dict)
    description: str


class Insight(BaseModel):
    """Analysis insight."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    description: str
    importance: str = "medium"  # 'low', 'medium', 'high', 'critical'
    category: str
    data: dict[str, Any] = Field(default_factory=dict)


class ActionItem(BaseModel):
    """Recommendation action item."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    description: str
    completed: bool = False
    assignee: str | None = None
    due_date: datetime | None = None


class Recommendation(BaseModel):
    """Analysis recommendation."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    description: str
    priority: ProjectPriority = ProjectPriority.MEDIUM
    impact: str = "medium"  # 'low', 'medium', 'high'
    effort: str = "medium"  # 'low', 'medium', 'high'
    affected_projects: list[str] = Field(default_factory=list)
    actions: list[ActionItem] = Field(default_factory=list)

    class Config:
        """Pydantic configuration."""

        use_enum_values = True


class CrossProjectAnalysis(BaseModel):
    """Cross-project analysis results."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    projects: list[str]
    type: AnalysisType
    results: list[AnalysisResult] = Field(default_factory=list)
    insights: list[Insight] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)

    class Config:
        """Pydantic configuration."""

        use_enum_values = True


# ============ Dependency Models ============


class ProjectDependency(BaseModel):
    """Project dependency relationship."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    source_project_id: str
    target_project_id: str
    type: DependencyType
    strength: float
    description: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        """Pydantic configuration."""

        use_enum_values = True


# ============ Portfolio Models ============


class TechStackItem(BaseModel):
    """Technology stack item."""

    name: str
    project_count: int
    percentage: float


class PortfolioMetrics(BaseModel):
    """Portfolio-level metrics."""

    total_projects: int = 0
    active_projects: int = 0
    avg_code_quality: float = 0.0
    avg_test_coverage: float = 0.0
    total_developers: int = 0
    total_code_lines: int = 0
    avg_monthly_commits: float = 0.0
    tech_stack: list[TechStackItem] = Field(default_factory=list)


class ProjectPortfolio(BaseModel):
    """Project portfolio definition."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    description: str | None = None
    owner: ProjectOwner
    projects: list[str] = Field(default_factory=list)
    metrics: PortfolioMetrics = Field(default_factory=PortfolioMetrics)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ============ Sync Models ============


class SyncEvent(BaseModel):
    """Synchronization event."""

    sync_id: str = Field(default_factory=lambda: str(uuid4()))
    local_id: int
    device_id: str
    user_id: str
    project_id: str
    event_type: str
    event_data: dict[str, Any] = Field(default_factory=dict)
    sync_status: SyncStatus = SyncStatus.PENDING
    sync_attempts: int = 0
    last_sync_error: str | None = None
    synced_at: datetime | None = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        """Pydantic configuration."""

        use_enum_values = True


class SyncResult(BaseModel):
    """Synchronization result."""

    success: bool
    synced_ids: list[str] = Field(default_factory=list)
    failed_ids: list[str] = Field(default_factory=list)
    errors: list[dict[str, Any]] = Field(default_factory=list)
    duration: float = 0.0  # milliseconds
    bytes_transferred: int = 0


class SyncError(BaseModel):
    """Synchronization error."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    event_id: str
    type: str  # 'network', 'auth', 'validation', 'conflict', 'server', 'unknown'
    message: str
    code: str | None = None
    retryable: bool = True
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ============ Configuration Models ============


class CrossAnalyzerConfig(BaseModel):
    """Cross-project analyzer configuration."""

    min_confidence: float = 0.7
    time_window: int = 30  # days
    max_concurrent_analysis: int = 3
    similarity_weights: dict[str, float] = Field(
        default_factory=lambda: {
            "tech_stack": 0.3,
            "code_style": 0.2,
            "project_structure": 0.2,
            "dependencies": 0.2,
            "team_members": 0.1,
        }
    )
    performance_thresholds: dict[str, float] = Field(
        default_factory=lambda: {
            "build_time": 300.0,  # 5 minutes
            "test_time": 120.0,  # 2 minutes
            "code_quality": 80.0,
            "test_coverage": 80.0,
        }
    )


class SyncConfig(BaseModel):
    """Sync client configuration."""

    enabled: bool = True
    endpoint: str = "http://localhost:3000/api"
    api_key: str = ""
    user_id: str = ""
    device_id: str = Field(default_factory=lambda: str(uuid4()))
    interval: int = 300  # seconds
    batch_size: int = 100
    max_retries: int = 3
    retry_delay: int = 1000  # milliseconds
    conflict_resolution: ConflictResolutionStrategy = ConflictResolutionStrategy.LAST_WRITE_WINS
    compression: bool = True
    max_queue_size: int = 10000

    class Config:
        """Pydantic configuration."""

        use_enum_values = True


class ProjectManagerConfig(BaseModel):
    """Project manager configuration."""

    db_path: str | None = None
    auto_discovery: bool = True
    search_paths: list[str] = Field(default_factory=lambda: ["."])
    default_settings: ProjectSettings = Field(default_factory=ProjectSettings)
    metrics_interval: int = 60000  # milliseconds
    analysis_interval: int = 300000  # milliseconds
    max_concurrent_analysis: int = 3


class MultiProjectSystemConfig(BaseModel):
    """Multi-project system configuration."""

    project_manager: ProjectManagerConfig = Field(default_factory=ProjectManagerConfig)
    sync_client: SyncConfig | None = None
    cross_analyzer: CrossAnalyzerConfig = Field(default_factory=CrossAnalyzerConfig)
    db_path: str | None = None
    log_level: str = "info"
