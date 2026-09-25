"""
File and artifact processing tools for DeepSeek Harness (dsh):
Personal knowledge scanning, multimodal image inspection/OCR, workspace file reading,
in-place file patching, and file dispatch/delivery.
"""

import os
import json
import socket
import base64
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
from typing import Optional

from .config import WORKSPACE_DIR, KNOWLEDGE_DIR, DEFAULT_PROXY_URL, VIRTUAL_API_KEY
from .web_tools import check_deadline, assert_not_timed_out
from .office_tools import extract_docx_text, extract_xlsx_text, extract_pdf_text, extract_pptx_text


def scan_personal_knowledge() -> str:
    """Scans personal knowledge space for reference material, saved deliverables, and custom skills"""
    if not os.path.exists(KNOWLEDGE_DIR):
        return ""
    files = list(Path(KNOWLEDGE_DIR).glob("**/*"))
    files = [f for f in files if f.is_file() and not f.name.startswith(".")]
    if not files:
        return "Personal Knowledge Base (/knowledge) 目前为空。你可以将持久化交付物、报表、文档或自定义技能 (/knowledge/skills) 保存在此处。"

    summary = ["Personal Knowledge Base (/knowledge) contents:"]
    for f in files[:15]:
        try:
            rel = f.relative_to(KNOWLEDGE_DIR)
            content_preview = f.read_text(encoding="utf-8", errors="ignore")[:300]
            summary.append(f"- File: {rel} ({f.stat().st_size} bytes)\n  Preview: {content_preview.strip()}")
        except Exception:
            continue
    return "\n".join(summary)


def inspect_image(image_path: str, prompt: str = "", max_chars: int = 15000, deadline: Optional[float] = None) -> str:
    """
    Inspects, analyzes, and extracts visual information/OCR text from an image file
    located in /workspace or /knowledge via the platform's multimodal vision model proxy.
    """
    assert_not_timed_out(deadline, "image vision inspection")
    raw_name = image_path.strip().strip("'\"")
    p = Path(WORKSPACE_DIR) / raw_name if not os.path.isabs(raw_name) else Path(raw_name)
    if not p.exists():
        if not os.path.isabs(raw_name) and (Path(KNOWLEDGE_DIR) / raw_name).exists():
            p = Path(KNOWLEDGE_DIR) / raw_name
        else:
            candidates = list(Path(WORKSPACE_DIR).glob(f"*{raw_name}*"))
            if candidates:
                p = candidates[0]
            else:
                knowledge_candidates = list(Path(KNOWLEDGE_DIR).glob(f"*{raw_name}*"))
                if knowledge_candidates:
                    p = knowledge_candidates[0]
                else:
                    return f"图片文件未找到: {image_path}"

    suffix = p.suffix.lower()
    mime_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".tiff": "image/tiff",
        ".tif": "image/tiff",
    }

    image_bytes = None
    mime = "image/jpeg"

    if suffix == ".pdf":
        try:
            import pypdf
            reader = pypdf.PdfReader(str(p))
            for page in reader.pages:
                if getattr(page, "images", None) and len(page.images) > 0:
                    sorted_imgs = sorted(page.images, key=lambda img: len(img.data), reverse=True)
                    best_img = sorted_imgs[0]
                    image_bytes = best_img.data
                    img_ext = Path(best_img.name).suffix.lower()
                    mime = mime_map.get(img_ext, "image/jpeg")
                    break
            if not image_bytes:
                # 智能降级：若是纯文字 PDF 且未嵌入独立位图对象，自动调用 read_workspace_file 提取文本，避免中断模型推理
                txt_fallback = read_workspace_file(str(p), max_chars=max_chars, deadline=deadline)
                return f"【PDF 识别提示】文档 {p.name} 为文字型 PDF（无独立位图对象），已自动为您提取文档文本内容：\n{txt_fallback}"
        except Exception as e:
            assert_not_timed_out(deadline, "image vision inspection")
            return f"从 PDF 提取页面图片失败 ({p.name}): {e}"
    elif suffix in mime_map:
        mime = mime_map[suffix]
        try:
            with open(p, "rb") as f:
                image_bytes = f.read()
        except Exception as e:
            return f"读取图片文件失败 ({p.name}): {e}"
    else:
        return f"【文件格式不支持】文件 ({p.name}) 并非支持的图片或扫描文档格式（支持 jpg, png, webp, gif, bmp, pdf）。"

    if not image_bytes or len(image_bytes) == 0:
        return f"图片内容为空: {p.name}"

    to_vision = check_deadline(deadline, default_timeout=120.0)
    try:
        b64_str = base64.b64encode(image_bytes).decode("ascii")

        analysis_prompt = prompt.strip() if prompt and prompt.strip() else (
            "请详细分析并解读这张图片的内容，识别并提取图中的所有关键文字（OCR）、物体、图表数据、界面元素或主体信息，给出清晰准确的中文说明。"
        )

        api_endpoint = f"{DEFAULT_PROXY_URL.rstrip('/')}/chat/completions"
        from .runtime_policy import RuntimePolicy
        pol = RuntimePolicy.from_env()
        payload = {
            "model": "vision",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": analysis_prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime};base64,{b64_str}",
                                "detail": "auto"
                            }
                        }
                    ]
                }
            ],
            "temperature": 0.2,
            "max_tokens": pol.max_tokens,
            "stream": False
        }

        req = urllib.request.Request(
            api_endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {VIRTUAL_API_KEY}"
            }
        )

        with urllib.request.urlopen(req, timeout=to_vision) as response:
            resp_data = json.loads(response.read().decode("utf-8"))
            assert_not_timed_out(deadline, "image vision inspection")
            choices = resp_data.get("choices", [])
            if choices:
                content = choices[0].get("message", {}).get("content", "")
                if content:
                    for txt_name in [f"{p.stem}.txt", f"{p.name}.txt"]:
                        tp = p.parent / txt_name
                        if not tp.exists():
                            try:
                                tp.write_text(content, encoding="utf-8")
                            except Exception:
                                pass
                    return f"【图片 ({p.name}) 视觉分析与内容识别结果】:\n{content[:max_chars]}"
            return f"图片视觉识别未返回有效内容: {resp_data}"
    except TimeoutError:
        raise
    except urllib.error.URLError as ue:
        if isinstance(getattr(ue, "reason", None), socket.timeout) or "timed out" in str(ue).lower():
            if deadline is not None and time.monotonic() >= deadline:
                raise TimeoutError("Task total execution deadline exceeded during image vision inspection")
        assert_not_timed_out(deadline, "image vision inspection")
        return f"【系统提示】图片视觉分析网络请求失败: {ue}"
    except urllib.error.HTTPError as he:
        # 默认模型若为纯文本模型（如 DeepSeek），代理端会返回 400/404/500
        assert_not_timed_out(deadline, "image vision inspection")
        return "【系统提示】当前系统默认模型为纯文本模型，暂不支持视觉识别（无法解析图片内容）。"
    except Exception as e:
        assert_not_timed_out(deadline, "image vision inspection")
        return f"【系统提示】当前系统默认模型暂不支持视觉多模态能力: {e}"


