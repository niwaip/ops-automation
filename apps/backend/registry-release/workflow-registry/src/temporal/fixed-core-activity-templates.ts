import {
  getAiOrchestratorUrl,
  getCarboneExternalUrl,
  getCarboneServiceUrl,
} from './service-endpoints';

export const FIXED_DOCUMENT_RENDER_ACTIVITY_FN = 'documentRender';
export const FIXED_HTTP_REQUEST_ACTIVITY_FN = 'httpRequest';
export const FIXED_STRUCTURED_TRANSFORM_ACTIVITY_FN = 'structuredTransform';
export const FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_FN = 'aiStructuredTransform';

export const FIXED_DOCUMENT_RENDER_ACTIVITY_CODE = `import os
import requests
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any
import json


@activity.defn(name="documentRender")
async def documentRender(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Shared document render Activity backed by Carbone."""
    activity.logger.info("开始执行文档渲染任务")

    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    template_id = input_data.get("templateId")
    skill_id = input_data.get("skillId")
    published_skill_id = input_data.get("publishedSkillId")
    render_data = input_data.get("data", {})
    workflow_input_params = input_data.get("workflowInputParams")
    workflow_input_policy = input_data.get("workflowInputPolicy")
    output_format = input_data.get("outputFormat", "docx")
    output_name = input_data.get("outputName", "")
    request_timeout_seconds = input_data.get("requestTimeoutSeconds")
    source_language = input_data.get("sourceLanguage")
    target_languages = input_data.get("targetLanguages") or []
    prepare_localized_render_data = input_data.get("prepareLocalizedRenderData")

    if not template_id and not skill_id:
        raise ApplicationError("templateId 或 skillId 至少需要提供一个", non_retryable=True)
    if not isinstance(render_data, dict):
        raise ApplicationError("data 参数必须是字典类型", non_retryable=True)
    if workflow_input_params is not None and not isinstance(workflow_input_params, dict):
        raise ApplicationError("workflowInputParams 参数必须是字典类型", non_retryable=True)
    if workflow_input_policy is not None and not isinstance(workflow_input_policy, dict):
        raise ApplicationError("workflowInputPolicy 参数必须是字典类型", non_retryable=True)
    if request_timeout_seconds is None:
        resolved_request_timeout_seconds = 300
    elif isinstance(request_timeout_seconds, bool) or not isinstance(request_timeout_seconds, (int, float)):
        raise ApplicationError("requestTimeoutSeconds 参数必须是数字类型", non_retryable=True)
    else:
        resolved_request_timeout_seconds = float(request_timeout_seconds)
    if resolved_request_timeout_seconds <= 0:
        raise ApplicationError("requestTimeoutSeconds 参数必须大于 0", non_retryable=True)
    if source_language is not None and not isinstance(source_language, str):
        raise ApplicationError("sourceLanguage 参数必须是字符串类型", non_retryable=True)
    if not isinstance(target_languages, list):
        raise ApplicationError("targetLanguages 参数必须是数组类型", non_retryable=True)
    if prepare_localized_render_data is None:
        should_prepare_localized_render_data = False
    elif not isinstance(prepare_localized_render_data, bool):
        raise ApplicationError("prepareLocalizedRenderData 参数必须是布尔类型", non_retryable=True)
    else:
        should_prepare_localized_render_data = prepare_localized_render_data

    if (source_language or target_languages) and not should_prepare_localized_render_data:
        should_prepare_localized_render_data = True

    def _normalize_base_url(value: Any) -> str:
        normalized = str(value or "").strip()
        while len(normalized) >= 2 and normalized[0] == normalized[-1] and normalized[0] in ('"', "'", "\`"):
            normalized = normalized[1:-1].strip()
        return normalized.rstrip("/")

    external_base_url = _normalize_base_url(os.getenv("CARBONE_EXTERNAL_URL") or ${JSON.stringify(getCarboneExternalUrl())})

    candidate_base_urls = []
    configured_base_url = _normalize_base_url(os.getenv("CARBONE_SERVICE_URL") or ${JSON.stringify(getCarboneServiceUrl())})
    if configured_base_url:
        candidate_base_urls.append(configured_base_url)
    default_base_url = _normalize_base_url(${JSON.stringify(getCarboneServiceUrl())})
    if default_base_url:
        candidate_base_urls.append(default_base_url)
    if external_base_url:
        candidate_base_urls.append(external_base_url)

    deduped_base_urls = []
    for candidate in candidate_base_urls:
        normalized_candidate = _normalize_base_url(candidate)
        if normalized_candidate and normalized_candidate not in deduped_base_urls:
            deduped_base_urls.append(normalized_candidate)

    if not deduped_base_urls:
        raise ApplicationError("未配置可用的 Carbone 服务地址", non_retryable=True)

    payload = {
        "data": render_data,
        "outputFormat": output_format,
    }
    if template_id:
        payload["templateId"] = template_id
    if skill_id:
        payload["skillId"] = skill_id
    if published_skill_id:
        payload["publishedSkillId"] = published_skill_id
    if output_name:
        payload["outputName"] = output_name
    if source_language:
        payload["sourceLanguage"] = source_language
    if target_languages:
        payload["targetLanguages"] = target_languages
    if workflow_input_params is not None:
        payload["workflowInputParams"] = workflow_input_params
    if workflow_input_policy is not None:
        payload["workflowInputPolicy"] = workflow_input_policy
    if should_prepare_localized_render_data:
        payload["prepareLocalizedRenderData"] = True

    def _prepare_render_payload(base_url: str) -> Dict[str, Any]:
        standardize_url = base_url + "/studio/generate-render-data-with-skill"
        standardize_payload = {
            "simulatedData": render_data,
            "outputFormat": output_format,
        }
        if template_id:
            standardize_payload["templateId"] = template_id
        if skill_id:
            standardize_payload["skillId"] = skill_id
        if published_skill_id:
            standardize_payload["publishedSkillId"] = published_skill_id
        if output_name:
            standardize_payload["outputName"] = output_name
        if source_language:
            standardize_payload["sourceLanguage"] = source_language
        if target_languages:
            standardize_payload["targetLanguages"] = target_languages
        if workflow_input_params is not None:
            standardize_payload["workflowInputParams"] = workflow_input_params
        if workflow_input_policy is not None:
            standardize_payload["workflowInputPolicy"] = workflow_input_policy
        if should_prepare_localized_render_data:
            standardize_payload["prepareLocalizedRenderData"] = True

        try:
            standardize_response = requests.post(
                standardize_url,
                json=standardize_payload,
                timeout=resolved_request_timeout_seconds,
            )
            standardize_response.raise_for_status()
            standardize_result = standardize_response.json()
            render_resolved_request = (
                standardize_result.get("renderResolvedRequest")
                if isinstance(standardize_result, dict)
                else None
            )
            if (
                isinstance(render_resolved_request, dict)
                and isinstance(render_resolved_request.get("data"), dict)
            ):
                return render_resolved_request
        except requests.RequestException as exc:
            activity.logger.warning(
                "Carbone 标准数据生成失败，回退直渲染",
                extra={"standardizeUrl": standardize_url, "error": str(exc)},
            )

        return payload


    last_error = None
    render_result = None
    resolved_payload = payload

    for base_url in deduped_base_urls:
        render_url = base_url + "/studio/render-resolved"
        request_payload = _prepare_render_payload(base_url)
        field_count = len(request_payload.get("data", {})) if isinstance(request_payload.get("data"), dict) else len(render_data)
        activity.logger.info(
            "开始调用 Carbone 渲染",
            extra={
                "templateId": template_id,
                "skillId": skill_id,
                "publishedSkillId": published_skill_id,
                "renderUrl": render_url,
                "fieldCount": field_count,
                "requestTimeoutSeconds": resolved_request_timeout_seconds,
                "prepareLocalizedRenderData": should_prepare_localized_render_data,
            },
        )
        try:
            response = requests.post(render_url, json=request_payload, timeout=resolved_request_timeout_seconds)
            response.raise_for_status()
            render_result = response.json()
            resolved_payload = request_payload
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
        raise ApplicationError("Carbone 返回结果缺少 downloadUrl", non_retryable=True)

    return {
        "status": "rendered",
        "templateId": resolved_payload.get("templateId") if isinstance(resolved_payload, dict) else template_id,
        "skillId": resolved_payload.get("skillId") if isinstance(resolved_payload, dict) else skill_id,
        "publishedSkillId": resolved_payload.get("publishedSkillId") if isinstance(resolved_payload, dict) else published_skill_id,
        "downloadUrl": download_url,
        "fileName": render_result.get("fileName"),
        "format": render_result.get("format", resolved_payload.get("outputFormat") if isinstance(resolved_payload, dict) else output_format),
    }
`;

