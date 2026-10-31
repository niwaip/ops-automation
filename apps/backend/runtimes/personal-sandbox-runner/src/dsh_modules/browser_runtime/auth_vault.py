"""
Authentication and Session State Vault for DeepSeek Harness (dsh).
Manages Playwright standard storageState (Cookies, LocalStorage) per site/domain.
Enforces strict security boundary: prevents sending authenticated requests or private tokens
to external third-party fallback services like Jina Reader.
"""

import os
import json
import urllib.parse
from pathlib import Path
from typing import Optional, Dict, Any, List

AUTH_VAULT_DIRS = [
    Path(os.environ.get("DSH_AUTH_VAULT_DIR", "/workspace/.auth")),
    Path("/home/sandbox/.dsh/auth"),
    Path(os.path.expanduser("~/.dsh/auth"))
]


def extract_site_domain(url_or_domain: str) -> str:
    """Extracts base registered host/domain for auth lookup (e.g. 'weibo.com', 'zhihu.com')"""
    clean = url_or_domain.strip().lower()
    if clean.startswith(("http://", "https://")):
        parsed = urllib.parse.urlparse(clean)
        clean = (parsed.hostname or "").lower()
    return clean


class AuthVault:
    """
    Standardized session state manager.
    Locates and safely injects Playwright storageState JSON configurations.
    """

    def __init__(self, search_paths: Optional[List[Path]] = None):
        self.search_paths = search_paths or AUTH_VAULT_DIRS

    def find_auth_file(self, target_site: str) -> Optional[Path]:
        """Locates storageState file for given domain or site identifier"""
        hostname = extract_site_domain(target_site)
        parts = hostname.split(".")

        candidate_names = [
            f"{hostname}.json",
            f"{target_site}.json",
            f"{hostname}.auth.json",
        ]

        # 尝试提取主域名 (例如 m.weibo.cn -> weibo.cn, www.weibo.com -> weibo.com)
        if len(parts) >= 2:
            root_domain = ".".join(parts[-2:])
            candidate_names.append(f"{root_domain}.json")
            candidate_names.append(f"{root_domain}.auth.json")
            # 兼容微博等跨主域（weibo.cn 匹配 weibo.com）
            org_name = parts[-2]
            if org_name in ("weibo", "zhihu", "bilibili", "github", "google"):
                candidate_names.append(f"{org_name}.com.json")
                candidate_names.append(f"{org_name}.json")

        if len(parts) >= 3 and parts[-1] == "cn" and parts[-2] in ("com", "net", "org", "gov", "edu"):
            root_domain = ".".join(parts[-3:])
            candidate_names.append(f"{root_domain}.json")

        candidate_names.append("default_auth.json")

        for base_dir in self.search_paths:
            if not base_dir.exists():
                continue
            for name in candidate_names:
                candidate = base_dir / name
                if candidate.is_file():
                    return candidate
        return None

    def load_storage_state(self, target_site: str) -> Optional[Dict[str, Any]]:
        """Loads and validates Playwright storageState dictionary"""
        filepath = self.find_auth_file(target_site)
        if not filepath:
            return None
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and ("cookies" in data or "origins" in data):
                return data
        except Exception:
            return None
        return None

    def has_credentials(self, target_site: str) -> bool:
        """Returns whether a valid credential file exists for target site"""
        return self.find_auth_file(target_site) is not None

    @staticmethod
    def is_authenticated_request(auth_state: Optional[Dict[str, Any]]) -> bool:
        """Determines whether a request carries private authentication credentials"""
        if not auth_state or not isinstance(auth_state, dict):
            return False
        cookies = auth_state.get("cookies", [])
        origins = auth_state.get("origins", [])
        return bool(cookies or origins)

    @staticmethod
    def assert_safe_for_external_fallback(
        url: str,
        auth_state: Optional[Dict[str, Any]] = None,
        is_private_context: bool = False
    ) -> bool:
        """
        Security Wall:
        Returns True if request is public and safe to fall back to third-party Jina Reader.
        Returns False if request carries private cookies, tokens, or is classified as an authenticated session.
        """
        if is_private_context:
            return False
        if AuthVault.is_authenticated_request(auth_state):
            return False

        # 检查 URL 是否包含私密敏感 query 参数 (token, ticket, access_token, auth_code 等)
        parsed = urllib.parse.urlparse(url)
        query_lower = parsed.query.lower()
        sensitive_keywords = ["token=", "access_token=", "ticket=", "auth_code=", "session_id=", "secret="]
        if any(k in query_lower for k in sensitive_keywords):
            return False

        return True


# Global default instance
default_auth_vault = AuthVault()