def read_workspace_file(
    file_path: str,
    max_chars: int = 30000,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None,
    deadline: Optional[float] = None
) -> str:
    """Reads and extracts text from workspace or knowledge files, with native support for .docx, .xlsx, .txt, .md, .json, .py, .pdf, .jpg, .png"""
    raw_name = file_path.strip().strip("'\"")
    p = Path(WORKSPACE_DIR) / raw_name if not os.path.isabs(raw_name) else Path(raw_name)
    if not p.exists():
        if not os.path.isabs(raw_name) and (Path(KNOWLEDGE_DIR) / raw_name).exists():
            p = Path(KNOWLEDGE_DIR) / raw_name
        else:
            candidates = list(Path(WORKSPACE_DIR).glob(f"*{raw_name}*"))
            if candidates:
                p = candidates[0]
            else:
                knowledge_candidates = list(Path(KNOWLEDGE_DIR).glob(f"*{raw_name}*"))
                if knowledge_candidates:
                    p = knowledge_candidates[0]
                else:
                    return f"文件未找到: {file_path}"

    suffix = p.suffix.lower()

    # 1. Word 文档 (.docx) 原生提取
    if suffix == ".docx":
        return extract_docx_text(p, max_chars=max_chars, start_line=start_line, end_line=end_line)

    # 2. Excel 工作簿 (.xlsx) 原生提取
    elif suffix == ".xlsx":
        return extract_xlsx_text(p, max_chars=max_chars, start_line=start_line, end_line=end_line)

    # 3. PDF 文档 (.pdf) 原生提取
    elif suffix == ".pdf":
        return extract_pdf_text(p, max_chars=max_chars, start_line=start_line, end_line=end_line)

    # 4. PPT 文档 (.pptx) 原生提取
    elif suffix == ".pptx":
        return extract_pptx_text(p, max_chars=max_chars, start_line=start_line, end_line=end_line)

    # 4. 检查是否有已提取的同名 .txt
    txt_sibling = p.parent / f"{p.name}.txt"
    if not txt_sibling.exists():
        txt_sibling = p.parent / f"{p.stem}.txt"
    if txt_sibling.exists() and suffix in [".docx", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]:
        try:
            return f"【文件 ({p.name}) 提取文本/视觉识别结果】:\n" + txt_sibling.read_text(encoding="utf-8", errors="ignore")[:max_chars]
        except Exception:
            pass

    # 5. 图片文件 (.jpg, .jpeg, .png, .webp, .gif, .bmp) 视觉识别与解析
    if suffix in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]:
        return inspect_image(str(p), max_chars=max_chars, deadline=deadline)

    # 6. 常规纯文本文件读取 (.txt, .md, .json, .py, .csv, .yml, .sql, .sh 等)
    try:
        raw = p.read_text(encoding="utf-8", errors="ignore")
        all_lines = raw.splitlines()
        total_lines = len(all_lines)
        if start_line is not None or end_line is not None:
            s_idx = max(0, (start_line or 1) - 1)
            e_idx = min(total_lines, end_line if end_line is not None else total_lines)
            sliced = [f"L{s_idx + 1 + i}: {line}" for i, line in enumerate(all_lines[s_idx:e_idx])]
            content = "\n".join(sliced)
            return f"【文本文件 ({p.name}) 切片内容（第 {s_idx + 1} 至 {e_idx} 行，共 {total_lines} 行）】:\n" + content[:max_chars]

        if len(raw) > max_chars:
            hint = (
                f"\n\n[⚠️ 文件长文本截断提醒]: 文件总长 {len(raw)} 字符 / {total_lines} 行，已读取展示前 {max_chars} 字符。"
                f"\n💡 [通用建议]: 若需查看未展示的后续内容，请在调用 read_file 时指定 `start_line` 与 `end_line` 参数（例如 start_line={min(total_lines, (max_chars // 60))} 分页切片读取），或调用 bash 执行 `grep -n '关键词'` 精准定位。"
            )
            return f"【文本文件 ({p.name}) 内容】:\n" + raw[:max_chars] + hint
        return f"【文本文件 ({p.name}) 内容】:\n" + raw
    except Exception as e:
        return f"读取文件异常 ({p.name}): {e}"