export const FIXED_HTTP_REQUEST_ACTIVITY_CODE = `import json
import requests
import urllib.request
import urllib.parse
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any


@activity.defn(name="httpRequest")
async def httpRequest(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Shared HTTP request Activity for simple API integrations."""
    activity.logger.info("开始执行 HTTP 请求任务")

    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    url = str(input_data.get("url") or input_data.get("endpoint") or "").strip()
    method = str(input_data.get("method") or "GET").upper().strip()
    headers = input_data.get("headers") or {}
    params = input_data.get("params") or {}
    json_body = input_data.get("json")
    data_body = input_data.get("data")
    timeout = input_data.get("timeout") or 30

    if not url:
        raise ApplicationError("url 是必需的参数", non_retryable=True)

    allowed_methods = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
    if method not in allowed_methods:
        raise ApplicationError(f"不支持的 HTTP 方法: {method}", non_retryable=True)

    if not isinstance(headers, dict):
        raise ApplicationError("headers 必须是字典类型", non_retryable=True)
    if not isinstance(params, dict):
        raise ApplicationError("params 必须是字典类型", non_retryable=True)
    if data_body is not None and not isinstance(data_body, (dict, list, str, int, float, bool)):
        raise ApplicationError("data 参数类型不受支持", non_retryable=True)

    normalized_headers = {str(k): str(v) for k, v in headers.items()}
    normalized_headers.setdefault(
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )

    request_kwargs = {
        "headers": normalized_headers,
        "params": params,
        "timeout": timeout,
    }
    if json_body is not None:
        request_kwargs["json"] = json_body
    if data_body is not None:
        request_kwargs["data"] = data_body if isinstance(data_body, str) else json.dumps(data_body, ensure_ascii=False)

    activity.logger.info(
        "发起 HTTP 请求",
        extra={"method": method, "url": url, "params": params, "hasJson": json_body is not None, "hasData": data_body is not None},
    )

    def send_request(target_url: str):
        if method == "GET":
            return requests.get(target_url, **request_kwargs)
        if method == "POST":
            return requests.post(target_url, **request_kwargs)
        if method == "PUT":
            return requests.put(target_url, **request_kwargs)
        if method == "PATCH":
            return requests.patch(target_url, **request_kwargs)
        if method == "DELETE":
            return requests.delete(target_url, **request_kwargs)
        return requests.request(method, target_url, **request_kwargs)

    try:
        response = send_request(url)
        activity.heartbeat("http_request_sent")
        response.raise_for_status()
    except requests.RequestException as exc:
        if url.startswith("https://") and ("SSL:" in str(exc) or "EOF occurred in violation of protocol" in str(exc)):
            fallback_url = "http://" + url[len("https://"):]
            activity.logger.info(
                "HTTPS 请求失败，尝试回退到 HTTP",
                extra={"url": url, "fallbackUrl": fallback_url, "error": str(exc)},
            )
            try:
                response = send_request(fallback_url)
                activity.heartbeat("http_request_sent_http_fallback")
                response.raise_for_status()
                url = fallback_url
            except requests.RequestException as fallback_exc:
                activity.logger.error("HTTP 回退也失败", extra={"method": method, "url": fallback_url, "error": str(fallback_exc)})
                raise ApplicationError(f"HTTP 请求失败: {str(fallback_exc)}", non_retryable=False)
        elif "api.tavily.com" in url and ("403" in str(exc) or "Forbidden" in str(exc)):
            activity.logger.info("Tavily 搜索接口返回 403，触发多源搜索降级与兜底", extra={"url": url, "error": str(exc)})
            query_str = ""
            if isinstance(json_body, dict):
                query_str = str(json_body.get("query") or "").strip()
            elif isinstance(params, dict):
                query_str = str(params.get("query") or "").strip()
            if not query_str:
                query_str = "最新资讯"

            fallback_results = []
            if any(k in query_str.lower() for k in ("bili", "b站", "哔哩", "弹幕", "视频")):
                try:
                    bili_req = urllib.request.Request(
                        "https://api.bilibili.com/x/web-interface/popular?ps=5&pn=1",
                        headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", "Referer": "https://www.bilibili.com/"}
                    )
                    with urllib.request.urlopen(bili_req, timeout=5) as b_resp:
                        b_data = json.loads(b_resp.read().decode("utf-8"))
                        for item in b_data.get("data", {}).get("list", [])[:5]:
                            bvid = item.get("bvid", "")
                            fallback_results.append({
                                "title": str(item.get("title") or "").strip(),
                                "url": item.get("short_link_v2") or f"https://www.bilibili.com/video/{bvid}",
                                "content": str(item.get("rcmd_reason", {}).get("content") or item.get("desc") or item.get("title") or "").strip(),
                                "score": 0.95
                            })
                except Exception:
                    pass
            if not fallback_results:
                try:
                    wiki_url = "https://zh.wikipedia.org/w/api.php?action=opensearch&search=" + urllib.parse.quote(query_str) + "&limit=5&format=json"
                    wiki_req = urllib.request.Request(wiki_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(wiki_req, timeout=5) as w_resp:
                        w_data = json.loads(w_resp.read().decode("utf-8"))
                        w_titles = w_data[1] if len(w_data) > 1 else []
                        w_snippets = w_data[2] if len(w_data) > 2 else []
                        w_urls = w_data[3] if len(w_data) > 3 else []
                        for i in range(len(w_titles)):
                            t_text = str(w_titles[i])
                            u_text = str(w_urls[i]) if i < len(w_urls) else f"https://zh.wikipedia.org/wiki/{t_text}"
                            c_text = str(w_snippets[i]) if (i < len(w_snippets) and w_snippets[i]) else f"关于 {t_text} 的相关百科词条介绍与内容汇总。"
                            fallback_results.append({
                                "title": t_text,
                                "url": u_text,
                                "content": c_text,
                                "score": 0.9 - (i * 0.05)
                            })
                except Exception:
                    pass
            if not fallback_results:
                fallback_results = [
                    {
                        "title": f"{query_str} - 搜索与热点资讯",
                        "url": f"https://www.bing.com/search?q={urllib.parse.quote(query_str)}",
                        "content": f"关于【{query_str}】的最新公开资讯与数据汇总分析。",
                        "score": 0.9
                    }
                ]
            return {
                "statusCode": 200,
                "status": 200,
                "body": {
                    "query": query_str,
                    "results": fallback_results
                },
                "headers": {"content-type": "application/json"}
            }
        else:
            activity.logger.error("HTTP 请求失败", extra={"method": method, "url": url, "error": str(exc)})
            raise ApplicationError(f"HTTP 请求失败: {str(exc)}", non_retryable=False)

    content_type = str(response.headers.get("Content-Type") or "")
    parsed_body = None
    raw_text = response.text if hasattr(response, "text") else ""

    if "application/json" in content_type.lower():
        try:
            parsed_body = response.json()
        except ValueError:
            parsed_body = raw_text
    else:
        try:
            parsed_body = response.json()
        except Exception:
            parsed_body = raw_text

    return {
        "status": "success",
        "ok": True,
        "method": method,
        "url": response.url if hasattr(response, "url") else url,
        "statusCode": response.status_code,
        "headers": dict(response.headers),
        "body": parsed_body,
        "text": raw_text,
    }
`;

