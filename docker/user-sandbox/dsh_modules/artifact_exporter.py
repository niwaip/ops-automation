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
    def export_html(final_text: str, is_ppt_intent: bool, workspace_dir: str) -> Tuple[str, List[str]]:
        """
        Extracts HTML from output, writes to workspace, and injects interactive banner if needed.
        Returns: (augmented_final_text, exported_file_paths)
        """
        exported_files = []
        if "```html" not in final_text:
            return final_text, exported_files

        # 容错处理：若模型在回复中输出了多段完整的 HTML 文档，截取最完整的一段
        cleaned_text = final_text
        if cleaned_text.count("<!DOCTYPE html") > 1:
            idx = max(cleaned_text.rfind("```html\n<!DOCTYPE html"), cleaned_text.rfind("```html\r\n<!DOCTYPE html"))
            if idx > 0:
                pfx = cleaned_text[:cleaned_text.find("```html")].strip()
                cleaned_text = (pfx + "\n\n" if pfx else "") + cleaned_text[idx:]

        m_full = re.findall(r'```html\s*\n(<!DOCTYPE html[\s\S]*?</html>)\s*```', cleaned_text, re.I)
        if not m_full:
            m_full = re.findall(r'```html\s*\n(<!DOCTYPE html[\s\S]*?)```', cleaned_text, re.I)

        best_html = m_full[-1].strip() if m_full else None
        if not best_html:
            return cleaned_text, exported_files

        out_name = "presentation.html" if is_ppt_intent else "index.html"
        out_path = Path(workspace_dir) / out_name

        try:
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(best_html)
            exported_files.append(str(out_path))
            print(f"✨ [Harness Export] 已将生成的作品完整写入工作区: {out_path}")

            if is_ppt_intent and not cleaned_text.startswith("✨"):
                banner = (
                    "✨ **演示文稿已生成完毕！**\n"
                    f"- **输出文件**：`/workspace/{out_name}`\n"
                    "- **操作提示**：您可以在下方直接**交互预览**、**全屏播放**（支持键盘 ← → / 空格翻页、ESC 查看大纲），或点击**下载**保存本地播放。\n\n"
                )
                cleaned_text = banner + cleaned_text
        except Exception as e:
            print(f"⚠️ [Harness Export] 写入工作区文件异常: {e}")

        return cleaned_text, exported_files