def patch_workspace_file(file_path: str, target_text: str, replacement_text: str) -> str:
    """
    Performs precise in-place target text replacement on a text file in /workspace or /knowledge.
    Prevents token waste and truncation bugs caused by rewriting entire large files.
    """
    if not file_path or not file_path.strip():
        return "替换失败：未指定 file_path"
    if not target_text:
        return "替换失败：target_text 不能为空"
    if replacement_text is None:
        replacement_text = ""

    raw_name = file_path.strip().strip("'\"")
    p = Path(WORKSPACE_DIR) / raw_name if not os.path.isabs(raw_name) else Path(raw_name)
    if not p.exists():
        if not os.path.isabs(raw_name) and (Path(KNOWLEDGE_DIR) / raw_name).exists():
            p = Path(KNOWLEDGE_DIR) / raw_name
        else:
            candidates = list(Path(WORKSPACE_DIR).glob(f"*{raw_name}*"))
            if candidates:
                p = candidates[0]
            else:
                knowledge_candidates = list(Path(KNOWLEDGE_DIR).glob(f"*{raw_name}*"))
                if knowledge_candidates:
                    p = knowledge_candidates[0]
                else:
                    return f"替换失败：文件未找到: {file_path}"

    if not p.is_file():
        return f"替换失败：目标不是普通文件: {file_path}"

    try:
        content = p.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        return f"读取文件内容失败 ({p.name}): {e}"

    if target_text not in content:
        # 宽容性尝试：去除两端换行匹配
        stripped = target_text.strip()
        if stripped and stripped in content:
            target_text = stripped
        else:
            sample = target_text[:150] + ("..." if len(target_text) > 150 else "")
            return (
                f"替换失败：在文件 {p.name} 中未找到目标文本 target_text。\n"
                f"[目标文本预览]:\n{sample}\n"
                f"[提示]: 请先调用 read_file 查看该文件的最新内容与准确缩进/换行，再进行精确匹配替换。"
            )

    count = content.count(target_text)
    new_content = content.replace(target_text, replacement_text, 1)

    try:
        p.write_text(new_content, encoding="utf-8")
        try:
            os.chmod(p, 0o666)
        except Exception:
            pass
        return (
            f"✓ 文件 {p.name} 已成功精准修改落盘！\n"
            f"- 匹配到目标片段: {count} 处（已完成替换第 1 处）\n"
            f"- 修改前大小: {len(content)} 字符，修改后大小: {len(new_content)} 字符"
        )
    except Exception as e:
        return f"写入修改文件失败 ({p.name}): {e}"


def send_workspace_file(file_path: str, comment: str = "") -> str:
    """
    Emits the special delivery protocol token to send a deliverable file from sandbox to user chat interface.
    """
    raw_name = file_path.strip().strip("'\"")
    p = Path(WORKSPACE_DIR) / raw_name if not os.path.isabs(raw_name) else Path(raw_name)
    if not p.exists():
        if not os.path.isabs(raw_name) and (Path(KNOWLEDGE_DIR) / raw_name).exists():
            p = Path(KNOWLEDGE_DIR) / raw_name
        else:
            candidates = list(Path(WORKSPACE_DIR).glob(f"*{raw_name}*"))
            if candidates:
                p = candidates[0]
            else:
                return f"文件不存在，无法发送给用户: {file_path}"

    payload = {
        "filePath": str(p),
        "fileName": p.name,
        "comment": comment.strip()
    }
    return f"<<<DSH_OUTBOUND_FILE:{json.dumps(payload, ensure_ascii=False)}>>>"