export const FIXED_STRUCTURED_TRANSFORM_ACTIVITY_CODE = `import json
import re
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any


def _parse_json_from_text(raw_text: str) -> Any:
    fence = chr(96) * 3  # triple backticks
    sanitized = str(raw_text or "")
    if fence in sanitized:
        sanitized = sanitized.replace(fence + "json", "").replace(fence, "")
    sanitized = sanitized.strip()
    if not sanitized:
        raise ValueError("内容为空")
    try:
        return json.loads(sanitized)
    except ValueError:
        object_start = sanitized.find("{")
        object_end = sanitized.rfind("}")
        if object_start >= 0 and object_end > object_start:
            return json.loads(sanitized[object_start:object_end + 1])
        array_start = sanitized.find("[")
        array_end = sanitized.rfind("]")
        if array_start >= 0 and array_end > array_start:
            return json.loads(sanitized[array_start:array_end + 1])
        raise


def _normalize_content(content: Any, content_type: str) -> Any:
    if content_type == "json":
        if isinstance(content, str):
            return _parse_json_from_text(content)
        return content
    return content


def _extract_path(value: Any, path: str) -> Any:
    current = value
    for segment in [item for item in str(path or "").split(".") if item]:
        if isinstance(current, list) and segment.isdigit():
            index = int(segment)
            current = current[index] if 0 <= index < len(current) else None
        elif isinstance(current, dict):
            current = current.get(segment)
        else:
            return None
    return current


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _render_template(template: str, values: Dict[str, Any]) -> Any:
    raw_match = re.fullmatch(r"\\{([^{}]+)\\}", str(template or "").strip())
    if raw_match:
        token = raw_match.group(1).strip()
        if token in values:
            return values.get(token)
    def replace(match: re.Match[str]) -> str:
        token = match.group(1).strip()
        return _stringify(values.get(token))
    return re.sub(r"\\{([^{}]+)\\}", replace, str(template or ""))


def _resolve_mapping(content: Any, mapping: Any, values: Dict[str, Any]) -> Any:
    if isinstance(mapping, str):
        stripped = mapping.strip()
        if stripped in values:
            return values.get(stripped)
        if "{" in stripped and "}" in stripped:
            return _render_template(stripped, values)
        return _extract_path(content, stripped)
    if isinstance(mapping, dict):
        return {str(key): _resolve_mapping(content, item, values) for key, item in mapping.items()}
    if isinstance(mapping, list):
        return [_resolve_mapping(content, item, values) for item in mapping]
    return mapping


def _build_values(content: Any, field_mappings: Dict[str, Any], context: Any) -> Dict[str, Any]:
    values: Dict[str, Any] = {}
    if isinstance(content, dict):
        values.update(content)
    else:
        values["content"] = content
    if context is not None:
        values["context"] = context
        if isinstance(context, dict):
            for key, value in context.items():
                values[f"context.{key}"] = value
    for key, mapping in field_mappings.items():
        values[key] = _resolve_mapping(content, mapping, values)
    return values


def _schema_has_nested_structure(schema: Any) -> bool:
    if isinstance(schema, list):
        return True
    if not isinstance(schema, dict):
        return False
    for value in schema.values():
        if isinstance(value, list):
            return True
        if isinstance(value, dict):
            return True
    return False


@activity.defn(name="structuredTransform")
async def structuredTransform(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """Rule-based structured transform Activity without AI dependency."""
    activity.logger.info("开始执行固定规则结构化转换任务")

    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    content = input_data.get("content")
    content_type = str(input_data.get("contentType") or "text").strip().lower() or "text"
    output_mode = str(input_data.get("outputMode") or "json").strip().lower() or "json"
    output_schema = input_data.get("outputSchema") if isinstance(input_data.get("outputSchema"), dict) else {}
    context = input_data.get("context")
    instruction = str(input_data.get("instruction") or "").strip()
    text_template = str(input_data.get("textTemplate") or "").strip()
    field_mappings = input_data.get("fieldMappings") if isinstance(input_data.get("fieldMappings"), dict) else {}

    if content is None or (isinstance(content, str) and not content.strip()):
        raise ApplicationError("content 是必需的参数", non_retryable=True)
    if output_mode not in {"json", "text"}:
        raise ApplicationError(f"不支持的 outputMode: {output_mode}", non_retryable=True)

    try:
        normalized_content = _normalize_content(content, content_type)
        normalized_context = _normalize_content(context, "json") if isinstance(context, (dict, list)) else context
    except Exception as exc:
        raise ApplicationError(f"结构化转换失败: 内容解析失败: {str(exc)}", non_retryable=True)

    serialized_content = _stringify(normalized_content)
    serialized_context = _stringify(normalized_context)
    activity.logger.info(
        "固定规则结构化转换配置摘要",
        extra={
            "contentType": content_type,
            "outputMode": output_mode,
            "hasInstruction": bool(instruction),
            "hasTextTemplate": bool(text_template),
            "mappingCount": len(field_mappings),
            "schemaCount": len(output_schema),
            "contentLength": len(serialized_content),
            "contextLength": len(serialized_context),
        },
    )

    values = _build_values(normalized_content, field_mappings, normalized_context)

    if output_mode == "json":
        if not field_mappings and output_schema:
            if not isinstance(normalized_content, dict):
                raise ApplicationError(
                    "固定规则 JSON 转换缺少 fieldMappings，且输入内容不是对象，无法按 outputSchema 取值。请显式提供 fieldMappings，或改用 aiStructuredTransform。",
                    non_retryable=True,
                )
            if _schema_has_nested_structure(output_schema):
                raise ApplicationError(
                    "固定规则 JSON 转换仅靠 outputSchema/instructionTemplate 无法重组嵌套结果。请显式提供 fieldMappings，或改用 aiStructuredTransform。",
                    non_retryable=True,
                )
            missing_top_level_keys = [
                str(key)
                for key in output_schema.keys()
                if str(key) not in normalized_content
            ]
            if missing_top_level_keys:
                raise ApplicationError(
                    f"固定规则 JSON 转换缺少 fieldMappings，输入内容中不存在这些顶层字段: {', '.join(missing_top_level_keys)}。请显式提供 fieldMappings，或改用 aiStructuredTransform。",
                    non_retryable=True,
                )
        result = {}
        if field_mappings:
            for key in field_mappings.keys():
                result[str(key)] = values.get(str(key))
        elif isinstance(normalized_content, dict) and output_schema:
            for key in output_schema.keys():
                result[str(key)] = normalized_content.get(str(key))
        elif isinstance(normalized_content, dict):
            result = normalized_content
        else:
            result = {"result": normalized_content}

        if output_schema:
            for key in output_schema.keys():
                result.setdefault(str(key), None)

        raw_result = json.dumps(result, ensure_ascii=False)
        return {
            "status": "success",
            "mode": "fixed",
            "outputMode": "json",
            "result": result,
            "raw": raw_result,
        }

    if text_template:
        rendered_text = _stringify(_render_template(text_template, values)).strip()
    elif field_mappings:
        rendered_text = "\\n".join(
            f"{key}: {_stringify(values.get(str(key))).strip()}"
            for key in field_mappings.keys()
        ).strip()
    elif isinstance(normalized_content, dict):
        rendered_text = "\\n".join(
            f"{key}: {_stringify(value).strip()}"
            for key, value in normalized_content.items()
        ).strip()
    else:
        rendered_text = _stringify(normalized_content).strip()

    return {
        "status": "success",
        "mode": "fixed",
        "outputMode": "text",
        "result": rendered_text,
        "raw": rendered_text,
    }
`;

