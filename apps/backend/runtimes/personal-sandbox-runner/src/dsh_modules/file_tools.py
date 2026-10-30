"""
File and artifact processing tools for DeepSeek Harness (dsh):
Personal knowledge scanning, multimodal image inspection/OCR, workspace file reading,
in-place file patching, and file dispatch/delivery.
"""

import os
import re
import json
import socket
import base64
import time
import uuid
import urllib.request
import urllib.parse
import urllib.error
import tempfile
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any, Iterable, Set

IMAGE_MIME_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
}
IMAGE_EXTENSIONS = tuple(IMAGE_MIME_MAP.keys())

from .config import WORKSPACE_DIR, KNOWLEDGE_DIR, DEFAULT_PROXY_URL, VIRTUAL_API_KEY, SKILL_DIR, CUSTOM_SKILL_DIR, PLUGIN_DIR
from .web_tools import check_deadline, assert_not_timed_out
from .office_tools import extract_docx_text, extract_xlsx_text, extract_pdf_text, extract_pptx_text


def get_allowed_roots(for_write: bool = False, for_outbound: bool = False) -> List[Path]:
    """Returns the set of canonical directories accessible by sandbox file tools."""
    import dsh_modules.config as cfg
    roots = []
    # 核心沙箱读写空间
    for d in [getattr(cfg, "WORKSPACE_DIR", "/workspace"), getattr(cfg, "KNOWLEDGE_DIR", "/knowledge")]:
        if d:
            try:
                roots.append(Path(d).resolve())
            except Exception:
                pass

    # 临时文件目录（允许读取/补丁临时脚本，严格禁止作为外发交付物）
    if not for_outbound:
        try:
            roots.append(Path(tempfile.gettempdir()).resolve())
            roots.append(Path("/tmp").resolve())
        except Exception:
            pass

    # 集中式技能与插件只读目录（仅允许只读检查，严禁写入或作为交付物外发）
    if not for_write and not for_outbound:
        for d in [
            getattr(cfg, "SKILL_DIR", "/opt/dsh/skills"),
            getattr(cfg, "CUSTOM_SKILL_DIR", "/knowledge/skills"),
            getattr(cfg, "PLUGIN_DIR", "/opt/dsh/plugins")
        ]:
            if d:
                try:
                    roots.append(Path(d).resolve())
                except Exception:
                    pass

    return roots


def is_path_within(target: Path, base_dirs: List[Path]) -> bool:
    """Checks whether the target path is strictly inside or equal to any base directory."""
    try:
        resolved = target.resolve()
    except Exception:
        resolved = target

    for base in base_dirs:
        try:
            base_resolved = base.resolve()
            resolved.relative_to(base_resolved)
            return True
        except ValueError:
            if resolved == base_resolved or resolved == base:
                return True
            continue
        except Exception:
            continue
    return False


def match_candidate_name(
    query: str,
    candidates: Iterable[str],
    min_similarity: float = 0.72,
    match_extension: bool = True
) -> Optional[str]:
    """Matches a query string to the best matching candidate name using normalization and stem similarity.

    Zero hardcoding: utilizes Unicode NFKC normalization and SequenceMatcher ratio on file stems.
    """
    if not query or not candidates:
        return None
    clean_query = Path(str(query).strip()).name
    cand_list = [Path(str(c).strip()).name for c in candidates if str(c).strip()]
    if not cand_list:
        return None

    # 1. Exact match
    for cand in cand_list:
        if clean_query == cand:
            return cand

    # 2. Unicode NFKC normalization match (case-insensitive)
    norm_query = unicodedata.normalize("NFKC", clean_query).casefold()
    for cand in cand_list:
        if norm_query == unicodedata.normalize("NFKC", cand).casefold():
            return cand

    # 3. Stem & SequenceMatcher similarity
    query_p = Path(clean_query)
    query_stem = unicodedata.normalize("NFKC", query_p.stem).casefold()
    query_ext = query_p.suffix.lower()
    best_cand = None
    best_ratio = 0.0

    for cand in cand_list:
        cand_p = Path(cand)
        cand_ext = cand_p.suffix.lower()
        if match_extension and query_ext and cand_ext and query_ext != cand_ext:
            continue
        cand_stem = unicodedata.normalize("NFKC", cand_p.stem).casefold()
        stem_ratio = SequenceMatcher(None, query_stem, cand_stem).ratio()
        full_ratio = SequenceMatcher(None, norm_query, unicodedata.normalize("NFKC", cand).casefold()).ratio()
        effective_ratio = min(stem_ratio, full_ratio) if query_ext else stem_ratio
        if effective_ratio > best_ratio:
            best_ratio = effective_ratio
            best_cand = cand

    if best_cand and best_ratio >= min_similarity:
        return best_cand

    return None


