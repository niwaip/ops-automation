"""
Skills scanning, discovery and template retrieval for DeepSeek Harness.
"""

from pathlib import Path
from typing import Optional
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

            # 内置标准技能契约缺省值
            default_deliv = []
            default_exec = False
            default_rounds = 3
            if item.name == "pdf":
                default_deliv = [".pdf"]
                default_exec = True
                default_rounds = 5
            elif item.name == "docx":
                default_deliv = [".docx"]
                default_exec = True
                default_rounds = 5
            elif item.name == "xlsx":
                default_deliv = [".xlsx"]
                default_exec = True
                default_rounds = 5
            elif item.name in ("guizang-ppt", "ppt"):
                default_deliv = [".html"]
                default_exec = True
                default_rounds = 4
            elif item.name == "pptx":
                default_deliv = [".pptx"]
                default_exec = True
                default_rounds = 5

            meta = {
                "id": item.name,
                "name": item.name,
                "description": "",
                "type": skill_type,
                "path": str(item),
                "triggers": triggers,
                "aliases": [item.name.lower()],
                "deliverables": default_deliv,
                "requires_execution": default_exec,
                "default_rounds": default_rounds
            }
            if skill_file.exists():
                try:
                    with open(skill_file, "r", encoding="utf-8") as f:
                        content = f.read()
                        if content.startswith("---"):
                            parts = content.split("---", 2)
                            if len(parts) >= 3:
                                lines = parts[1].splitlines()
                                i = 0
                                current_block_key = None
                                block_lines = []

                                def flush_block():
                                    nonlocal current_block_key, block_lines
                                    if current_block_key in ("zh_description", "description") and block_lines:
                                        val = " ".join(l.strip() for l in block_lines if l.strip())
                                        if not meta["description"] or current_block_key == "zh_description":
                                            meta["description"] = val
                                    block_lines = []
                                    current_block_key = None

                                while i < len(lines):
                                    line = lines[i]
                                    stripped = line.strip()
                                    if not stripped or stripped.startswith("#"):
                                        i += 1
                                        continue

                                    if stripped.startswith("-") and current_block_key == "triggers":
                                        trig_item = stripped.lstrip("-").strip().strip("\"'").lower()
                                        if trig_item:
                                            meta["triggers"].append(trig_item)
                                        i += 1
                                        continue

                                    if stripped.startswith("-") and current_block_key == "deliverables":
                                        deliv_item = stripped.lstrip("-").strip().strip("\"'").lower()
                                        if deliv_item:
                                            meta["deliverables"].append(deliv_item)
                                        i += 1
                                        continue

                                    if (line.startswith("  ") or line.startswith("\t")) and current_block_key in ("description", "zh_description"):
                                        block_lines.append(stripped)
                                        i += 1
                                        continue

                                    flush_block()
                                    if ":" in line:
                                        k, v = line.split(":", 1)
                                        k = k.strip()
                                        v = v.strip().strip("\"'")
                                        if k == "name":
                                            if v:
                                                meta["aliases"].append(v.lower())
                                            if meta["name"] == item.name and v:
                                                meta["name"] = v
                                        elif k == "zh_name" and v:
                                            meta["name"] = v
                                        elif k in ("description", "zh_description"):
                                            if v in ("|", ">"):
                                                current_block_key = k
                                            elif v:
                                                if not meta["description"] or k == "zh_description":
                                                    meta["description"] = v
                                        elif k in ("triggers", "keywords"):
                                            if v.startswith("[") and v.endswith("]"):
                                                parts_trig = [t.strip().strip("\"'").lower() for t in v[1:-1].split(",") if t.strip()]
                                                meta["triggers"].extend(parts_trig)
                                            else:
                                                current_block_key = "triggers"
                                        elif k == "deliverables":
                                            if v.startswith("[") and v.endswith("]"):
                                                parts_d = [t.strip().strip("\"'").lower() for t in v[1:-1].split(",") if t.strip()]
                                                meta["deliverables"] = parts_d
                                            else:
                                                meta["deliverables"] = []
                                                current_block_key = "deliverables"
                                        elif k == "requires_execution":
                                            meta["requires_execution"] = v.lower() in ("true", "1", "yes")
                                        elif k == "default_rounds":
                                            try:
                                                meta["default_rounds"] = int(v)
                                            except ValueError:
                                                pass
                                    i += 1
                                flush_block()

                        if not meta["description"] or meta["description"] in ["|", ">"]:
                            body = parts[2] if len(parts) >= 3 else content
                            for line in body.splitlines():
                                line_t = line.strip()
                                if not line_t.startswith("#") and not line_t.startswith("---") and not line_t.startswith(">") and line_t:
                                    meta["description"] = line_t[:120]
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


def read_skill(skill_name: str, prompt: Optional[str] = None) -> str:
    """Reads skill documentation, style guide, and templates from CUSTOM_SKILL_DIR or SKILL_DIR with hierarchical progressive loading."""
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

        # 分层载入：根据用户 prompt 动态加载 references 下的细分场景模块
        hierarchical_section = ""
        refs_dir = target_dir / "references"
        if refs_dir.exists() and refs_dir.is_dir() and prompt:
            p_lower = prompt.lower()
            target_ref = None
            if clean_name in ["pdf", "pdf report", "导出pdf", "生成pdf"]:
                if any(k in p_lower for k in ["docx", "word", "合同", "转为pdf", "转成pdf", "转换"]):
                    target_ref = refs_dir / "docx2pdf.md"
                elif any(k in p_lower for k in ["表单", "填报", "填写", "fillable", "acroform"]):
                    target_ref = refs_dir / "forms.md"
                else:
                    target_ref = refs_dir / "report_pdf.md"

            if target_ref and target_ref.exists():
                try:
                    with open(target_ref, "r", encoding="utf-8") as rf:
                        hierarchical_section = f"\n\n---\n【分层按需载入场景规范 ({target_ref.name})】:\n" + rf.read().strip()
                except Exception:
                    pass

        sub_files = []
        for p in target_dir.rglob("*"):
            if p.is_file() and not p.name.startswith(".") and p != skill_file and "references" not in p.parts:
                rel = p.relative_to(target_dir)
                if len(str(rel)) < 80:
                    sub_files.append(str(rel))

        addon = ""
        if sub_files:
            addon = f"\n\n【技能附带资源与可用模版 (位于 {target_dir})】:\n" + "\n".join(f"- {f}" for f in sub_files[:15])

        return body + hierarchical_section + addon
    except Exception as e:
        return f"读取技能失败: {e}"
