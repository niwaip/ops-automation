"""
Bounded DOCX CLI adapter: model supplies content, owned engine supplies typography and QA.
"""

import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

from .tool_result import ToolResult, TextToolOutput


DOCX_RENDER_TOOL = {
    "type": "function",
    "function": {
        "name": "render_docx",
        "description": "专业 Word (.docx) 文档一键排版生成工具。传入 Markdown 正文与目标输出路径，底层引擎自动应用企业级视觉排版系统（包含多主题配色、中西文字体分流、自适应精致表格、Callout 提示框、代码块高亮底色、页眉页脚与页码），并自动生成高质量页面预览图用于验收质检。无需自行编写 Python/python-docx 脚本。",
        "parameters": {
            "type": "object",
            "properties": {
                "markdown": {
                    "type": "string",
                    "minLength": 1,
                    "description": "连续 Markdown 正文。支持各级标题、段落、列表、表格、代码块以及 > [!NOTE] 提示框。"
                },
                "output_path": {
                    "type": "string",
                    "description": "目标 Word 文档路径，必须以 /workspace/ 开头且为 .docx 后缀，如 /workspace/DeepSeek_Harness_安装指南.docx"
                },
                "theme": {
                    "type": "string",
                    "enum": ["tech-blue", "business-navy", "elegant-teal", "crimson-red", "modern-graphite"],
                    "description": "文档排版视觉主题，默认 tech-blue"
                },
                "title": {
                    "type": "string",
                    "description": "文档大标题（可选，缺省则从 Markdown 一级标题提取）"
                },
                "subtitle": {
                    "type": "string",
                    "description": "文档副标题或版本摘要（可选）"
                },
                "author": {
                    "type": "string",
                    "description": "文档作者/起草团队（可选）"
                },
                "generate_preview": {
                    "type": "boolean",
                    "description": "是否自动渲染高清 PNG 预览图（便于质检验收），默认 true"
                }
            },
            "required": ["markdown", "output_path"],
            "additionalProperties": False
        }
    }
}


def _make_error(msg: str, provenance: dict) -> TextToolOutput:
    res = ToolResult.error(msg, provenance=provenance)
    return TextToolOutput(res.render_text(), res)


def render_docx(params: dict, workspace_dir: str, skill_dir: str, deadline: float = None, user_prompt: str = "") -> TextToolOutput:
    """Executes the high-aesthetic DOCX compiler and returns standard ToolResult with preview telemetry."""
    provenance = {"tool": "render_docx"}
    try:
        content = params.get("markdown", "")
        out_path = params.get("output_path", "")

        if not isinstance(content, str) or not content.strip():
            return _make_error("markdown 参数必须为非空字符串", provenance)

        if not isinstance(out_path, str) or not out_path.strip().endswith(".docx"):
            return _make_error("output_path 必须为以 .docx 结尾的文件路径，例如 /workspace/安装指南.docx", provenance)

        root = Path(workspace_dir).resolve()
        target = Path(out_path)
        if not target.is_absolute():
            target = root / target
        else:
            target = target.resolve()

        try:
            target.relative_to(root)
        except ValueError:
            return _make_error(f"输出路径必须位于工作区 {workspace_dir} 内", provenance)

        # Check deadline
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError("DOCX 渲染前总任务预算已耗尽")

        # Resolve generator script path
        generator = None
        candidates = [
            Path(skill_dir) / "docx" / "scripts" / "generate_report_docx.py",
            Path("/opt/dsh/skills/docx/scripts/generate_report_docx.py"),
            Path(__file__).parent.parent.parent / "skills" / "docx" / "scripts" / "generate_report_docx.py",
        ]
        for c in candidates:
            if c.is_file():
                generator = c
                break

        if not generator:
            return _make_error("未找到 Word 报告排版引擎脚本 (generate_report_docx.py)", provenance)

        # Temp markdown source file
        run_id = uuid.uuid4().hex
        tmp_dir = root / ".dsh" / "docx-runs"
        tmp_dir.mkdir(parents=True, exist_ok=True)
        source_file = tmp_dir / f"input_{run_id}.md"
        source_file.write_text(content, encoding="utf-8")

        preview_dir = root / ".docx-preview" / target.stem
        preview_dir.mkdir(parents=True, exist_ok=True)

        cmd = [
            sys.executable,
            str(generator),
            "--input", str(source_file),
            "--output", str(target),
            "--theme", params.get("theme", "tech-blue"),
            "--preview-dir", str(preview_dir)
        ]

        if params.get("title"):
            cmd.extend(["--title", str(params["title"])])
        if params.get("subtitle"):
            cmd.extend(["--subtitle", str(params["subtitle"])])
        if params.get("author"):
            cmd.extend(["--author", str(params["author"])])

        # Run generator
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)
        if proc.returncode != 0:
            err_msg = proc.stderr.strip() or proc.stdout.strip() or "未知执行错误"
            return _make_error(f"Word 生成引擎执行失败: {err_msg}", provenance)

        # Parse output report
        report = {}
        for line in proc.stdout.strip().split("\n"):
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                try:
                    report = json.loads(line)
                    break
                except Exception:
                    pass

        previews = report.get("previews", [])
        page_count = report.get("page_count", 0)
        file_size_kb = round(report.get("file_size_bytes", 0) / 1024, 1)

        marker_payload = json.dumps({"filePath": str(target), "fileName": target.name}, ensure_ascii=False)
        outbound_marker = f"<<<DSH_OUTBOUND_FILE:len={len(marker_payload)}:{marker_payload}>>>"

        result_summary = (
            f"✓ 成功生成专业排版 Word 文档：{target.name} ({file_size_kb} KB)\n"
            f"- 视觉主题: {report.get('theme', 'tech-blue')}\n"
            f"- 页面数量: {page_count} 页\n"
            f"- 落盘路径: {target}\n"
        )
        if previews:
            result_summary += f"- 页面预览图已就绪: 共 {len(previews)} 张 (存放于 .docx-preview/)\n"
        result_summary += f"\n{outbound_marker}\n"

        data = {
            "kind": "docx_render",
            "file_path": str(target),
            "file_name": target.name,
            "page_count": page_count,
            "file_size_kb": file_size_kb,
            "theme": report.get("theme", "tech-blue"),
            "previews": previews,
            "summary": result_summary
        }
        res = ToolResult.success(data=data, text=result_summary, provenance=provenance)
        return TextToolOutput(result_summary, res)

    except Exception as e:
        return _make_error(f"render_docx 执行异常: {str(e)}", provenance)
