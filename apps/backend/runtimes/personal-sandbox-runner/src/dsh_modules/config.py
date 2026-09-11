"""
Configuration and Environment constants for DeepSeek Harness (dsh).
"""

import os
import sys
import json
import subprocess
from pathlib import Path

VERSION = "1.3.0-sandbox"
DEFAULT_CONFIG_PATH = "/home/sandbox/.dsh/config.json"
DEFAULT_PROXY_URL = os.environ.get("DEEPSEEK_BASE_URL", "http://ops-ai-orchestrator:3007/ai/proxy/v1")
VIRTUAL_API_KEY = os.environ.get("DEEPSEEK_API_KEY", os.environ.get("OPENAI_API_KEY", "sandbox-user-token-local"))
WORKSPACE_DIR = os.environ.get("WORKSPACE", "/workspace")
KNOWLEDGE_DIR = os.environ.get("KNOWLEDGE_DIR", "/knowledge")
PLUGIN_DIR = os.environ.get("DSH_PLUGIN_DIR", "/opt/dsh/plugins")
SKILL_DIR = os.environ.get("DSH_SKILL_DIR", "/opt/dsh/skills")
CUSTOM_SKILL_DIR = os.environ.get("DSH_CUSTOM_SKILL_DIR", "/knowledge/skills")


def print_banner():
    container_id = os.environ.get("HOSTNAME", "local-sandbox")[:12]
    user = os.environ.get("USER", "sandbox")
    print(f"⚡ [DeepSeek Harness v{VERSION} | Sandbox: {container_id} | User: {user} | Mode: Personal]")


def cmd_version(args):
    print_banner()
    print(f"DeepSeek Harness CLI (dsh) version {VERSION}")
    print(f"Python: {sys.version.split()[0]} | Node: {subprocess.getoutput('node -v 2>/dev/null') or 'N/A'}")
    print(f"Workspace: {WORKSPACE_DIR}")
    print(f"Knowledge Space: {KNOWLEDGE_DIR} (Read-Write)")
    print(f"User Custom Skills: {CUSTOM_SKILL_DIR}")
    print(f"Managed Plugins: {PLUGIN_DIR}")
    print(f"Certified Skills: {SKILL_DIR}")


def cmd_info(args):
    print_banner()
    config = {}
    if os.path.exists(DEFAULT_CONFIG_PATH):
        try:
            with open(DEFAULT_CONFIG_PATH, "r", encoding="utf-8") as f:
                config = json.load(f)
        except Exception:
            pass

    knowledge_files = list(Path(KNOWLEDGE_DIR).glob("**/*")) if os.path.exists(KNOWLEDGE_DIR) else []
    knowledge_files = [f for f in knowledge_files if f.is_file()]

    plugin_list = []
    if os.path.exists(PLUGIN_DIR):
        plugin_list = [p.name for p in Path(PLUGIN_DIR).iterdir() if not p.name.startswith(".")]

    skill_list = []
    if os.path.exists(SKILL_DIR):
        skill_list = [s.name for s in Path(SKILL_DIR).iterdir() if s.is_dir() and not s.name.startswith(".")]

    custom_skills = []
    if os.path.exists(CUSTOM_SKILL_DIR):
        custom_skills = [s.name for s in Path(CUSTOM_SKILL_DIR).iterdir() if s.is_dir() and not s.name.startswith(".")]

    print(f"Model Gateway: {DEFAULT_PROXY_URL}")
    print(f"Managed Config: {DEFAULT_CONFIG_PATH} ({'Active' if config else 'Default fallback'})")
    print(f"Knowledge Base: {KNOWLEDGE_DIR} ({len(knowledge_files)} items available, Read-Write)")
    print(f"User Custom Skills: {CUSTOM_SKILL_DIR} ({len(custom_skills)} installed: {', '.join(custom_skills) if custom_skills else 'None'})")
    print(f"Managed System Plugins: {len(plugin_list)} active: {', '.join(plugin_list) if plugin_list else 'None'}")
    print(f"Certified Design & Slide Skills: {len(skill_list)} installed: {', '.join(skill_list) if skill_list else 'None'}")
    print(f"Workspace Path: {WORKSPACE_DIR} (Read-Write)")


def cmd_plugins(args):
    print_banner()
    if not os.path.exists(PLUGIN_DIR):
        print(f"Plugin directory {PLUGIN_DIR} not found.")
        return

    plugins = [p.name for p in Path(PLUGIN_DIR).iterdir() if not p.name.startswith(".")]
    if not plugins:
        print("No managed plugins installed. Certified plugins are distributed centrally by administrators.")
    else:
        print(f"Found {len(plugins)} certified plugins in {PLUGIN_DIR}:")
        for p in sorted(plugins):
            print(f" - {p}")
