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

# Config
WORKSPACE_DIR = os.environ.get("WORKSPACE", "/workspace")
KNOWLEDGE_DIR = os.environ.get("KNOWLEDGE_DIR", "/knowledge")
DEFAULT_PROXY_URL = os.environ.get("DEEPSEEK_BASE_URL", "http://ops-ai-orchestrator:3007/ai/proxy/v1")
VIRTUAL_API_KEY = os.environ.get("DEEPSEEK_API_KEY", os.environ.get("OPENAI_API_KEY", "sandbox-user-token-local"))


def generate_image(params: dict) -> str:
    prompt = params.get("prompt") or params.get("query") or params.get("text") or ""
    if isinstance(prompt, list):
        prompt = " ".join(str(x) for x in prompt)
    prompt = str(prompt).strip()

    if not prompt:
        return "【系统提示】生图请求缺少必要的 prompt 提示词。"

    aspect_ratio = params.get("aspect_ratio") or params.get("ratio") or "1:1"
    output_filename = params.get("output_filename") or params.get("filename") or f"image_{int(os.times().elapsed * 1000)}.png"
    if not output_filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        output_filename += ".png"

    input_image = params.get("input_image") or params.get("image") or params.get("ref_image") or ""

    # 如果指定了参考图（以图生图/多轮编辑），先校验参考图是否存在
    if input_image:
        ref_path = Path(WORKSPACE_DIR) / input_image
        if not ref_path.exists():
            ref_path = Path(KNOWLEDGE_DIR) / input_image
        if not ref_path.exists():
            # 模糊匹配
            candidates = list(Path(WORKSPACE_DIR).glob(f"*{input_image}*"))
            if candidates:
                ref_path = candidates[0]
            else:
                return f"【系统提示】指定的参考图片不存在: {input_image}"

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
                        with urllib.request.urlopen(item["url"], timeout=60) as img_resp:
                            img_data = img_resp.read()

                    if img_data:
                        out_path = Path(WORKSPACE_DIR) / output_filename
                        out_path.parent.mkdir(parents=True, exist_ok=True)
                        out_path.write_bytes(img_data)

                        marker = json.dumps({
                            "filePath": str(out_path),
                            "fileName": out_path.name,
                            "comment": f"AI 生成图像: {prompt[:30]}"
                        }, ensure_ascii=False)
                        print(f"\n<<<DSH_OUTBOUND_FILE:{marker}>>>\n")
                        return f"【图像生成成功】已保存至 /workspace/{out_path.name}，并已为您自动推送至聊天界面。"
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
