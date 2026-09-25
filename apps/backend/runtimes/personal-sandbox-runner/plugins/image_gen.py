#!/usr/bin/env python3
"""
Image Generation Plugin for DeepSeek Harness (dsh).
Uses the system's default model / internal proxy.
If the default model does not support vision or image generation, gracefully informs the user.
"""

import os
import sys
import json
import base64
import time
import urllib.request
import urllib.error
from pathlib import Path

# Setup import path for dsh_modules
current_dir = Path(__file__).resolve().parent
for search_dir in [
    current_dir.parent / "src",
    Path("/usr/local/bin"),
    Path("/opt/dsh/src"),
]:
    if search_dir.exists() and str(search_dir) not in sys.path:
        sys.path.insert(0, str(search_dir))

from dsh_modules.file_tools import resolve_sandboxed_path
from dsh_modules.telemetry import format_dsh_marker
try:
    from dsh_modules.web_tools import (
        is_safe_web_url,
        SSRFSafeRedirectHandler,
        SSRFHTTPHandler,
        SSRFHTTPSHandler
    )
except ImportError:
    is_safe_web_url = None
    SSRFSafeRedirectHandler = None
    SSRFHTTPHandler = None
    SSRFHTTPSHandler = None

# Config
WORKSPACE_DIR = os.environ.get("WORKSPACE", "/workspace")
KNOWLEDGE_DIR = os.environ.get("KNOWLEDGE_DIR", "/knowledge")
DEFAULT_PROXY_URL = os.environ.get("DEEPSEEK_BASE_URL", "http://ops-ai-orchestrator:3007/ai/proxy/v1")
VIRTUAL_API_KEY = os.environ.get("DEEPSEEK_API_KEY", os.environ.get("OPENAI_API_KEY", "sandbox-user-token-local"))
MAX_IMAGE_DOWNLOAD_BYTES = 25 * 1024 * 1024  # 25MB 上限


def _download_image_safely(url: str, timeout: int = 30) -> tuple:
    """
    Safely downloads image URL with SSRF checks, redirect protection, and response size limits.
    Returns (image_bytes, error_reason).
    """
    if is_safe_web_url and SSRFSafeRedirectHandler:
        safe, err = is_safe_web_url(url)
        if not safe:
            return None, f"生图下载地址未通过 SSRF 安全检查: {err}"
        opener = urllib.request.build_opener(
            SSRFSafeRedirectHandler(),
            SSRFHTTPHandler(),
            SSRFHTTPSHandler()
        )
    else:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return None, f"不支持的下载协议: {parsed.scheme}"
        opener = urllib.request.build_opener()

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "DeepSeek-Harness-ImageDownloader/1.0",
            "Accept": "image/*,*/*;q=0.8"
        }
    )

    try:
        with opener.open(req, timeout=timeout) as resp:
            cl_header = resp.headers.get("Content-Length")
            if cl_header:
                try:
                    if int(cl_header) > MAX_IMAGE_DOWNLOAD_BYTES:
                        return None, f"图片体积过大 ({int(cl_header) // (1024 * 1024)}MB > 25MB)，拒绝下载"
                except ValueError:
                    pass

            chunks = []
            total = 0
            while True:
                chunk = resp.read(64 * 1024)
                if not chunk:
                    break
                chunks.append(chunk)
                total += len(chunk)
                if total > MAX_IMAGE_DOWNLOAD_BYTES:
                    return None, "图片数据超出最大体积限制 (25MB)，已中止下载"

            img_bytes = b"".join(chunks)
            if not img_bytes:
                return None, "下载的图片内容为空"

            is_valid_image = (
                img_bytes.startswith(b"\x89PNG\r\n\x1a\n")
                or img_bytes.startswith(b"\xff\xd8\xff")
                or (img_bytes.startswith(b"RIFF") and b"WEBP" in img_bytes[:16])
                or img_bytes.startswith(b"GIF87a") or img_bytes.startswith(b"GIF89a")
                or img_bytes.startswith(b"BM")
            )
            if not is_valid_image:
                return None, "下载的数据不是合法的图片格式文件"

            return img_bytes, None
    except urllib.error.HTTPError as he:
        return None, f"下载图片失败 (HTTP {he.code}): {he.reason}"
    except Exception as e:
        return None, f"下载图片异常: {e}"