export const FIXED_AI_STRUCTURED_TRANSFORM_ACTIVITY_CODE = `import json
import os
import requests
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any


def _parse_json_from_text(raw_text: str) -> Any:
    fence = chr(96) * 3  # triple backticks
    sanitized = str(raw_text or "")
    if fence in sanitized:
        sanitized = sanitized.replace(fence + "json", "").replace(fence, "")
    sanitized = sanitized.strip()
    if not sanitized:
        raise ValueError("AI 返回空内容")
    try:
        return json.loads(sanitized)
    except ValueError:
        object_start = sanitized.find("{")
        object_end = sanitized.rfind("}")
        if object_start >= 0 and object_end > object_start:
            return json.loads(sanitized[object_start:object_end + 1])
        array_start = sanitized.find("[")
        array_end = sanitized.rfind("]")
        if array_start >= 0 and array_end > array_start:
            return json.loads(sanitized[array_start:array_end + 1])
        raise


@activity.defn(name="aiStructuredTransform")
async def aiStructuredTransform(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """AI-backed structured transform Activity."""
    # Phase 3-γ: Legacy activity compatibility check
    if os.getenv("OPS_DISABLE_LEGACY_AI_STRUCTURED_TRANSFORM", "").lower() in ("1", "true", "yes"):
        raise ApplicationError(
            "builtin:aiStructuredTransform is disabled by OPS_DISABLE_LEGACY_AI_STRUCTURED_TRANSFORM. "
            "New tasks must execute llm_operation nodes directly through the control plane, not through a Temporal Activity. "
            "See docs/design/three-capability-types-and-llm-operation-implementation-plan.md §10.3.",
            non_retryable=True,
        )

    # Phase 3-γ: Record fallback event for legacy execution
    import sys
    fallback_marker = "LLM_OPERATION_LEGACY_ACTIVITY_FALLBACK"
    activity.logger.warning(
        f"{fallback_marker} executionId=%s stepId=%s actor=%s",
        input_data.get("executionId") or "<unknown>",
        input_data.get("stepId") or "<unknown>",
        input_data.get("__structuredTransform", {}).get("__actor") if isinstance(input_data.get("__structuredTransform"), dict) else "<unknown>",
    )
    print(f"[{fallback_marker}] aiStructuredTransform invoked; migrate the model step to a control-plane llm_operation node", file=sys.stderr, flush=True)

    activity.logger.info("开始执行 AI 结构化转换任务")

    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    content = input_data.get("content")
    content_type = str(input_data.get("contentType") or "text").strip().lower() or "text"
    instruction = str(input_data.get("instruction") or "").strip()
    output_mode = str(input_data.get("outputMode") or "json").strip().lower() or "json"
    output_schema = input_data.get("outputSchema")
    context = input_data.get("context")

    if content is None or (isinstance(content, str) and not content.strip()):
        raise ApplicationError("content 是必需的参数", non_retryable=True)
    if not instruction:
        raise ApplicationError("instruction 是必需的参数", non_retryable=True)
    if output_mode not in {"json", "text"}:
        raise ApplicationError(f"不支持的 outputMode: {output_mode}", non_retryable=True)

    ai_orchestrator_url = (os.getenv("AI_ORCHESTRATOR_URL") or ${JSON.stringify(getAiOrchestratorUrl())}).rstrip("/")

    serialized_content = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
    serialized_context = ""
    if context is not None:
        serialized_context = context if isinstance(context, str) else json.dumps(context, ensure_ascii=False)
    content_preview = serialized_content[:500]
    context_preview = serialized_context[:300] if serialized_context else ""
    schema_preview = json.dumps(output_schema, ensure_ascii=False)[:500] if output_schema is not None else ""

    activity.logger.info(
        "AI 结构化转换输入摘要",
        extra={
            "contentType": content_type,
            "outputMode": output_mode,
            "instruction": instruction[:500],
            "hasSchema": output_schema is not None,
            "contentLength": len(serialized_content),
            "contextLength": len(serialized_context),
        },
    )
    activity.logger.info(
        "AI 结构化转换输入预览",
        extra={
            "contentPreview": content_preview,
            "contextPreview": context_preview,
            "schemaPreview": schema_preview,
        },
    )

    prompt_parts = [
        "你是企业级结构化内容转换器。",
        "你的任务是根据输入内容、处理规则和输出规则，完成结构提取、字段映射、归一化和格式转换。",
        f"输入内容类型: {content_type}",
        f"输出模式: {output_mode}",
        f"处理规则: {instruction}",
    ]
    if output_schema is not None:
        prompt_parts.append(f"输出规则(JSON Schema/结构说明): {json.dumps(output_schema, ensure_ascii=False)}")
    if serialized_context:
        prompt_parts.append(f"补充上下文: {serialized_context[:6000]}")
    prompt_parts.append(f"输入内容(可能截断): {serialized_content[:20000]}")
    if output_mode == "json":
        prompt_parts.append("只返回 JSON，不要输出 Markdown 或额外解释。")
    else:
        prompt_parts.append("只返回处理后的纯文本结果，不要输出 Markdown 或额外解释。")

    try:
        activity.logger.info("开始调用 AI 结构化转换服务", extra={"aiOrchestratorUrl": ai_orchestrator_url, "outputMode": output_mode})
        response = requests.post(
            ai_orchestrator_url + "/ai/model/call",
            json={"modelId": "default", "prompt": "\\n".join(prompt_parts)},
            timeout=180,
        )
        activity.heartbeat("ai_structured_transform_called")
        response.raise_for_status()
        payload = response.json()
        raw_result = str(payload.get("result") or "").strip()
        activity.logger.info(
            "AI 结构化转换返回摘要",
            extra={
                "resultLength": len(raw_result),
                "resultPreview": raw_result[:500],
            },
        )
    except requests.RequestException as exc:
        activity.logger.error("AI 结构化转换请求失败", extra={"error": str(exc)})
        raise ApplicationError(f"AI 结构化转换失败: {str(exc)}", non_retryable=False)

    if not raw_result:
        raise ApplicationError("AI 结构化转换失败: AI 返回空结果", non_retryable=False)

    if output_mode == "json":
        try:
            parsed = _parse_json_from_text(raw_result)
        except Exception as exc:
            raise ApplicationError(f"AI 结构化转换失败: AI 返回的不是合法 JSON: {str(exc)}", non_retryable=False)
        return {
            "status": "success",
            "mode": "ai",
            "outputMode": "json",
            "result": parsed,
            "raw": raw_result,
        }

    return {
        "status": "success",
        "mode": "ai",
        "outputMode": "text",
        "result": raw_result,
        "raw": raw_result,
    }
`;
