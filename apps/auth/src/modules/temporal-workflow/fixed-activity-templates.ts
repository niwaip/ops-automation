export const FIXED_DOCUMENT_RENDER_ACTIVITY_FN = 'documentRender';

export const FIXED_DOCUMENT_RENDER_ACTIVITY_CODE = `import os
import requests
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any


@activity.defn(name="documentRender")
async def documentRender(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Shared document render Activity backed by Carbone."""
    activity.logger.info("开始执行文档渲染任务")

    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    template_id = input_data.get("templateId")
    render_data = input_data.get("data", {})
    output_format = input_data.get("outputFormat", "docx")
    output_name = input_data.get("outputName", "")

    if not template_id:
        raise ApplicationError("templateId 是必需的参数", non_retryable=True)
    if not isinstance(render_data, dict):
        raise ApplicationError("data 参数必须是字典类型", non_retryable=True)

    external_base_url = (
        os.getenv("CARBONE_EXTERNAL_URL")
        or f"http://{os.getenv('HOST_IP') or os.getenv('EXTERNAL_HOST') or 'localhost'}:3009"
    ).rstrip("/")

    candidate_base_urls = []
    configured_base_url = (
        os.getenv("CARBONE_SERVICE_URL")
        or ("http://carbone-engine:3009" if os.getenv("DOCKER_ENV") == "true" or os.getenv("NODE_ENV") == "production" else "http://localhost:3009")
    )
    if configured_base_url:
        candidate_base_urls.append(str(configured_base_url).rstrip("/"))
    candidate_base_urls.extend([
        "http://carbone-engine:3009",
        "http://host.docker.internal:3009",
        "http://localhost:3009",
    ])

    deduped_base_urls = []
    for candidate in candidate_base_urls:
        if candidate and candidate not in deduped_base_urls:
            deduped_base_urls.append(candidate)

    payload = {
        "templateId": template_id,
        "data": render_data,
        "outputFormat": output_format,
    }
    if output_name:
        payload["outputName"] = output_name

    last_error = None
    render_result = None

    for base_url in deduped_base_urls:
        render_url = base_url + "/studio/render"
        activity.logger.info(
            "开始调用 Carbone 渲染",
            extra={"templateId": template_id, "renderUrl": render_url, "fieldCount": len(render_data)},
        )
        try:
            response = requests.post(render_url, json=payload, timeout=60)
            response.raise_for_status()
            render_result = response.json()
            activity.heartbeat("carbone_render_completed")
            break
        except requests.RequestException as exc:
            last_error = exc
            activity.logger.error(
                "Carbone 渲染失败，尝试下一个地址",
                extra={"renderUrl": render_url, "error": str(exc)},
            )

    if render_result is None:
        raise ApplicationError(
            f"Carbone 渲染失败: {str(last_error) if last_error else 'unknown error'}",
            non_retryable=False,
        )

    download_url = render_result.get("downloadUrl")
    if isinstance(download_url, str) and download_url.startswith("/"):
        download_url = external_base_url + download_url
    elif not isinstance(download_url, str) or not download_url.strip():
        document_id = render_result.get("documentId")
        if isinstance(document_id, str) and document_id.strip():
            download_url = f"{external_base_url}/studio/download/{document_id}"
        else:
            raise ApplicationError("Carbone 返回结果缺少 downloadUrl/documentId", non_retryable=True)

    return {
        "status": "rendered",
        "templateId": template_id,
        "downloadUrl": download_url,
        "fileName": render_result.get("fileName"),
        "format": render_result.get("format", output_format),
        "documentId": render_result.get("documentId"),
    }
`;
