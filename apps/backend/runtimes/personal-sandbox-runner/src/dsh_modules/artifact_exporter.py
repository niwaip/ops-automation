"""
Artifact extraction and workspace persistence for DeepSeek Harness (dsh).
Extracts deliverables (HTML prototypes, presentations, reports) from model output.
"""

import re
from pathlib import Path
from typing import Tuple, List, Optional


class ArtifactExporter:
    """Extracts and persists deliverable files to workspace."""

    @staticmethod
    def repair_truncated_html(html_str: str) -> str:
        """
        Repairs truncated/unclosed HTML code:
        1. Checks and closes unclosed tag definitions and attribute quotes (e.g. <path ... d="M17).
        2. Closes unclosed <style> / <script> / <head> / <svg> / <button> / <table> tags.
        3. Injects a clear alert body card if <body> is missing (truncated in CSS/head).
        4. Closes unclosed <body> and </html>.
        """
        if not html_str:
            return ""
        repaired = html_str.rstrip()

        # 1. 检查是否在 HTML 标签属性内部被截断（例如 <path ... d="M17 17... 未闭合引号或 >）
        last_open_angle = repaired.rfind("<")
        last_close_angle = repaired.rfind(">")
        if last_open_angle > last_close_angle:
            tag_fragment = repaired[last_open_angle:]
            double_quotes = tag_fragment.count('"')
            single_quotes = tag_fragment.count("'")
            suffix = ""
            if double_quotes % 2 == 1:
                suffix += '"'
            if single_quotes % 2 == 1:
                suffix += "'"
            suffix += ">"
            repaired += suffix

        # 2. 闭合未闭合的内联与容器标签
        for tag in ["style", "script", "head", "svg", "button", "table", "tbody", "tr", "td"]:
            open_count = len(re.findall(rf"<{tag}(?:\s+[^>]*)?>", repaired, re.I))
            close_count = len(re.findall(rf"</{tag}>", repaired, re.I))
            if open_count > close_count:
                for _ in range(open_count - close_count):
                    repaired += f"\n</{tag}>"

        div_open = len(re.findall(r"<div(?:\s+[^>]*)?>", repaired, re.I))
        div_close = len(re.findall(r"</div>", repaired, re.I))
        if div_open > div_close:
            repaired += "\n" + ("</div>\n" * min(div_open - div_close, 10))

        # 3. 检查 <body>
        has_body_open = bool(re.search(r'<body(?:\s+[^>]*)?>', repaired, re.I))
        has_body_close = bool(re.search(r'</body>', repaired, re.I))

        if not has_body_open:
            fallback_body = (
                '<body style="margin:0; padding:24px; background:#0f172a; color:#f8fafc; '
                'font-family:-apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; '
                'display:flex; align-items:center; justify-content:center; min-height:85vh; box-sizing:border-box;">\n'
                '  <div style="max-width:640px; width:100%; background:rgba(30,41,59,0.95); '
                'border:1px solid rgba(148,163,184,0.25); border-radius:14px; padding:32px; '
                'box-shadow:0 16px 36px rgba(0,0,0,0.4); text-align:center; box-sizing:border-box;">\n'
                '    <div style="font-size:36px; margin-bottom:12px; line-height:1;">⚠️</div>\n'
                '    <h3 style="margin:0 0 10px 0; font-size:18px; font-weight:600; color:#f8fafc;">页面内容未完全生成</h3>\n'
                '    <p style="margin:0 0 18px 0; font-size:13px; line-height:1.6; color:#94a3b8;">\n'
                '      该 HTML 文件在生成样式定义或头部阶段中断，未包含正文（Body）内容。系统已执行基础标签闭合以防崩溃。\n'
                '    </p>\n'
                '    <div style="background:rgba(15,23,42,0.65); border:1px solid rgba(51,65,85,0.6); '
                'padding:14px 18px; border-radius:8px; font-size:12px; color:#cbd5e1; text-align:left; margin-bottom:16px; line-height:1.7;">\n'
                '      💡 <b>恢复与优化建议：</b><br>\n'
                '      1. <b>接力续写</b>：在对话框发送 <code>“继续”</code> 或 <code>“续写正文”</code>；<br>\n'
                '      2. <b>精简样式</b>：可提示 <i>“以轻量表格与核心结论优先输出，减少复杂 SVG 与重型样式”</i>。<br>\n'
                '    </div>\n'
                '  </div>\n'
                '</body>\n'
            )
            repaired += f"\n{fallback_body}"
        elif not has_body_close:
            partial_notice = (
                '\n<div style="margin:28px auto; max-width:640px; padding:14px 20px; '
                'background:rgba(234,179,8,0.12); border:1px dashed rgba(234,179,8,0.45); '
                'border-radius:8px; font-size:12px; color:#eab308; text-align:center; line-height:1.7;">\n'
                '  ⚠️ <b>内容未完整生成提醒</b>：页面代码在生成中途中断，上方为已生成的局部内容（已尝试闭合未完结标签）。<br>\n'
                '  💡 <b>建议</b>：可在对话框中直接发送 <code>“继续”</code> 或提示 <code>“优先输出表格数据与结论，避免复杂装饰”</code>。\n'
                '</div>\n'
                '</body>\n'
            )
            repaired += partial_notice

        # 4. 闭合 </html>
        if not re.search(r'</html>', repaired, re.I):
            repaired += "</html>\n"

        return repaired

    @staticmethod
    def export_html(
        final_text: str,
        is_ppt_intent: bool,
        workspace_dir: str,
        turn_start_time: float = None,
        is_design_intent: bool = False,
        prompt: str = None,
        history: List[dict] = None
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

            is_truncated = False
            best_html = None
            if m_full:
                best_html = m_full[-1].strip()
                if "<!doctype html" in best_html.lower() or "<html" in best_html.lower():
                    if "</html>" not in best_html.lower():
                        best_html = ArtifactExporter.repair_truncated_html(best_html)
                        is_truncated = True
                        cleaned_text = re.sub(
                            r'```html\s*\n<!DOCTYPE html[\s\S]*?```',
                            f"```html\n{best_html}\n```",
                            cleaned_text,
                            count=1,
                            flags=re.I
                        )
            else:
                # 容错处理：模型因上游中断或 Token 限制，未输出闭合的 ``` 代码块围栏
                m_trunc = re.search(r'```html\s*\n(<!DOCTYPE html[\s\S]*)$', cleaned_text, re.I)
                if not m_trunc:
                    m_trunc = re.search(r'```html\s*\n(<html[\s\S]*)$', cleaned_text, re.I)
                if not m_trunc:
                    m_trunc = re.search(r'```html\s*\n([\s\S]*)$', cleaned_text, re.I)
                if m_trunc:
                    raw_trunc = m_trunc.group(1).strip()
                    best_html = ArtifactExporter.repair_truncated_html(raw_trunc)
                    is_truncated = True
                    idx_html = cleaned_text.rfind("```html")
                    cleaned_text = cleaned_text[:idx_html] + f"```html\n{best_html}\n```\n"

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

                    if not cleaned_text.startswith("✨") and not cleaned_text.startswith("⚠️"):
                        if is_truncated:
                            banner = (
                                "⚠️ **HTML 未完整生成（已保存局部残稿）**\n"
                                f"- **已保存文件**：`/workspace/{out_name}`\n"
                                "- **状态说明**：页面代码在生成中途中断，系统已尝试对未闭合的代码结构进行基础闭合并保存残稿。注意：因关键正文/财务数据可能尚未完全生成，预览可能存在排版异常或内容缺失。\n"
                                "- **💡 建议**：\n"
                                "  1. **输入「继续」接力**：直接在对话框回复「继续」或「续写剩余内容」，AI 将尝试读取已保存文件继续完成。\n"
                                "  2. **轻量表格优先**：可提示「请优先输出核心指标表格与业务结论，避免复杂的 SVG 矢量图与冗余样式」。\n\n"
                            )
                        elif is_ppt_intent:
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
                # 校验文件是否在当前轮次内被生成/修改，严禁将历史其他任务生成的残留同名文件（如 index.html）误判为本轮产物
                is_current_turn_file = (turn_start_time is None) or (p.stat().st_mtime >= turn_start_time - 2.0)
                if turn_start_time is not None and not is_current_turn_file:
                    continue
                has_delivery_keyword = bool(re.search(r'(已保存|已生成|保存在|写入|已创建|输出文件|请查看|预览|打开).*?' + re.escape(fn), cleaned_text, re.I))
                if is_current_turn_file or has_delivery_keyword:
                    target_file = p
                    break

        # 仅当本轮具备明确的 HTML 产物意图，且该文件确系在当前轮次生成时，才执行未提及文件名的全局工作区探测
        prompt_str = (prompt or "").lower()
        names_non_web_format = bool(
            re.search(r'(?:pptx?|slides?|幻灯片|演示文稿|pdf|docx?|word|xlsx?|excel)', prompt_str, re.I)
        )
        html_cues = ["html", "网页", "页面", "前端", "看板", "大屏", "原型", "demo", "五子棋", "ppt", "幻灯片", "演示文稿", "单页"]
        has_html_intent = (not names_non_web_format) and (
            is_ppt_intent
            or is_design_intent
            or any(cue in prompt_str for cue in html_cues)
            or ("报告" in prompt_str and any(cue in prompt_str for cue in ["单页", "一页", "html", "网页"]))
        )

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

        # 容错兜底 1：若模型口头声明已生成 HTML / 单页报告且提供了实质正文，但未通过 bash 或代码块落盘，
        # 自动由运行时编译生成单页 HTML 并注入代码块，确保前端挂载 HtmlPreviewBlock（包含预览与全屏组件）
        if not target_file:
            try:
                from .html_report_fallback import materialize_requested_html
                mat_path, mat_created = materialize_requested_html(
                    prompt=prompt or "",
                    final_text=cleaned_text,
                    workspace_dir=workspace_dir,
                    turn_start_time=turn_start_time,
                    is_design_intent=is_design_intent,
                    is_ppt_intent=is_ppt_intent
                )
                if mat_path and Path(mat_path).exists():
                    target_file = Path(mat_path)
            except Exception as e:
                print(f"⚠️ [Harness Export] 声明式 HTML 产物自愈失败: {e}")

        # 容错兜底 2：若仍未找到产物文件，且当前具备明确 HTML 意图且存在会话历史上下文（如上一轮查了天气/安装方法/数据），
        # 自动由运行时基于会话历史编译生成单页 HTML 报告
        if not target_file and has_html_intent and history:
            try:
                from .html_report_fallback import materialize_html_report_fallback
                fallback_path = materialize_html_report_fallback(
                    prompt=prompt or "",
                    history=history,
                    workspace_dir=workspace_dir,
                    notice="本单页报告由系统基于会话中有效内容恢复生成，支持交互预览与全屏查看。"
                )
                if fallback_path and Path(fallback_path).exists():
                    target_file = Path(fallback_path)
            except Exception as e:
                print(f"⚠️ [Harness Export] 会话历史 HTML 产物自愈失败: {e}")

        if target_file and target_file.exists():
            try:
                with open(target_file, "r", encoding="utf-8") as f:
                    file_content = f.read().strip()
                if "<!DOCTYPE html" in file_content or "<html" in file_content:
                    exported_files.append(str(target_file))
                    print(f"✨ [Harness Export] 自动从工作区提取生成文件注入卡片: {target_file}")

                    is_hollow_claim_text = (
                        len(cleaned_text.strip()) < 80 and
                        bool(re.search(r'(?:文件|代码|报告)?已成功(?:生成|写入|保存)', cleaned_text))
                    )

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

                    if is_hollow_claim_text:
                        cleaned_text = banner
                    elif not cleaned_text.startswith("✨"):
                        cleaned_text = banner + cleaned_text

                    cleaned_text = cleaned_text.rstrip() + f"\n\n```html\n{file_content}\n```\n"
            except Exception as e:
                print(f"⚠️ [Harness Export] 读取工作区补全文件异常: {e}")

        return cleaned_text, exported_files

    @staticmethod
    def is_temporary_file(file_name: str) -> bool:
        """
        Detects whether a file is a temporary or testing artifact (e.g., test.pdf, tmp.docx, dummy.xlsx).
        """
        clean = Path(file_name).stem.lower().strip()
        temp_prefixes = ("test", "temp", "tmp", "dummy", "sample", "demo", "untitled")
        if clean in temp_prefixes:
            return True
        if any(clean.startswith(f"{p}_") or clean.startswith(f"{p}-") or clean.startswith(f"{p}.") for p in temp_prefixes):
            return True
        if clean.endswith("_test") or clean.endswith("-test") or clean.startswith("_"):
            return True
        return False

    @staticmethod
    def export_deliverables(
        workspace_dir: str,
        final_text: str,
        turn_start_time: float = None,
        session_files: Optional[List[str]] = None
    ) -> List[dict]:
        """
        Scans workspace for newly created or mentioned document deliverables (docx, xlsx, pptx, pdf, md, zip, etc.)
        and returns list of {filePath, fileName}.
        Strictly excludes user input attachments (session_files) from being claimed as generated deliverables.
        """
        deliverables = []
        seen_names = set()
        doc_exts = {".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".pdf", ".md", ".zip", ".csv"}
        excluded_names = set(Path(f).name.lower().strip() for f in (session_files or []))

        ws_path = Path(workspace_dir)
        if not ws_path.exists():
            return deliverables

        # 1. 扫描本轮次中新增或修改的文件（若未指定时间戳则扫描工作区所有有效交付物）
        min_mtime = (turn_start_time - 2.0) if turn_start_time is not None else 0.0
        for item in ws_path.iterdir():
            if item.is_file() and item.suffix.lower() in doc_exts:
                if item.name.lower() in excluded_names:
                    continue
                if item.stat().st_size > 0 and item.stat().st_mtime >= min_mtime:
                    # 过滤未在最终正文中作为交付物明确提及的临时/测试文件（如 test.pdf）
                    if ArtifactExporter.is_temporary_file(item.name) and (item.name not in final_text):
                        continue
                    deliverables.append({"filePath": str(item), "fileName": item.name})
                    seen_names.add(item.name)

        # 2. 扫描文本中明确提及的文件名
        mentioned = re.findall(
            r'(?:/workspace/|workspace/|`|《|“|"|\')?([a-zA-Z0-9_\-\u4e00-\u9fa5]+\.(?:docx?|xlsx?|pptx?|pdf|md|zip|csv))(?:`|》|”|"|\')?',
            final_text,
            re.I
        )
        for fn in mentioned:
            if fn in seen_names or fn.lower() in excluded_names:
                continue
            cand = ws_path / fn
            if cand.exists() and cand.is_file() and cand.stat().st_size > 0:
                deliverables.append({"filePath": str(cand), "fileName": cand.name})
                seen_names.add(fn)

        return deliverables
