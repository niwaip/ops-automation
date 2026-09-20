"""
Artifact extraction and workspace persistence for DeepSeek Harness (dsh).
Extracts deliverables (HTML prototypes, presentations, reports) from model output.
"""

import re
from pathlib import Path
from typing import Tuple, List


class ArtifactExporter:
    """Extracts and persists deliverable files to workspace."""

    @staticmethod
    def export_html(
        final_text: str,
        is_ppt_intent: bool,
        workspace_dir: str,
        turn_start_time: float = None,
        is_design_intent: bool = False,
        prompt: str = None
    ) -> Tuple[str, List[str]]:
        """
        Extracts HTML from output, writes to workspace, and injects interactive banner if needed.
        Returns: (augmented_final_text, exported_file_paths)
        """
        exported_files = []
        cleaned_text = final_text

        # 情况 A: 模型回复中直接包含了 ```html 代码块
        if "```html" in cleaned_text:
            # 容错处理：若模型在回复中输出了多段完整的 HTML 文档，截取最完整的一段
            if cleaned_text.count("<!DOCTYPE html") > 1:
                idx = max(cleaned_text.rfind("```html\n<!DOCTYPE html"), cleaned_text.rfind("```html\r\n<!DOCTYPE html"))
                if idx > 0:
                    pfx = cleaned_text[:cleaned_text.find("```html")].strip()
                    cleaned_text = (pfx + "\n\n" if pfx else "") + cleaned_text[idx:]

            m_full = re.findall(r'```html\s*\n(<!DOCTYPE html[\s\S]*?</html>)\s*```', cleaned_text, re.I)
            if not m_full:
                m_full = re.findall(r'```html\s*\n(<!DOCTYPE html[\s\S]*?)```', cleaned_text, re.I)

            best_html = m_full[-1].strip() if m_full else None
            if best_html:
                # 确定输出文件名：如果正文中提及了特定文件名（如 gomoku.html），优先采纳
                out_name = "presentation.html" if is_ppt_intent else "index.html"
                mentioned_names = re.findall(r'(?:/workspace/|workspace/|`)([a-zA-Z0-9_\-]+\.html)', cleaned_text, re.I)
                for mn in mentioned_names:
                    if mn.lower() not in ["presentation.html", "index.html"]:
                        out_name = mn
                        break

                out_path = Path(workspace_dir) / out_name
                try:
                    with open(out_path, "w", encoding="utf-8") as f:
                        f.write(best_html)
                    exported_files.append(str(out_path))
                    print(f"✨ [Harness Export] 已将生成的作品完整写入工作区: {out_path}")

                    if not cleaned_text.startswith("✨"):
                        if is_ppt_intent:
                            banner = (
                                "✨ **演示文稿已生成完毕！**\n"
                                f"- **输出文件**：`/workspace/{out_name}`\n"
                                "- **操作提示**：您可以在下方直接**交互预览**、**全屏播放**（支持键盘 ← → / 空格翻页、ESC 查看大纲），或点击**下载**保存本地播放。\n\n"
                            )
                        else:
                            banner = (
                                "✨ **交互式页面已生成完毕！**\n"
                                f"- **输出文件**：`/workspace/{out_name}`\n"
                                "- **操作提示**：您可以在下方直接**展开在线预览**、**全屏查看**，或点击**下载**保存本地使用。\n\n"
                            )
                        cleaned_text = banner + cleaned_text
                except Exception as e:
                    print(f"⚠️ [Harness Export] 写入工作区文件异常: {e}")

                return cleaned_text, exported_files

        # 情况 B: 模型通过 bash/python 将 html 写到了工作区，但最终文本中遗漏了 ```html 代码块
        # 自动探测工作区中被提及或最新生成的 HTML 文件并反向注入到回复中，确保前端挂载交互卡片
        target_file = None
        mentioned = re.findall(r'(?:/workspace/|workspace/|`)([a-zA-Z0-9_\-\.]+\.html)', cleaned_text, re.I)
        for fn in mentioned:
            p = Path(workspace_dir) / fn
            if p.exists() and p.is_file() and p.stat().st_size > 50:
                # 校验文件是否在当前轮次内被生成/修改，或正文有明确的保存/生成/交付语义
                is_current_turn_file = (turn_start_time is None) or (p.stat().st_mtime >= turn_start_time - 2.0)
                has_delivery_keyword = bool(re.search(r'(已保存|已生成|保存在|写入|已创建|输出文件|请查看|预览|打开).*?' + re.escape(fn), cleaned_text, re.I))
                if is_current_turn_file or has_delivery_keyword:
                    target_file = p
                    break

        # 仅当本轮具备明确的 HTML 产物意图，且该文件确系在当前轮次生成时，才执行未提及文件名的全局工作区探测
        prompt_str = (prompt or "").lower()
        html_cues = ["html", "网页", "页面", "前端", "看板", "大屏", "原型", "demo", "五子棋", "ppt", "幻灯片", "演示文稿", "报告", "单页"]
        has_html_intent = is_ppt_intent or is_design_intent or any(cue in prompt_str for cue in html_cues)

        if not target_file and has_html_intent and Path(workspace_dir).exists():
            import time
            now = time.time()
            min_mtime = (turn_start_time - 2.0) if turn_start_time is not None else (now - 30.0)
            recent_htmls = [
                f for f in Path(workspace_dir).glob("*.html")
                if f.is_file() and f.stat().st_size > 50 and (f.stat().st_mtime >= min_mtime)
            ]
            if recent_htmls:
                recent_htmls.sort(key=lambda f: f.stat().st_mtime, reverse=True)
                target_file = recent_htmls[0]

        if target_file and target_file.exists():
            try:
                with open(target_file, "r", encoding="utf-8") as f:
                    file_content = f.read().strip()
                if "<!DOCTYPE html" in file_content or "<html" in file_content:
                    exported_files.append(str(target_file))
                    print(f"✨ [Harness Export] 自动从工作区提取生成文件注入卡片: {target_file}")

                    if not cleaned_text.startswith("✨"):
                        if is_ppt_intent:
                            banner = (
                                "✨ **演示文稿已生成完毕！**\n"
                                f"- **输出文件**：`/workspace/{target_file.name}`\n"
                                "- **操作提示**：您可以在下方直接**交互预览**、**全屏播放**（支持键盘 ← → / 空格翻页、ESC 查看大纲），或点击**下载**保存本地播放。\n\n"
                            )
                        else:
                            banner = (
                                "✨ **交互式页面已生成完毕！**\n"
                                f"- **输出文件**：`/workspace/{target_file.name}`\n"
                                "- **操作提示**：您可以在下方直接**展开在线预览**、**全屏查看**，或点击**下载**保存本地使用。\n\n"
                            )
                        cleaned_text = banner + cleaned_text

                    cleaned_text = cleaned_text + f"\n\n```html\n{file_content}\n```\n"
            except Exception as e:
                print(f"⚠️ [Harness Export] 读取工作区补全文件异常: {e}")

        return cleaned_text, exported_files

    @staticmethod
    def export_deliverables(
        workspace_dir: str,
        final_text: str,
        turn_start_time: float = None
    ) -> List[dict]:
        """
        Scans workspace for newly created or mentioned document deliverables (docx, xlsx, pptx, pdf, zip, etc.)
        and returns list of {filePath, fileName}.
        """
        deliverables = []
        seen_names = set()
        doc_exts = {".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".pdf", ".zip", ".csv"}

        ws_path = Path(workspace_dir)
        if not ws_path.exists():
            return deliverables

        # 1. 扫描本轮次中新增或修改的文件
        if turn_start_time is not None:
            min_mtime = turn_start_time - 2.0
            for item in ws_path.iterdir():
                if item.is_file() and item.suffix.lower() in doc_exts:
                    if item.stat().st_size > 0 and item.stat().st_mtime >= min_mtime:
                        deliverables.append({"filePath": str(item), "fileName": item.name})
                        seen_names.add(item.name)

        # 2. 扫描文本中明确提及的文件名
        mentioned = re.findall(
            r'(?:/workspace/|workspace/|`|《|“|"|\')?([a-zA-Z0-9_\-\u4e00-\u9fa5]+\.(?:docx?|xlsx?|pptx?|pdf|zip|csv))(?:`|》|”|"|\')?',
            final_text,
            re.I
        )
        for fn in mentioned:
            if fn in seen_names:
                continue
            cand = ws_path / fn
            if cand.exists() and cand.is_file() and cand.stat().st_size > 0:
                deliverables.append({"filePath": str(cand), "fileName": cand.name})
                seen_names.add(fn)

        return deliverables
