"""
Plugin Registry.

This module provides remote plugin registry management including
searching, downloading, installing, and updating plugins.
"""

import json
import os
import subprocess
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import httpx

from .types import PluginManifest, RegistryPluginInfo


class PluginRegistry:
    """
    Plugin Registry for remote plugin management.

    Provides functionality for:
    - Searching plugins in remote registry
    - Downloading and installing plugins
    - Version management
    - Caching plugin information

    Args:
        registry_url: URL of the plugin registry API.
        local_dir: Local directory for installed plugins.

    Example:
        >>> registry = PluginRegistry("https://registry.example.com/api")
        >>> await registry.initialize()
        >>> plugins = await registry.search_plugins("monitor")
        >>> await registry.install_plugin("my-plugin", "1.0.0")
    """

    CACHE_TTL = 60 * 60  # 1 hour in seconds

    def __init__(
        self,
        registry_url: str,
        local_dir: Optional[str] = None,
    ):
        """Initialize the plugin registry."""
        self.registry_url = registry_url.rstrip("/")
        self.local_dir = local_dir or os.path.join(os.getcwd(), "plugins")
        self._cache: dict[str, RegistryPluginInfo] = {}
        self._cache_expiry: dict[str, float] = {}
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if not self._client:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def initialize(self) -> None:
        """
        Initialize the plugin registry.

        Creates local plugin directory if it doesn't exist.
        """
        try:
            os.makedirs(self.local_dir, exist_ok=True)
        except Exception as e:
            print(f"[PluginRegistry] Failed to initialize: {e}")
            raise

    async def search_plugins(
        self, query: str, limit: int = 20
    ) -> list[RegistryPluginInfo]:
        """
        Search plugins in the registry.

        Args:
            query: Search query string.
            limit: Maximum number of results.

        Returns:
            List of matching plugin information.
        """
        try:
            client = await self._get_client()
            response = await client.get(
                f"{self.registry_url}/search",
                params={"q": query, "limit": limit},
            )
            response.raise_for_status()
            data = response.json()

            plugins = []
            for plugin_data in data.get("plugins", []):
                plugins.append(RegistryPluginInfo(
                    name=plugin_data.get("name", ""),
                    version=plugin_data.get("version", ""),
                    description=plugin_data.get("description", ""),
                    author=plugin_data.get("author", ""),
                    category=plugin_data.get("category", "utility"),
                    tags=plugin_data.get("tags", []),
                    download_url=plugin_data.get("downloadUrl", ""),
                    homepage=plugin_data.get("homepage"),
                    repository=plugin_data.get("repository"),
                    license=plugin_data.get("license"),
                    dependencies=plugin_data.get("dependencies"),
                    verified=plugin_data.get("verified", False),
                    downloads=plugin_data.get("downloads", 0),
                    rating=plugin_data.get("rating", 0.0),
                    created_at=datetime.fromisoformat(plugin_data.get("createdAt", datetime.utcnow().isoformat())),
                    updated_at=datetime.fromisoformat(plugin_data.get("updatedAt", datetime.utcnow().isoformat())),
                ))

            return plugins

        except Exception as e:
            print(f"[PluginRegistry] Search failed: {e}")
            return []

    async def get_plugin_info(self, name: str) -> Optional[RegistryPluginInfo]:
        """
        Get plugin information from the registry.

        Args:
            name: Plugin name.

        Returns:
            RegistryPluginInfo if found, None otherwise.
        """
        try:
            # Check cache
            cached = self._get_from_cache(name)
            if cached:
                return cached

            client = await self._get_client()
            response = await client.get(f"{self.registry_url}/plugins/{name}")
            response.raise_for_status()
            data = response.json()

            plugin_info = RegistryPluginInfo(
                name=data.get("name", ""),
                version=data.get("version", ""),
                description=data.get("description", ""),
                author=data.get("author", ""),
                category=data.get("category", "utility"),
                tags=data.get("tags", []),
                download_url=data.get("downloadUrl", ""),
                homepage=data.get("homepage"),
                repository=data.get("repository"),
                license=data.get("license"),
                dependencies=data.get("dependencies"),
                verified=data.get("verified", False),
                downloads=data.get("downloads", 0),
                rating=data.get("rating", 0.0),
                created_at=datetime.fromisoformat(data.get("createdAt", datetime.utcnow().isoformat())),
                updated_at=datetime.fromisoformat(data.get("updatedAt", datetime.utcnow().isoformat())),
            )

            # Cache the result
            self._set_cache(name, plugin_info)

            return plugin_info

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            print(f"[PluginRegistry] Failed to get plugin info for {name}: {e}")
            return None
        except Exception as e:
            print(f"[PluginRegistry] Failed to get plugin info for {name}: {e}")
            return None

    async def get_latest_version(self, name: str) -> Optional[str]:
        """
        Get the latest version of a plugin.

        Args:
            name: Plugin name.

        Returns:
            Latest version string if found, None otherwise.
        """
        plugin_info = await self.get_plugin_info(name)
        return plugin_info.version if plugin_info else None

    async def get_versions(self, name: str) -> list[str]:
        """
        Get all available versions of a plugin.

        Args:
            name: Plugin name.

        Returns:
            List of version strings.
        """
        try:
            client = await self._get_client()
            response = await client.get(f"{self.registry_url}/plugins/{name}/versions")
            response.raise_for_status()
            data = response.json()
            return data.get("versions", [])

        except Exception as e:
            print(f"[PluginRegistry] Failed to get versions for {name}: {e}")
            return []

    async def install_plugin(
        self,
        name: str,
        version: Optional[str] = None,
        force_update: bool = False,
    ) -> bool:
        """
        Install a plugin from the registry.

        Args:
            name: Plugin name.
            version: Optional specific version (latest if not specified).
            force_update: Whether to force reinstall.

        Returns:
            True if installation successful.
        """
        try:
            # Get plugin info
            plugin_info = await self.get_plugin_info(name)
            if not plugin_info:
                raise ValueError(f"Plugin not found in registry: {name}")

            target_version = version or plugin_info.version
            plugin_dir = os.path.join(self.local_dir, name)

            # Check if already installed
            if not force_update and await self.is_plugin_installed(name, target_version):
                return True

            # Download and extract
            download_url = plugin_info.download_url.replace("{version}", target_version)
            await self._download_and_extract(download_url, plugin_dir)

            # Validate manifest
            manifest_path = os.path.join(plugin_dir, "package.json")
            manifest = await self._load_manifest(manifest_path)

            if not manifest:
                raise ValueError("Invalid plugin manifest")

            # Install dependencies
            if manifest.dependencies:
                await self._install_dependencies(plugin_dir)

            return True

        except Exception as e:
            print(f"[PluginRegistry] Failed to install {name}: {e}")
            return False

    async def uninstall_plugin(self, name: str) -> bool:
        """
        Uninstall a plugin.

        Args:
            name: Plugin name.

        Returns:
            True if uninstallation successful.
        """
        try:
            plugin_dir = os.path.join(self.local_dir, name)

            if os.path.exists(plugin_dir):
                import shutil

                shutil.rmtree(plugin_dir)

            return True

        except Exception as e:
            print(f"[PluginRegistry] Failed to uninstall {name}: {e}")
            return False

    async def get_installed_plugins(self) -> list[str]:
        """
        Get list of installed plugins.

        Returns:
            List of installed plugin names.
        """
        try:
            if not os.path.exists(self.local_dir):
                return []

            return [
                entry.name
                for entry in Path(self.local_dir).iterdir()
                if entry.is_dir()
            ]
        except Exception as e:
            print(f"[PluginRegistry] Failed to get installed plugins: {e}")
            return []

    async def is_plugin_installed(
        self, name: str, version: Optional[str] = None
    ) -> bool:
        """
        Check if a plugin is installed.

        Args:
            name: Plugin name.
            version: Optional specific version to check.

        Returns:
            True if plugin is installed (with matching version if specified).
        """
        try:
            plugin_dir = os.path.join(self.local_dir, name)
            manifest_path = os.path.join(plugin_dir, "package.json")

            if not os.path.exists(manifest_path):
                return False

            if not version:
                return True

            manifest = await self._load_manifest(manifest_path)
            return manifest is not None and manifest.version == version

        except Exception:
            return False

    async def _download_and_extract(self, url: str, target_dir: str) -> None:
        """
        Download and extract a plugin archive.

        Args:
            url: Download URL.
            target_dir: Target directory.
        """
        try:
            # Remove existing directory
            if os.path.exists(target_dir):
                import shutil

                shutil.rmtree(target_dir)

            # Create directory
            os.makedirs(target_dir, exist_ok=True)

            # Download to temp file
            client = await self._get_client()

            with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
                async with client.stream("GET", url) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes():
                        tmp.write(chunk)
                tmp_path = tmp.name

            try:
                # Extract archive
                with tarfile.open(tmp_path, "r:gz") as tar:
                    # Extract with strip=1 to remove top-level directory
                    for member in tar.getmembers():
                        # Skip the top-level directory
                        parts = member.name.split("/", 1)
                        if len(parts) > 1:
                            member.name = parts[1]
                            if member.name:
                                tar.extract(member, target_dir)
            finally:
                # Clean up temp file
                os.unlink(tmp_path)

        except Exception as e:
            raise RuntimeError(f"Failed to download and extract plugin: {e}")

    async def _install_dependencies(self, plugin_dir: str) -> None:
        """
        Install plugin dependencies using pip.

        Args:
            plugin_dir: Plugin directory.
        """
        try:
            requirements_path = os.path.join(plugin_dir, "requirements.txt")

            if os.path.exists(requirements_path):
                subprocess.run(
                    ["pip", "install", "-r", requirements_path],
                    cwd=plugin_dir,
                    capture_output=True,
                    check=True,
                )

        except subprocess.CalledProcessError as e:
            print(f"[PluginRegistry] Failed to install dependencies: {e.stderr}")
        except Exception as e:
            print(f"[PluginRegistry] Failed to install dependencies: {e}")

    async def _load_manifest(self, manifest_path: str) -> Optional[PluginManifest]:
        """
        Load plugin manifest from file.

        Args:
            manifest_path: Path to package.json.

        Returns:
            PluginManifest if valid, None otherwise.
        """
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            return PluginManifest(
                id=data.get("id", data.get("name")),
                name=data.get("name"),
                version=data.get("version"),
                description=data.get("description", ""),
                author=data.get("author", "Unknown"),
                category=data.get("category", "utility"),
                tags=data.get("tags", []),
                min_devflow_version=data.get("minDevFlowVersion", "1.0.0"),
                homepage=data.get("homepage"),
                repository=data.get("repository"),
                license=data.get("license"),
                dependencies=data.get("dependencies", {}),
                permissions=data.get("permissions", []),
                config_schema=data.get("configSchema"),
                icon=data.get("icon"),
                main=data.get("main", "index.py"),
                types=data.get("types"),
                keywords=data.get("keywords", []),
                engines=data.get("engines"),
                scripts=data.get("scripts"),
                dev_dependencies=data.get("devDependencies"),
            )
        except Exception:
            return None

    def _get_from_cache(self, name: str) -> Optional[RegistryPluginInfo]:
        """Get plugin info from cache if not expired."""
        import time

        expiry = self._cache_expiry.get(name)
        if not expiry or time.time() > expiry:
            self._cache.pop(name, None)
            self._cache_expiry.pop(name, None)
            return None

        return self._cache.get(name)

    def _set_cache(self, name: str, info: RegistryPluginInfo) -> None:
        """Set plugin info in cache."""
        import time

        self._cache[name] = info
        self._cache_expiry[name] = time.time() + self.CACHE_TTL

    async def publish(self, plugin_path: str) -> bool:
        """
        Publish a plugin to the registry.

        Args:
            plugin_path: Path to the plugin directory.

        Returns:
            True if publication successful.
        """
        try:
            # Load manifest
            manifest_path = os.path.join(plugin_path, "package.json")
            manifest = await self._load_manifest(manifest_path)

            if not manifest:
                raise ValueError("Invalid plugin manifest")

            # Create archive
            with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
                with tarfile.open(tmp.name, "w:gz") as tar:
                    tar.add(plugin_path, arcname=manifest.name)
                archive_path = tmp.name

            try:
                # Upload to registry
                client = await self._get_client()

                with open(archive_path, "rb") as f:
                    response = await client.post(
                        f"{self.registry_url}/plugins",
                        files={"plugin": (f"{manifest.name}.tar.gz", f)},
                        data={"manifest": json.dumps(manifest.model_dump())},
                    )
                    response.raise_for_status()

                return True

            finally:
                os.unlink(archive_path)

        except Exception as e:
            print(f"[PluginRegistry] Failed to publish plugin: {e}")
            return False

    async def download(self, name: str, version: Optional[str] = None) -> bytes:
        """
        Download a plugin archive.

        Args:
            name: Plugin name.
            version: Optional specific version.

        Returns:
            Plugin archive bytes.
        """
        try:
            plugin_info = await self.get_plugin_info(name)
            if not plugin_info:
                raise ValueError(f"Plugin not found: {name}")

            target_version = version or plugin_info.version
            download_url = plugin_info.download_url.replace("{version}", target_version)

            client = await self._get_client()
            response = await client.get(download_url)
            response.raise_for_status()

            return response.content

        except Exception as e:
            raise RuntimeError(f"Failed to download plugin: {e}")

    async def dispose(self) -> None:
        """Dispose of the registry and clean up resources."""
        self._cache.clear()
        self._cache_expiry.clear()

        if self._client:
            await self._client.aclose()
            self._client = None