def _locate_readable_candidate(raw: str, ws: str, kn: str) -> Optional[Path]:
    """Tries to find an existing file in workspace or knowledge using relative path or glob matching."""
    raw_name = Path(raw).name
    kn_candidate = Path(kn) / raw
    if kn_candidate.exists():
        return kn_candidate
    ws_path = Path(ws)
    if ws_path.exists():
        try:
            ws_matches = list(ws_path.glob(f"*{raw_name}*"))
            if ws_matches:
                return ws_matches[0]
        except Exception:
            pass
        # 渐进式会话双区隔离：在 .sessions/ 中检索
        sessions_path = ws_path / ".sessions"
        if sessions_path.exists():
            try:
                for s_match in sessions_path.glob(f"*/*{raw_name}*"):
                    if s_match.is_file():
                        return s_match
            except Exception:
                pass
        # 通用相似度模糊匹配工作区文件（容错异体字与轻微拼写偏差）
        try:
            ws_files = [f.name for f in ws_path.iterdir() if f.is_file()]
            matched = match_candidate_name(raw_name, ws_files, min_similarity=0.75)
            if matched:
                cand_file = ws_path / matched
                if cand_file.exists():
                    return cand_file
        except Exception:
            pass
    kn_path = Path(kn)
    if kn_path.exists():
        try:
            kn_matches = list(kn_path.glob(f"*{raw_name}*"))
            if kn_matches:
                return kn_matches[0]
        except Exception:
            pass
        try:
            kn_files = [f.name for f in kn_path.iterdir() if f.is_file()]
            matched = match_candidate_name(raw_name, kn_files, min_similarity=0.75)
            if matched:
                cand_file = kn_path / matched
                if cand_file.exists():
                    return cand_file
        except Exception:
            pass
    return None


_PROTECTED_ATTACHMENTS_CACHE: Dict[str, Tuple[float, Set[str]]] = {}


def clear_protected_session_files_cache() -> None:
    """Clears the in-memory protected attachment filenames cache."""
    global _PROTECTED_ATTACHMENTS_CACHE
    _PROTECTED_ATTACHMENTS_CACHE.clear()


