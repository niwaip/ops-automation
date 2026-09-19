"""
Skills scanning, discovery and template retrieval for DeepSeek Harness.
"""

from pathlib import Path
from .config import CUSTOM_SKILL_DIR, SKILL_DIR, print_banner


def get_available_skills() -> list:
    """Returns list of available skills with metadata from both custom skills and system certified skills"""
    skills = []
    seen_ids = set()

    skill_search_dirs = [
        (Path(CUSTOM_SKILL_DIR), "custom"),
        (Path(SKILL_DIR), "certified")
    ]

    for s_dir, skill_type in skill_search_dirs:
        if not s_dir.exists():
            continue
        for item in sorted(s_dir.iterdir()):
            if not item.is_dir() or item.name.startswith(".") or item.name in seen_ids:
                continue
            skill_file = item / "SKILL.md" if (item / "SKILL.md").exists() else item / "README.md"
            manifest_file = item / "manifest.json"
            triggers = []
            if manifest_file.exists():
                try:
                    import json
                    with open(manifest_file, "r", encoding="utf-8") as mf:
                        m_data = json.load(mf)
                        raw_trig = m_data.get("triggers") or m_data.get("keywords") or []
                        if isinstance(raw_trig, list):
                            triggers.extend([str(t).strip().lower() for t in raw_trig if t])
                except Exception:
                    pass

            meta = {
                "id": item.name,
                "name": item.name,
                "description": "",
                "type": skill_type,
                "path": str(item),
                "triggers": triggers,
                "aliases": [item.name.lower()]
            }
            if skill_file.exists():
                try:
                    with open(skill_file, "r", encoding="utf-8") as f:
                        content = f.read()
                        if content.startswith("---"):
                            parts = content.split("---", 2)
                            if len(parts) >= 3:
                                in_triggers = False
                                for line in parts[1].splitlines():
                                    s = line.strip()
                                    if s.startswith("name:"):
                                        raw_n = s.split(":", 1)[1].strip().strip('"\'').lower()
                                        if raw_n:
                                            meta["aliases"].append(raw_n)
                                        if meta["name"] == item.name:
                                            meta["name"] = s.split(":", 1)[1].strip().strip('"\'')
                                    elif s.startswith("zh_name:"):
                                        meta["name"] = s.split(":", 1)[1].strip().strip('"\'')
                                    elif s.startswith("zh_description:") or (s.startswith("description:") and not meta["description"]):
                                        desc_val = s.split(":", 1)[1].strip().strip('"\'')
                                        if desc_val not in ["|", ">"]:
                                            meta["description"] = desc_val
                                    elif s.startswith("triggers:") or s.startswith("keywords:"):
                                        in_triggers = True
                                        trig_val = s.split(":", 1)[1].strip().strip('[]')
                                        parts_trig = [t.strip().strip('"\'').lower() for t in trig_val.split(",") if t.strip()]
                                        meta["triggers"].extend(parts_trig)
                                    elif in_triggers and s.startswith("-"):
                                        item_trig = s.lstrip("-").strip().strip('"\'').lower()
                                        if item_trig:
                                            meta["triggers"].append(item_trig)
                                    elif s and not s.startswith("-") and ":" in s:
                                        in_triggers = False
                        if not meta["description"] or meta["description"] in ["|", ">"]:
                            body = parts[2] if len(parts) >= 3 else content
                            for line in body.splitlines():
                                line_t = line.strip()
                                if not line_t.startswith("#") and not line_t.startswith("---") and not line_t.startswith(">") and line_t:
                                    meta["description"] = line_t[:90]
                                    break
                except Exception:
                    pass
            meta["triggers"] = list(dict.fromkeys(meta["triggers"]))
            meta["aliases"] = list(dict.fromkeys(meta["aliases"]))
            skills.append(meta)
            seen_ids.add(item.name)
    return skills


def cmd_skills(args):
    print_banner()
    skills = get_available_skills()
    if not skills:
        print(f"No skills installed in {SKILL_DIR} or {CUSTOM_SKILL_DIR}.")
        return

    custom_skills = [s for s in skills if s.get("type") == "custom"]
    certified_skills = [s for s in skills if s.get("type") == "certified"]

    if custom_skills:
        print(f"📂 User Custom Skills in {CUSTOM_SKILL_DIR} ({len(custom_skills)} installed):")
        for s in custom_skills:
            desc = f" - {s['description']}" if s['description'] else ""
            print(f" • {s['id']:<16} [{s['name']}]{desc}")
        print()

    print(f"🛡️ Certified Design & Productivity Skills in {SKILL_DIR} ({len(certified_skills)} installed):")
    for s in certified_skills:
        desc = f" - {s['description']}" if s['description'] else ""
        print(f" • {s['id']:<16} [{s['name']}]{desc}")


def read_skill(skill_name: str) -> str:
    """Reads skill documentation, style guide, and templates from CUSTOM_SKILL_DIR or SKILL_DIR"""
    clean_name = skill_name.strip().lower()
    target_dir = None

    search_dirs = [Path(CUSTOM_SKILL_DIR), Path(SKILL_DIR)]
    for s_dir in search_dirs:
        if not s_dir.exists():
            continue
        for item in s_dir.iterdir():
            if item.is_dir() and (item.name.lower() == clean_name or clean_name in item.name.lower() or item.name.lower() in clean_name):
                target_dir = item
                break
        if target_dir:
            break

    if not target_dir:
        for s in get_available_skills():
            s_name = s.get("name", "").lower()
            s_id = s.get("id", "").lower()
            s_aliases = [str(a).lower() for a in s.get("aliases", [])]
            s_triggers = [str(t).lower() for t in s.get("triggers", [])]
            if clean_name in [s_name, s_id] or clean_name in s_aliases or clean_name in s_triggers:
                for s_dir in search_dirs:
                    cand = s_dir / s["id"]
                    if cand.exists() and cand.is_dir():
                        target_dir = cand
                        break
                if target_dir:
                    break

    if not target_dir:
        available = [s["id"] for s in get_available_skills()]
        return f"未找到技能 '{skill_name}'。可用技能列表: {', '.join(available)}"

    skill_file = target_dir / "SKILL.md" if (target_dir / "SKILL.md").exists() else target_dir / "README.md"
    if not skill_file.exists():
        return f"技能 '{target_dir.name}' 中未找到说明文档。"

    try:
        with open(skill_file, "r", encoding="utf-8") as f:
            content = f.read()

        body = content
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                body = parts[2].strip()

        sub_files = []
        for p in target_dir.rglob("*"):
            if p.is_file() and not p.name.startswith(".") and p != skill_file:
                rel = p.relative_to(target_dir)
                if len(str(rel)) < 80:
                    sub_files.append(str(rel))

        addon = ""
        if sub_files:
            addon = f"\n\n【技能附带资源与可用模版 (位于 {target_dir})】:\n" + "\n".join(f"- {f}" for f in sub_files[:15])

        return body + addon
    except Exception as e:
        return f"读取技能失败: {e}"
