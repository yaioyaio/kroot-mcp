"""
Integrations Module.

This module provides API integrations for external services
including Jira, Notion, and Figma.
"""

from .base import (
    APIClientConfig,
    APIError,
    APIResponse,
    AuthConfig,
    AuthType,
    BaseAPIClient,
    RetryConfig,
)
from .figma import (
    FigmaClient,
    FigmaClientMeta,
    FigmaComment,
    FigmaConfig,
    FigmaFile,
    FigmaFileVersion,
    FigmaProject,
    FigmaTeam,
    FigmaUser,
)
from .jira import (
    JiraClient,
    JiraComponent,
    JiraConfig,
    JiraIssue,
    JiraIssueType,
    JiraLead,
    JiraPriority,
    JiraProject,
    JiraStatus,
    JiraUser,
)
from .manager import (
    APIIntegrationManager,
    IntegrationConfig,
    IntegrationStatus,
)
from .notion import (
    NotionBlock,
    NotionClient,
    NotionConfig,
    NotionCover,
    NotionDatabase,
    NotionIcon,
    NotionPage,
    NotionParent,
    NotionTitle,
    NotionTitleText,
    NotionUser,
)

__all__ = [
    # Base
    "APIClientConfig",
    "APIError",
    "APIResponse",
    "AuthConfig",
    "AuthType",
    "BaseAPIClient",
    "RetryConfig",
    # Jira
    "JiraClient",
    "JiraComponent",
    "JiraConfig",
    "JiraIssue",
    "JiraIssueType",
    "JiraLead",
    "JiraPriority",
    "JiraProject",
    "JiraStatus",
    "JiraUser",
    # Notion
    "NotionBlock",
    "NotionClient",
    "NotionConfig",
    "NotionCover",
    "NotionDatabase",
    "NotionIcon",
    "NotionPage",
    "NotionParent",
    "NotionTitle",
    "NotionTitleText",
    "NotionUser",
    # Figma
    "FigmaClient",
    "FigmaClientMeta",
    "FigmaComment",
    "FigmaConfig",
    "FigmaFile",
    "FigmaFileVersion",
    "FigmaProject",
    "FigmaTeam",
    "FigmaUser",
    # Manager
    "APIIntegrationManager",
    "IntegrationConfig",
    "IntegrationStatus",
]
