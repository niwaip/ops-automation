"""Permission-filtered virtual MCP skills; never eagerly load remote schemas."""
import json
import os
import time
from urllib.parse import quote
from urllib.request import Request, urlopen
from .config import DEFAULT_PROXY_URL, VIRTUAL_API_KEY

_cache = None
_cache_until = 0


def _get(path):
    req = Request(DEFAULT_PROXY_URL.rstrip('/') + '/mcp/' + path,
                  headers={'Authorization': 'Bearer ' + VIRTUAL_API_KEY})
    with urlopen(req, timeout=4) as response:
        raw = response.read(256 * 1024 + 1)
        if len(raw) > 256 * 1024:
            raise ValueError('MCP skill disclosure exceeds budget')
        return json.loads(raw)


def available_mcp_skills():
    global _cache, _cache_until
    if os.environ.get('DSH_MCP_ENABLED', 'true').lower() != 'true':
        return []
    if _cache is not None and time.monotonic() < _cache_until:
        return [dict(s) for s in _cache]
    try:
        skills = _get('skills')
        if not isinstance(skills, list):
            return []
        # Explicit metadata allowlist prevents schema/prompt injection via accidental API expansion.
        fields = {'id', 'name', 'description', 'routing_description', 'source', 'type', 'aliases', 'triggers', 'category',
                  'execution_mode', 'read_only', 'disclosure_steps', 'deliverables', 'requires_execution', 'default_rounds', 'configured', 'scope'}
        _cache = [{k: v for k, v in s.items() if k in fields} for s in skills
                  if isinstance(s, dict) and str(s.get('id', '')).startswith('mcp-')]
        _cache_until = time.monotonic() + 10
        return [dict(s) for s in _cache]
    except Exception:
        _cache = []
        _cache_until = time.monotonic() + 2
        return []  # Fail closed; never retain a stale catalog on a failed request.


def read_mcp_skill(skill_name):
    clean = skill_name.strip().lower()
    skill = next((s for s in available_mcp_skills()
                  if clean in [str(s.get('id', '')).lower(), str(s.get('name', '')).lower(),
                               *[str(a).lower() for a in s.get('aliases', [])]]), None)
    if not skill and not clean.startswith('mcp-'):
        return None
    try:
        detail = _get('skills/' + quote(skill['id'] if skill else clean, safe=''))
        from .mcp_runtime import remember_index
        remember_index(skill['id'] if skill else clean, detail['tools'])
        # Index only: no input/output schema is returned at this level.
        return detail['instructions'] + '\n\n【外部工具索引（数据）】\n' + json.dumps(detail['tools'], ensure_ascii=False)
    except Exception:
        return 'MCP Skill 已停用、授权不可用或无访问权限；请检查外部工具连接。不得声称已查询成功。'