def get_protected_session_attachment_names(ws: Path) -> Set[str]:
    """Retrieves all protected session attachment filenames across the workspace with memory caching.

    Caches results per workspace directory for 60 seconds to avoid repeating expensive
    O(N_files * N_sessions) disk scans across hundreds of session directories.
    """
    global _PROTECTED_ATTACHMENTS_CACHE
    ws_key = str(ws.resolve())
    now = time.time()
    cached = _PROTECTED_ATTACHMENTS_CACHE.get(ws_key)
    if cached and (now - cached[0] < 60.0):
        return cached[1]

    names: Set[str] = set()
    env_atts = os.environ.get("DSH_SESSION_ATTACHMENTS", "")
    if env_atts:
        for fname in env_atts.split(","):
            if fname.strip():
                names.add(fname.strip())

    backup_dir = ws / ".dsh" / "inputs_backup"
    if backup_dir.is_dir():
        try:
            for item in backup_dir.iterdir():
                if item.is_file():
                    names.add(item.name)
        except Exception:
            pass

    sessions_dir = ws / ".dsh" / "sessions"
    if sessions_dir.is_dir():
        try:
            for att_file in sessions_dir.glob("*.attachments.json"):
                try:
                    with open(att_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            for item in data:
                                fname = item if isinstance(item, str) else (item.get("fileName", "") if isinstance(item, dict) else "")
                                if fname:
                                    names.add(fname)
                except Exception:
                    pass
        except Exception:
            pass

    user_sess_dir = ws / ".sessions"
    if user_sess_dir.is_dir():
        try:
            for att_file in user_sess_dir.glob("*/attachments.json"):
                try:
                    with open(att_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        if isinstance(data, list):
                            for item in data:
                                fname = item if isinstance(item, str) else (item.get("fileName", "") if isinstance(item, dict) else "")
                                if fname:
                                    names.add(fname)
                except Exception:
                    pass
        except Exception:
            pass

    _PROTECTED_ATTACHMENTS_CACHE[ws_key] = (now, names)
    return names


def is_protected_session_file(target: Path) -> bool:
    """Checks whether the file is an original input attachment in the current session."""
    try:
        # 1. 检查环境变量 DSH_SESSION_ATTACHMENTS 快速通道
        if "DSH_SESSION_ATTACHMENTS" in os.environ:
            env_atts = os.environ.get("DSH_SESSION_ATTACHMENTS", "")
            current_attachments = {f.strip() for f in env_atts.split(",") if f.strip()}
            return target.name in current_attachments

        import dsh_modules.config as cfg
        ws = Path(getattr(cfg, "WORKSPACE_DIR", "/workspace"))

        # 2. 检查当前工作区的受保护文件名缓存 (O(1) 查找，彻底消除 glob 400+ 目录的重复 IO)
        protected_names = get_protected_session_attachment_names(ws)
        if target.name in protected_names:
            return True

        # 3. 容错回退检查 target.parent (若 target 位于非根工作区的独立临时子目录)
        if target.parent.resolve() != ws.resolve():
            protected_parent_names = get_protected_session_attachment_names(target.parent)
            if target.name in protected_parent_names:
                return True
    except Exception:
        pass
    return False


def resolve_sandboxed_path(
    file_path: str,
    for_write: bool = False,
    for_outbound: bool = False
) -> Tuple[Optional[Path], Optional[str]]:
    """
    Resolves a file path and strictly enforces directory confinement within sandbox boundaries.
    Rejects path traversal ('..'), symlink escape, and system root access (/etc, /root, /proc, etc.).
    """
    if not file_path or not str(file_path).strip():
        return None, "未指定有效文件路径"

    raw = str(file_path).strip().strip("'\"")
    allowed_roots = get_allowed_roots(for_write=for_write, for_outbound=for_outbound)

    import dsh_modules.config as cfg
    ws = getattr(cfg, "WORKSPACE_DIR", "/workspace")
    kn = getattr(cfg, "KNOWLEDGE_DIR", "/knowledge")

    # 构造初始候选 Path
    candidate = Path(raw) if os.path.isabs(raw) else Path(ws) / raw

    # 若未找到，且为只读访问，尝试在知识库或模糊匹配中查找真实候选文件
    if not candidate.exists() and not for_write and not for_outbound:
        fuzzy = _locate_readable_candidate(raw, ws, kn)
        if fuzzy:
            candidate = fuzzy

    # 解析绝对符号并进行边界校验
    try:
        resolved = candidate.resolve()
    except Exception as e:
        return None, f"路径解析失败: {e}"

    if not is_path_within(resolved, allowed_roots):
        action_type = "写入与修改" if for_write else ("交付物外发" if for_outbound else "读取与访问")
        allowed_str = "/workspace, /knowledge" if (for_write or for_outbound) else "/workspace, /knowledge, /opt/dsh"
        return None, f"【安全拦截】路径越界访问拒绝: 目标文件 ({raw}) 位于沙箱指定边界 ({allowed_str}) 之外，禁止{action_type}系统目录。"

    if for_write and is_protected_session_file(resolved):
        return None, f"【安全拦截】原始输入附件 ({resolved.name}) 属于只读保护资源，禁止直接原地覆写或篡改。请将修改结果另存为新文件。"

    return resolved, None



def scan_personal_knowledge() -> str:
    """Scans personal knowledge space for reference material, saved deliverables, and custom skills"""
    import dsh_modules.config as cfg
    kn_dir = getattr(cfg, "KNOWLEDGE_DIR", KNOWLEDGE_DIR)
    kn_path = Path(kn_dir)
    if not kn_path.exists():
        return ""
    try:
        kn_resolved = kn_path.resolve()
    except Exception:
        return ""

    files = list(kn_path.glob("**/*"))
    valid_entries = []
    for f in files:
        if f.name.startswith("."):
            continue
        try:
            # 严格解析真实物理路径，禁止通过符号链接逃逸到 /knowledge 之外（如逃逸至 /etc/hosts 等）
            resolved, err = resolve_sandboxed_path(str(f), for_write=False, for_outbound=False)
            if err or not resolved or not resolved.is_file():
                continue
            if not is_path_within(resolved, [kn_resolved]):
                continue
            valid_entries.append((f, resolved))
        except Exception:
            continue

    if not valid_entries:
        return "Personal Knowledge Base (/knowledge) 目前为空。你可以将持久化交付物、报表、文档或自定义技能 (/knowledge/skills) 保存在此处。"

    summary = ["Personal Knowledge Base (/knowledge) contents:"]
    for f, resolved in valid_entries[:15]:
        try:
            rel = f.relative_to(kn_path)
            content_preview = resolved.read_text(encoding="utf-8", errors="ignore")[:300]
            summary.append(f"- File: {rel} ({resolved.stat().st_size} bytes)\n  Preview: {content_preview.strip()}")
        except Exception:
            continue
    return "\n".join(summary)


def validate_image_bytes(p: Path, image_bytes: bytes, suffix: Optional[str] = None) -> Optional[str]:
    """Performs pure-local millisecond validation of image bytes (MIP encryption and format integrity)."""
    ext = (suffix if suffix is not None else p.suffix).lower()
    if not image_bytes or len(image_bytes) == 0:
        return f"图片内容为空: {p.name}"

    # 1. 检查是否为 Microsoft Information Protection (MIP/RMS) 企业安全加密容器 (.pfile)
    if image_bytes.startswith(b'.pfile') or b'Microsoft Information Protection' in image_bytes[:2048]:
        label_match = re.search(
            r'<msip:MSIP_Label_[^>]+_Name>([^<]+)</msip:MSIP_Label_',
            image_bytes[:4096].decode('utf-8', errors='ignore'),
        )
        label_str = f"（企业安全密级标签: {label_match.group(1)}）" if label_match else ""
        return (
            f"【文件受企业安全加密保护无法解析】\n"
            f"- 文件名: {p.name}\n"
            f"- 实际数据类型: 微软企业信息保护 (Microsoft Information Protection / MIP) 加密的 .pfile 容器文件{label_str}\n"
            f"- 诊断结论: 该文件受企业机密策略与 RMS 权限服务加密保护，内部数据为受保护密文，非原生图片二进制流，无法作为图片解码或识别。\n"
            f"- 处理指引: 请在拥有企业解密权限的环境中，解除保护或另存为无加密的常规图片后再重新上传。"
        )

    # 2. 预检常规图片二进制格式完整性，避免损坏图片打崩后端上游模型
    if ext in [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]:
        try:
            from PIL import Image
            import io
            with Image.open(io.BytesIO(image_bytes)) as test_img:
                test_img.verify()
        except ImportError:
            magic_headers = {
                ".png": b"\x89PNG\r\n\x1a\n",
                ".jpg": b"\xff\xd8",
                ".jpeg": b"\xff\xd8",
                ".gif": (b"GIF87a", b"GIF89a"),
                ".webp": b"RIFF",
                ".bmp": b"BM"
            }
            exp_magic = magic_headers.get(ext)
            is_valid_magic = True
            if isinstance(exp_magic, tuple):
                is_valid_magic = any(image_bytes.startswith(m) for m in exp_magic)
            elif exp_magic:
                is_valid_magic = image_bytes.startswith(exp_magic)
            if not is_valid_magic:
                return (
                    f"【图片文件损坏或格式无效无法解析】\n"
                    f"- 文件名: {p.name}\n"
                    f"- 诊断结论: 文件头魔数异常，并非标准 {ext[1:].upper()} 格式。\n"
                    f"- 处理指引: 请检查原图是否完整，重新导出为有效图片后再行上传。"
                )
        except Exception as verify_err:
            return (
                f"【图片文件损坏或格式无效无法解析】\n"
                f"- 文件名: {p.name}\n"
                f"- 诊断结论: 文件二进制流已损坏或并非标准 {ext[1:].upper()} 格式（底层解码错误: {verify_err}），无法被视觉引擎识别解析。\n"
                f"- 处理指引: 请检查原图是否完整，重新导出为有效图片后再行上传。"
            )
    return None


def _optimize_image_bytes_for_vision(
    image_bytes: bytes,
    mime: str,
    max_dimension: int = 1800
) -> Tuple[bytes, str]:
    """Downscales oversized high-resolution images locally to reduce ViT visual token latency."""
    try:
        from PIL import Image
        import io
        with Image.open(io.BytesIO(image_bytes)) as img:
            w, h = img.size
            if max(w, h) <= max_dimension:
                return image_bytes, mime
            scale = max_dimension / float(max(w, h))
            new_size = (max(1, int(w * scale)), max(1, int(h * scale)))
            resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS", Image.BICUBIC)
            resized = img.resize(new_size, resample=resample)
            if resized.mode not in ("RGB", "L"):
                resized = resized.convert("RGB")
            buf = io.BytesIO()
            resized.save(buf, format="JPEG", quality=90, optimize=True)
            return buf.getvalue(), "image/jpeg"
    except Exception:
        return image_bytes, mime


def prepare_multimodal_image_attachment(
    file_path: str,
    max_dimension: int = 1800
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Validates an image attachment locally (zero LLM calls) and builds an OpenAI-compatible
    image_url content block for direct multimodal model invocation.
    Returns (image_part, None) on success, or (None, diagnostic_error_message) on failure.
    """
    p, err = resolve_sandboxed_path(file_path, for_write=False, for_outbound=False)
    if err:
        return None, f"无法读取图片：{err}"
    if not p.exists() or not p.is_file():
        return None, f"图片文件未找到: {file_path}"

    suffix = p.suffix.lower()
    if suffix not in IMAGE_MIME_MAP:
        return None, f"【文件格式不支持】文件 ({p.name}) 并非支持的图片格式。"

    try:
        image_bytes = p.read_bytes()
    except Exception as e:
        return None, f"读取图片文件失败 ({p.name}): {e}"

    diag_err = validate_image_bytes(p, image_bytes, suffix=suffix)
    if diag_err:
        return None, diag_err

    opt_bytes, opt_mime = _optimize_image_bytes_for_vision(
        image_bytes, IMAGE_MIME_MAP[suffix], max_dimension=max_dimension
    )
    b64_str = base64.b64encode(opt_bytes).decode("ascii")
    return (
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:{opt_mime};base64,{b64_str}",
                "detail": "auto",
            },
        },
        None,
    )


def inspect_image(
    image_path: str,
    prompt: str = "",
    max_chars: int = 15000,
    deadline: Optional[float] = None,
    model_name: Optional[str] = None,
    max_tokens: Optional[int] = None,
    telemetry: Optional[Any] = None,
    purpose: str = "image_inspection"
) -> str:
    """
    Inspects, analyzes, and extracts visual information/OCR text from an image file
    or scanned PDF located in /workspace or /knowledge via multimodal vision model proxy.
    """
    assert_not_timed_out(deadline, "image vision inspection")
    p, err = resolve_sandboxed_path(image_path, for_write=False, for_outbound=False)
    if err:
        return f"无法识别图片：{err}"
    if not p.exists():
        return f"图片文件未找到: {image_path}"

    suffix = p.suffix.lower()
    mime_map = IMAGE_MIME_MAP

    image_bytes = None
    mime = "image/jpeg"

    if suffix == ".pdf":
        try:
            # 1. 优先使用 pdf2image 高清光栅化整页（获取完整文字、图章与版面）
            try:
                import pdf2image
                import io
                imgs = pdf2image.convert_from_path(str(p), dpi=150, first_page=1, last_page=3)
                if imgs:
                    buf = io.BytesIO()
                    imgs[0].save(buf, format="JPEG", quality=85)
                    image_bytes = buf.getvalue()
                    mime = "image/jpeg"
            except Exception:
                pass

            # 2. 备选方案：通过 pypdf 提取嵌入的独立位图对象
            if not image_bytes:
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
                txt_fallback = read_workspace_file(str(p), max_chars=max_chars, deadline=deadline, model_name=model_name)
                return f"【PDF 识别提示】文档 {p.name} 无法提取有效页面图像，已尝试提取纯文本内容：\n{txt_fallback}"
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

    diag_err = validate_image_bytes(p, image_bytes or b"", suffix=suffix if suffix != ".pdf" else ".jpg")
    if diag_err:
        return diag_err

    image_bytes, mime = _optimize_image_bytes_for_vision(image_bytes, mime, max_dimension=1800)

    to_vision = check_deadline(deadline, default_timeout=120.0)
    call_id = uuid.uuid4().hex
    started = time.monotonic()
    usage = {}
    response_model = model_name or os.environ.get('DSH_MODEL') or 'default'
    if telemetry:
        telemetry.checkpoint('model_started', {'call_id': call_id, 'purpose': purpose, 'model': model_name or 'default'})
    try:
        b64_str = base64.b64encode(image_bytes).decode("ascii")

        analysis_prompt = prompt.strip() if prompt and prompt.strip() else (
            "请详细分析并解读这张图片/扫描件的内容，识别并提取图中的所有关键文字（OCR）、表格数据、条款与主体信息，给出清晰准确的中文说明。"
        )

        api_endpoint = f"{DEFAULT_PROXY_URL.rstrip('/')}/chat/completions"
        from .runtime_policy import RuntimePolicy
        pol = RuntimePolicy.from_env()
        target_model = model_name or os.environ.get("DSH_MODEL") or "default"
        payload = {
            "model": target_model,
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
            "max_tokens": max_tokens if max_tokens is not None else pol.max_tokens,
            "thinking": False,
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
            response_model = resp_data.get('model') or target_model
            assert_not_timed_out(deadline, "image vision inspection")
            usage = resp_data.get('usage') or {}
            choices = resp_data.get("choices", [])
            if purpose == 'pdf_page_review' and choices and choices[0].get('finish_reason') not in ('stop', None):
                return ('页面检查响应不完整：model=' + str(resp_data.get('model', target_model))
                        + ', finish_reason=' + str(choices[0].get('finish_reason')) + '；停止正文重写。')
            if choices:
                content = choices[0].get("message", {}).get("content", "")
                if content and content.strip():
                    for txt_name in [f"{p.stem}.txt", f"{p.name}.txt"]:
                        tp = p.parent / txt_name
                        if not tp.exists():
                            try:
                                tp.write_text(content, encoding="utf-8")
                            except Exception:
                                pass
                    return f"【文档/图片 ({p.name}) 视觉分析与内容识别结果】:\n{content[:max_chars]}"
            if purpose == 'pdf_page_review':
                return ('页面检查服务返回空正文：model=' + str(resp_data.get('model', target_model))
                        + '；这不是页面内容缺陷，停止正文重写。')
            return f"【系统提示】附件 ({p.name}) 属于扫描件/图片，当前选定模型未能识别解析出有效文字内容，无法解析。"
    except TimeoutError:
        raise
    except urllib.error.HTTPError as he:
        assert_not_timed_out(deadline, "image vision inspection")
        err_msg = ""
        try:
            err_body = he.read().decode("utf-8", errors="ignore")
            err_json = json.loads(err_body)
            err_msg = err_json.get("message") or err_json.get("error", {}).get("message", "")
        except Exception:
            pass
        if "cannot identify image" in err_msg.lower() or "unidentified" in err_msg.lower():
            return f"【图片格式异常或损坏】附件 ({p.name}) 二进制流无法被视觉模型解码识别（上游解析失败: {err_msg or he}）。"
        return f"【系统提示】附件 ({p.name}) 视觉分析请求异常 ({he.code}): {err_msg or he}"
    except urllib.error.URLError as ue:
        if isinstance(getattr(ue, "reason", None), socket.timeout) or "timed out" in str(ue).lower():
            if deadline is not None and time.monotonic() >= deadline:
                raise TimeoutError("Task total execution deadline exceeded during image vision inspection")
        assert_not_timed_out(deadline, "image vision inspection")
        return f"【系统提示】附件 ({p.name}) 图像分析网络请求失败，无法解析: {ue}"
    except Exception as e:
        assert_not_timed_out(deadline, "image vision inspection")
        if "cannot identify image" in str(e).lower():
            return f"【图片格式异常或损坏】附件 ({p.name}) 二进制流无法被视觉模型识别解析: {e}"
        return f"【系统提示】附件 ({p.name}) 视觉分析异常: {e}"

    finally:
        if telemetry:
            telemetry.record_auxiliary_call(purpose=purpose, usage=usage,
                total_ms=(time.monotonic() - started) * 1000,
                model=response_model, call_id=call_id)


def read_workspace_file(
    file_path: str,
    max_chars: int = 30000,
    start_line: Optional[int] = None,
    end_line: Optional[int] = None,
    deadline: Optional[float] = None,
    model_name: Optional[str] = None,
    prompt: Optional[str] = None,
    sheet_name: Optional[str] = None,
    cell_range: Optional[str] = None
) -> str:
    """Reads and extracts text locally from workspace or knowledge files (.docx, .xlsx, .txt, .md, .json, .py, .pdf) without calling any LLM."""
    p, err = resolve_sandboxed_path(file_path, for_write=False, for_outbound=False)
    if err:
        return err
    if not p.exists():
        return f"文件未找到: {file_path}"
    if not p.is_file():
        return f"读取失败：目标不是普通文件: {file_path}"

    suffix = p.suffix.lower()

    # 全局前置检测：若文件被 Microsoft Information Protection (MIP/RMS) 企业安全加密封装
    try:
        with open(p, "rb") as check_f:
            head_bytes = check_f.read(2048)
            if head_bytes.startswith(b'.pfile') or b'Microsoft Information Protection' in head_bytes:
                label_match = re.search(r'<msip:MSIP_Label_[^>]+_Name>([^<]+)</msip:MSIP_Label_', head_bytes.decode('utf-8', errors='ignore'))
                label_str = f"（企业安全密级标签: {label_match.group(1)}）" if label_match else ""
                return (
                    f"【文件受企业安全加密保护无法解析】\n"
                    f"- 文件名: {p.name}\n"
                    f"- 实际数据类型: 微软企业信息保护 (Microsoft Information Protection / MIP) 加密的 .pfile 容器文件{label_str}\n"
                    f"- 诊断结论: 该文件受企业机密策略与 RMS 权限服务加密保护，内部数据为受保护密文，非标准文件二进制流，平台及模型无法直接解密。\n"
                    f"- 处理指引: 请在拥有企业解密权限的环境中解除保护或重新导出为无保护文件后再上传。"
                )
    except Exception:
        pass

    # 1. Word 文档 (.docx) 原生提取
    if suffix == ".docx":
        return extract_docx_text(p, max_chars=max_chars, start_line=start_line, end_line=end_line)

    # 2. Excel 工作簿 (.xlsx) 原生提取
    elif suffix == ".xlsx":
        return extract_xlsx_text(
            p,
            max_chars=max_chars,
            start_line=start_line,
            end_line=end_line,
            prompt=prompt,
            sheet_name=sheet_name,
            cell_range=cell_range
        )

    # 3. PDF 文档 (.pdf) 原生本地文本提取（不在此处隐式调用视觉大模型）
    elif suffix == ".pdf":
        return extract_pdf_text(p, max_chars=max_chars, start_line=start_line, end_line=end_line)

    # 4. PPT 文档 (.pptx) 原生提取
    elif suffix == ".pptx":
        return extract_pptx_text(p, max_chars=max_chars, start_line=start_line, end_line=end_line)

    # 5. 检查是否有已提取的同名 .txt 缓存
    txt_sibling = p.parent / f"{p.name}.txt"
    if not txt_sibling.exists():
        txt_sibling = p.parent / f"{p.stem}.txt"
    if txt_sibling.exists() and suffix in [".docx", ".xlsx", ".pptx", *IMAGE_EXTENSIONS, ".pdf"]:
        try:
            return f"【文件 ({p.name}) 提取文本/视觉识别结果】:\n" + txt_sibling.read_text(encoding="utf-8", errors="ignore")[:max_chars]
        except Exception:
            pass

    # 6. 图片文件 (.jpg, .jpeg, .png, .webp, .gif, .bmp) 仅做本地完整性校验，不调用模型预处理
    if suffix in IMAGE_EXTENSIONS:
        try:
            img_bytes = p.read_bytes()
        except Exception as e:
            return f"读取图片文件失败 ({p.name}): {e}"
        diag_err = validate_image_bytes(p, img_bytes, suffix=suffix)
        if diag_err:
            return diag_err
        return f"【图片文件 ({p.name}) 本地预检通过（大小 {len(img_bytes)} 字节），无需文本预处理，直接交由视觉模型分析】"

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

    p, err = resolve_sandboxed_path(file_path, for_write=True, for_outbound=False)
    if err:
        return f"替换失败：{err}"
    if not p.exists():
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
    p, err = resolve_sandboxed_path(file_path, for_write=False, for_outbound=True)
    if err:
        return f"发送失败：{err}"
    if not p.exists():
        return f"文件不存在，无法发送给用户: {file_path}"
    if not p.is_file():
        return f"发送失败：目标路径 ({p.name}) 不是普通文件（不支持直接外发目录、FIFO管道或特殊设备文件）。"
    if not os.access(p, os.R_OK):
        return f"发送失败：文件不可读，缺少读取权限 ({p.name})"

    try:
        size = p.stat().st_size
        max_bytes = 500 * 1024 * 1024  # 500MB 硬上限
        if size > max_bytes:
            return f"发送失败：文件体积过大 ({size / (1024 * 1024):.1f} MB > 500 MB)，超出沙箱交付物外发上限。"
    except Exception as e:
        return f"发送失败：无法获取文件信息 ({p.name}): {e}"

    if p.suffix.lower() in (".xlsx", ".xlsm"):
        from .spreadsheet_update.delivery import validate_update_delivery
        is_valid, issues = validate_update_delivery(p)
        if not is_valid:
            return "发送失败：Excel 交付校验未通过：" + "；".join(issues[:5])

    if p.suffix.lower() == ".html":
        try:
            content = p.read_text(encoding="utf-8", errors="ignore")
            if any(cue in content for cue in ("指标核算未完成声明", "无法完成计算的原因", "本次尚未通过执行证据核验")):
                return f"发送失败：目标 HTML 文件 ({p.name}) 属于系统未完成/错误声明页面，不符合交付标准。"
        except Exception:
            pass

    payload = {
        "filePath": str(p),
        "fileName": p.name,
        "comment": comment.strip()
    }
    payload_json = json.dumps(payload, ensure_ascii=False)
    return f"<<<DSH_OUTBOUND_FILE:len={len(payload_json)}:{payload_json}>>>"