def generate_image(params: dict) -> str:
    prompt = params.get("prompt") or params.get("query") or params.get("text") or ""
    if isinstance(prompt, list):
        prompt = " ".join(str(x) for x in prompt)
    prompt = str(prompt).strip()

    if not prompt:
        return "【系统提示】生图请求缺少必要的 prompt 提示词。"

    aspect_ratio = params.get("aspect_ratio") or params.get("ratio") or "1:1"
    raw_output_filename = params.get("output_filename") or params.get("filename") or f"image_{int(os.times().elapsed * 1000)}.png"
    if not str(raw_output_filename).lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        raw_output_filename = f"{raw_output_filename}.png"

    # 输出路径边界校验（必须在 /workspace 或 /knowledge 边界内）
    out_path, out_err = resolve_sandboxed_path(str(raw_output_filename), for_write=True, for_outbound=True)
    if out_err or not out_path:
        return f"【系统拦截】图片输出路径非法: {out_err}"

    input_image = params.get("input_image") or params.get("image") or params.get("ref_image") or ""

    # 如果指定了参考图（以图生图/多轮编辑），先校验参考图是否存在且未越界，并读取编码注入 payload
    ref_data_url = None
    if input_image:
        ref_path, ref_err = resolve_sandboxed_path(str(input_image), for_write=False, for_outbound=False)
        if ref_err or not ref_path or not ref_path.exists() or not ref_path.is_file():
            return f"【系统提示】指定的参考图片不存在或访问被拒绝: {ref_err or input_image}"
        try:
            ref_size = ref_path.stat().st_size
            if ref_size > 10 * 1024 * 1024:
                return f"【系统提示】指定的参考图片过大 ({ref_size // (1024 * 1024)}MB > 10MB)，请提供小于 10MB 的图片。"
            ref_bytes = ref_path.read_bytes()
            ext = ref_path.suffix.lower().lstrip(".")
            mime = "image/png" if ext == "png" else "image/jpeg" if ext in ("jpg", "jpeg") else "image/webp" if ext == "webp" else "application/octet-stream"
            b64_content = base64.b64encode(ref_bytes).decode("utf-8")
            ref_data_url = f"data:{mime};base64,{b64_content}"
        except Exception as e:
            return f"【系统提示】读取参考图片失败: {e}"

    # 尺寸映射
    size_map = {
        "1:1": "1024x1024",
        "16:9": "1280x720",
        "9:16": "720x1280",
        "4:3": "1024x768",
        "3:4": "768x1024"
    }
    size = size_map.get(aspect_ratio, "1024x1024")

    # 尝试通过系统默认模型代理端点调用生图接口
    api_endpoint = f"{DEFAULT_PROXY_URL.rstrip('/')}/images/generations"
    payload = {
        "prompt": prompt,
        "n": 1,
        "size": size,
        "response_format": "b64_json"
    }
    if ref_data_url:
        payload["image"] = ref_data_url
        payload["ref_image"] = ref_data_url
        payload["input_image"] = ref_data_url

    max_retries = 2
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                api_endpoint,
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {VIRTUAL_API_KEY}"
                }
            )
            with urllib.request.urlopen(req, timeout=60) as response:
                resp_data = json.loads(response.read().decode("utf-8"))
                data_list = resp_data.get("data", [])
                if data_list:
                    item = data_list[0]
                    img_data = None
                    if "b64_json" in item:
                        img_data = base64.b64decode(item["b64_json"])
                    elif "url" in item:
                        img_data, dl_err = _download_image_safely(item["url"])
                        if dl_err:
                            return f"【系统拦截】{dl_err}"

                    if img_data:
                        out_path.parent.mkdir(parents=True, exist_ok=True)
                        out_path.write_bytes(img_data)

                        marker = json.dumps({
                            "filePath": str(out_path),
                            "fileName": out_path.name,
                            "comment": f"AI 生成图像: {prompt[:30]}"
                        }, ensure_ascii=False)
                        print(f"\n{format_dsh_marker('OUTBOUND_FILE', marker)}\n")
                        return f"【图像生成成功】已保存至 {out_path}，并已为您自动推送至聊天界面。"
        except urllib.error.HTTPError as he:
            if he.code in (502, 503, 504) and attempt < max_retries - 1:
                time.sleep(1.5)
                continue
            try:
                err_data = json.loads(he.read().decode("utf-8"))
                code = err_data.get("error", {}).get("code")
                msg = err_data.get("error", {}).get("message") or err_data.get("message")
                if code == "IMAGE_GENERATION_MODEL_UNCONFIGURED":
                    return f"【系统提示】{msg}"
                if msg:
                    return f"【生图服务返回异常】(HTTP {he.code}): {msg}"
            except Exception:
                pass
            return f"【生图服务返回异常】(HTTP {he.code}): 上游生图接口响应异常，请稍后重试。"
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1.5)
                continue
            return f"【生图请求异常】: {str(e)}"

    return "【系统提示】上游生图模型未返回有效的图像数据。"


def main():
    raw_args = " ".join(sys.argv[1:]).strip()
    params = {}
    if raw_args:
        try:
            params = json.loads(raw_args)
        except Exception:
            params = {"prompt": raw_args}

    result = generate_image(params)
    print(result)


if __name__ == "__main__":
    main()
