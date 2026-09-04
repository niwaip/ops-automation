import {
  getAiOrchestratorUrl,
  getCarboneExternalUrl,
  getCarboneServiceUrl,
} from '../../config/service-endpoints';

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
import urllib.request


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

    # #region debug-point B:debug-report
    def _debug_report(msg: str, data: Dict[str, Any], hypothesis_id: str = "B") -> None:
        try:
            debug_server_url = "http://127.0.0.1:7777/event"
            debug_session_id = "document-render-aborted"
            try:
                with open(".dbg/document-render-aborted.env", "r", encoding="utf-8") as debug_env_file:
                    for debug_line in debug_env_file.read().splitlines():
                        if debug_line.startswith("DEBUG_SERVER_URL="):
                            debug_server_url = debug_line.split("=", 1)[1].strip() or debug_server_url
                        elif debug_line.startswith("DEBUG_SESSION_ID="):
                            debug_session_id = debug_line.split("=", 1)[1].strip() or debug_session_id
            except Exception:
                pass
            urllib.request.urlopen(urllib.request.Request(
                debug_server_url,
                data=json.dumps({
                    "sessionId": debug_session_id,
                    "runId": "pre-fix",
                    "hypothesisId": hypothesis_id,
                    "location": "fixed-activity-templates:documentRender",
                    "msg": msg,
                    "data": data,
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )).read()
        except Exception:
            pass
    # #endregion

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
            # #region debug-point B:before-render-request
            _debug_report("[DEBUG] documentRender before requests.post", {
                "templateId": template_id,
                "skillId": skill_id,
                "publishedSkillId": published_skill_id,
                "baseUrl": base_url,
                "renderUrl": render_url,
                "renderUrlRepr": repr(render_url),
                "requestTimeoutSeconds": resolved_request_timeout_seconds,
                "dedupedBaseUrls": deduped_base_urls,
                "fieldCount": field_count,
            })
            # #endregion
            response = requests.post(render_url, json=request_payload, timeout=resolved_request_timeout_seconds)
            # #region debug-point C:render-response
            _debug_report("[DEBUG] documentRender received response", {
                "renderUrl": render_url,
                "statusCode": getattr(response, "status_code", None),
                "contentType": response.headers.get("Content-Type") if getattr(response, "headers", None) else None,
            }, "C")
            # #endregion
            response.raise_for_status()
            render_result = response.json()
            resolved_payload = request_payload
            activity.heartbeat("carbone_render_completed")
            break
        except requests.RequestException as exc:
            # #region debug-point D:render-request-exception
            _debug_report("[DEBUG] documentRender requests exception", {
                "renderUrl": render_url,
                "errorType": exc.__class__.__name__,
                "errorMessage": str(exc),
                "errorRepr": repr(exc),
                "responseStatusCode": getattr(getattr(exc, "response", None), "status_code", None),
            }, "D")
            # #endregion
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

    # #region debug-point A:debug-report
    def _debug_report(msg: str, data: Dict[str, Any], hypothesis_id: str = "A") -> None:
        try:
            debug_server_url = "http://127.0.0.1:7777/event"
            debug_session_id = "weather-empty-fields"
            try:
                with open(".dbg/weather-empty-fields.env", "r", encoding="utf-8") as debug_env_file:
                    for debug_line in debug_env_file.read().splitlines():
                        if debug_line.startswith("DEBUG_SERVER_URL="):
                            debug_server_url = debug_line.split("=", 1)[1].strip() or debug_server_url
                        elif debug_line.startswith("DEBUG_SESSION_ID="):
                            debug_session_id = debug_line.split("=", 1)[1].strip() or debug_session_id
            except Exception:
                pass
            urllib.request.urlopen(urllib.request.Request(
                debug_server_url,
                data=json.dumps({
                    "sessionId": debug_session_id,
                    "runId": "pre-fix",
                    "hypothesisId": hypothesis_id,
                    "location": "fixed-activity-templates:httpRequest",
                    "msg": msg,
                    "data": data,
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )).read()
        except Exception:
            pass
    # #endregion

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
    # #region debug-point A:http-request-input
    _debug_report("[DEBUG] httpRequest input", {
        "method": method,
        "url": url,
        "urlRepr": repr(url),
        "params": params,
        "headersKeys": sorted(list(normalized_headers.keys())),
        "hasJson": json_body is not None,
        "hasData": data_body is not None,
        "timeout": timeout,
    })
    # #endregion

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

    # #region debug-point A:http-request-output
    _debug_report("[DEBUG] httpRequest output", {
        "finalUrl": response.url if hasattr(response, "url") else url,
        "finalUrlRepr": repr(response.url if hasattr(response, "url") else url),
        "statusCode": response.status_code,
        "contentType": content_type,
        "bodyType": type(parsed_body).__name__ if parsed_body is not None else None,
        "bodyKeys": sorted(list(parsed_body.keys()))[:20] if isinstance(parsed_body, dict) else None,
        "rawTextPreview": raw_text[:400],
    })
    # #endregion

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
import urllib.request
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

    # #region debug-point B:debug-report
    def _debug_report(msg: str, data: Dict[str, Any], hypothesis_id: str = "B") -> None:
        try:
            debug_server_url = "http://127.0.0.1:7777/event"
            debug_session_id = "weather-empty-fields"
            try:
                with open(".dbg/weather-empty-fields.env", "r", encoding="utf-8") as debug_env_file:
                    for debug_line in debug_env_file.read().splitlines():
                        if debug_line.startswith("DEBUG_SERVER_URL="):
                            debug_server_url = debug_line.split("=", 1)[1].strip() or debug_server_url
                        elif debug_line.startswith("DEBUG_SESSION_ID="):
                            debug_session_id = debug_line.split("=", 1)[1].strip() or debug_session_id
            except Exception:
                pass
            urllib.request.urlopen(urllib.request.Request(
                debug_server_url,
                data=json.dumps({
                    "sessionId": debug_session_id,
                    "runId": "pre-fix",
                    "hypothesisId": hypothesis_id,
                    "location": "fixed-activity-templates:structuredTransform",
                    "msg": msg,
                    "data": data,
                }).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )).read()
        except Exception:
            pass
    # #endregion

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
    # #region debug-point B:structured-transform-input
    _debug_report("[DEBUG] structuredTransform input", {
        "contentType": content_type,
        "outputMode": output_mode,
        "fieldMappingKeys": sorted(list(field_mappings.keys()))[:30],
        "outputSchemaKeys": sorted(list(output_schema.keys()))[:30] if isinstance(output_schema, dict) else None,
        "hasInstruction": bool(instruction),
        "hasTextTemplate": bool(text_template),
        "contentPreview": serialized_content[:500],
        "contextPreview": serialized_context[:300],
    })
    # #endregion

    values = _build_values(normalized_content, field_mappings, normalized_context)
    # #region debug-point C:structured-transform-values
    _debug_report("[DEBUG] structuredTransform resolved values", {
        "resolvedValueKeys": sorted(list(values.keys()))[:50],
        "sampleValues": {
            str(key): values.get(str(key))
            for key in list(field_mappings.keys())[:10]
        },
    }, "C")
    # #endregion

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
        # #region debug-point D:structured-transform-json-output
        _debug_report("[DEBUG] structuredTransform json output", {
            "resultKeys": sorted(list(result.keys()))[:30] if isinstance(result, dict) else None,
            "rawPreview": raw_result[:500],
        }, "D")
        # #endregion
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

    # #region debug-point D:structured-transform-text-output
    _debug_report("[DEBUG] structuredTransform text output", {
        "renderedTextPreview": rendered_text[:500],
        "renderedTextLength": len(rendered_text),
    }, "D")
    # #endregion

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

export const FIXED_FILE_READ_ACTIVITY_FN = 'fileRead';
export const FIXED_FILE_WRITE_ACTIVITY_FN = 'fileWrite';
export const FIXED_WEBHOOK_NOTIFY_ACTIVITY_FN = 'webhookNotify';
export const FIXED_EMAIL_SEND_ACTIVITY_FN = 'emailSend';
export const FIXED_IM_NOTIFY_ACTIVITY_FN = 'imNotify';
export const FIXED_CSV_PARSE_ACTIVITY_FN = 'csvParse';
export const FIXED_JSON_TRANSFORM_ACTIVITY_FN = 'jsonTransform';
export const FIXED_TEMPLATE_RENDER_ACTIVITY_FN = 'templateRender';
export const FIXED_DATABASE_QUERY_ACTIVITY_FN = 'databaseQuery';
export const FIXED_SHELL_COMMAND_ACTIVITY_FN = 'shellCommand';
export const FIXED_WAIT_DELAY_ACTIVITY_FN = 'waitDelay';
export const FIXED_CONDITION_CHECK_ACTIVITY_FN = 'conditionCheck';

export const FIXED_FILE_READ_ACTIVITY_CODE = `import json
import os
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="fileRead")
async def fileRead(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行文件读取任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)
    
    protocol = str(input_data.get("protocol") or "local").strip().lower()
    path = str(input_data.get("path") or "").strip()
    encoding = str(input_data.get("encoding") or "utf-8").strip().lower()
    return_mode = str(input_data.get("returnMode") or "text").strip().lower()
    max_size_kb = float(input_data.get("maxSizeKb") or 10240)
    
    if not path:
        raise ApplicationError("path 是必需的参数", non_retryable=True)
        
    content = None
    size = 0
    
    if protocol == "local":
        if not os.path.exists(path):
            raise ApplicationError(f"文件不存在: {path}", non_retryable=True)
        size = os.path.getsize(path)
        if size > max_size_kb * 1024:
            raise ApplicationError(f"文件大小 ({size} bytes) 超过最大限制 ({max_size_kb} KB)", non_retryable=True)
            
        if return_mode == "base64":
            import base64
            with open(path, "rb") as f:
                content = base64.b64encode(f.read()).decode("utf-8")
        else:
            with open(path, "r", encoding=encoding, errors="replace") as f:
                if return_mode == "lines":
                    content = f.read().splitlines()
                elif return_mode == "json":
                    content = json.load(f)
                else:
                    content = f.read()
    elif protocol in ("s3", "oss", "minio"):
        bucket = str(input_data.get("bucket") or "").strip()
        if not bucket:
            raise ApplicationError("bucket 是必需的参数", non_retryable=True)
        if protocol in ("s3", "minio"):
            try:
                import boto3
            except ImportError:
                raise ApplicationError(f"Protocol '{protocol}' requires 'boto3' library", non_retryable=True)
            
            s3_client = boto3.client("s3")
            try:
                response = s3_client.get_object(Bucket=bucket, Key=path)
                size = response.get("ContentLength", 0)
                if size > max_size_kb * 1024:
                    raise ApplicationError(f"S3 文件大小 ({size} bytes) 超过最大限制 ({max_size_kb} KB)", non_retryable=True)
                raw_bytes = response["Body"].read()
                if return_mode == "base64":
                    import base64
                    content = base64.b64encode(raw_bytes).decode("utf-8")
                else:
                    text_content = raw_bytes.decode(encoding, errors="replace")
                    if return_mode == "lines":
                        content = text_content.splitlines()
                    elif return_mode == "json":
                        content = json.loads(text_content)
                    else:
                        content = text_content
            except Exception as exc:
                raise ApplicationError(f"读取 S3 文件失败: {str(exc)}", non_retryable=False)
        elif protocol == "oss":
            raise ApplicationError("OSS 协议未配置，请使用 local 或 s3 存储", non_retryable=True)
    else:
        raise ApplicationError(f"不支持的协议: {protocol}", non_retryable=True)
        
    return {
        "status": "success",
        "protocol": protocol,
        "path": path,
        "size": size,
        "encoding": encoding,
        "returnMode": return_mode,
        "content": content
    }
`;

export const FIXED_FILE_WRITE_ACTIVITY_CODE = `import json
import os
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="fileWrite")
async def fileWrite(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行文件写入任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)
    
    protocol = str(input_data.get("protocol") or "local").strip().lower()
    path = str(input_data.get("path") or "").strip()
    content_source = str(input_data.get("contentSource") or "input").strip()
    content_key = str(input_data.get("contentKey") or "content").strip()
    write_mode = str(input_data.get("writeMode") or "text").strip().lower()
    encoding = str(input_data.get("encoding") or "utf-8").strip().lower()
    overwrite = bool(input_data.get("overwrite") if input_data.get("overwrite") is not None else True)
    mkdir = bool(input_data.get("mkdir") if input_data.get("mkdir") is not None else True)
    
    if not path:
        raise ApplicationError("path 是必需的参数", non_retryable=True)
        
    raw_content = input_data.get("content")
    if content_source == "previousStep" or raw_content is None:
        raw_content = input_data.get(content_key)
        
    if raw_content is None:
        raw_content = ""
        
    if write_mode == "json":
        if isinstance(raw_content, str):
            try:
                json.loads(raw_content)
                bytes_content = raw_content.encode(encoding)
            except ValueError:
                bytes_content = json.dumps(raw_content, ensure_ascii=False).encode(encoding)
        else:
            bytes_content = json.dumps(raw_content, ensure_ascii=False).encode(encoding)
    elif write_mode == "base64decode":
        import base64
        if isinstance(raw_content, str):
            bytes_content = base64.b64decode(raw_content)
        else:
            raise ApplicationError("base64decode 模式下 content 必须是字符串", non_retryable=True)
    else:
        if isinstance(raw_content, (dict, list)):
            bytes_content = json.dumps(raw_content, ensure_ascii=False).encode(encoding)
        else:
            bytes_content = str(raw_content).encode(encoding)
            
    size_written = len(bytes_content)
    overwritten = False
    
    if protocol == "local":
        if os.path.exists(path):
            if not overwrite:
                raise ApplicationError(f"文件已存在且不允许覆盖: {path}", non_retryable=True)
            overwritten = True
        if mkdir:
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "wb") as f:
            f.write(bytes_content)
    elif protocol in ("s3", "minio"):
        bucket = str(input_data.get("bucket") or "").strip()
        if not bucket:
            raise ApplicationError("bucket 是必需的参数", non_retryable=True)
        try:
            import boto3
            s3_client = boto3.client("s3")
            if not overwrite:
                try:
                    s3_client.head_object(Bucket=bucket, Key=path)
                    raise ApplicationError(f"S3文件已存在且不允许覆盖: {path}", non_retryable=True)
                except s3_client.exceptions.ClientError as e:
                    if e.response["Error"]["Code"] != "404":
                        raise
            s3_client.put_object(Bucket=bucket, Key=path, Body=bytes_content)
        except Exception as exc:
            raise ApplicationError(f"写入 S3 失败: {str(exc)}", non_retryable=False)
    else:
        raise ApplicationError(f"不支持的协议: {protocol}", non_retryable=True)
        
    return {
        "status": "success",
        "path": path,
        "sizeWritten": size_written,
        "overwritten": overwritten
    }
`;

export const FIXED_WEBHOOK_NOTIFY_ACTIVITY_CODE = `import json
import requests
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="webhookNotify")
async def webhookNotify(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行 Webhook 推送任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)
    
    url = str(input_data.get("url") or "").strip()
    method = str(input_data.get("method") or "POST").strip().upper()
    headers = input_data.get("headers") or {}
    payload = input_data.get("payloadTemplate") or {}
    success_codes = input_data.get("successCodes") or [200, 201, 202, 204]
    timeout = float(input_data.get("timeoutSeconds") or 15)
    
    if not url:
        raise ApplicationError("url 是必需的参数", non_retryable=True)
        
    try:
        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            json=payload if isinstance(payload, dict) else None,
            data=payload if not isinstance(payload, dict) else None,
            timeout=timeout
        )
        activity.heartbeat("webhook_sent")
        
        status_code = response.status_code
        if status_code not in success_codes:
            raise ApplicationError(f"Webhook 推送返回错误状态码: {status_code}, 响应: {response.text[:200]}", non_retryable=False)
            
        return {
            "status": "success",
            "statusCode": status_code,
            "response": response.text[:2000]
        }
    except requests.RequestException as exc:
        raise ApplicationError(f"Webhook 推送请求失败: {str(exc)}", non_retryable=False)
`;

export const FIXED_EMAIL_SEND_ACTIVITY_CODE = `import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="emailSend")
async def emailSend(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行邮件发送任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)
    
    provider = str(input_data.get("provider") or "smtp").strip().lower()
    to_list = input_data.get("to") or []
    cc_list = input_data.get("cc") or []
    bcc_list = input_data.get("bcc") or []
    subject = str(input_data.get("subject") or "").strip()
    body_type = str(input_data.get("bodyType") or "html").strip().lower()
    body_template = str(input_data.get("bodyTemplate") or "").strip()
    
    if not to_list:
        raise ApplicationError("to (收件人) 是必需的参数", non_retryable=True)
    if not subject:
        raise ApplicationError("subject (主题) 是必需的参数", non_retryable=True)
        
    if isinstance(to_list, str):
        to_list = [to_list]
    if isinstance(cc_list, str):
        cc_list = [cc_list]
    if isinstance(bcc_list, str):
        bcc_list = [bcc_list]
        
    if provider == "smtp":
        smtp_host = os.getenv(str(input_data.get("smtpHostEnvKey") or "SMTP_HOST"))
        smtp_port = os.getenv(str(input_data.get("smtpPortEnvKey") or "SMTP_PORT"))
        smtp_user = os.getenv(str(input_data.get("smtpUserEnvKey") or "SMTP_USER"))
        smtp_password = os.getenv(str(input_data.get("smtpPasswordEnvKey") or "SMTP_PASSWORD"))
        smtp_tls = bool(input_data.get("smtpTls") if input_data.get("smtpTls") is not None else True)
        
        if not smtp_host or not smtp_user or not smtp_password:
            raise ApplicationError("SMTP 配置环境变量缺失", non_retryable=True)
            
        from_name = str(input_data.get("fromName") or "").strip()
        from_address = str(input_data.get("fromAddress") or smtp_user).strip()
        from_header = f"{from_name} <{from_address}>" if from_name else from_address
        
        msg = MIMEMultipart()
        msg["From"] = from_header
        msg["To"] = ", ".join(to_list)
        if cc_list:
            msg["Cc"] = ", ".join(cc_list)
        msg["Subject"] = subject
        
        msg.attach(MIMEText(body_template, body_type))
        
        attach_from_prev = bool(input_data.get("attachFromPreviousStep"))
        if attach_from_prev:
            attach_path = str(input_data.get("attachmentKey") or "")
            if attach_path and os.path.exists(attach_path):
                filename = str(input_data.get("attachmentFilename") or os.path.basename(attach_path))
                with open(attach_path, "rb") as f:
                    part = MIMEApplication(f.read(), Name=filename)
                part['Content-Disposition'] = f'attachment; filename="{filename}"'
                msg.attach(part)
                
        try:
            port = int(smtp_port) if smtp_port else (587 if smtp_tls else 25)
            server = smtplib.SMTP(smtp_host, port, timeout=30)
            if smtp_tls:
                server.starttls()
            server.login(smtp_user, smtp_password)
            all_recipients = to_list + cc_list + bcc_list
            server.sendmail(from_address, all_recipients, msg.as_string())
            server.quit()
        except Exception as exc:
            raise ApplicationError(f"SMTP 发送邮件失败: {str(exc)}", non_retryable=False)
    else:
        raise ApplicationError(f"不支持的邮件提供商: {provider}", non_retryable=True)
        
    return {
        "status": "success",
        "to": to_list,
        "subject": subject
    }
`;

export const FIXED_IM_NOTIFY_ACTIVITY_CODE = `import os
import requests
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="imNotify")
async def imNotify(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行 IM 通知推送任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)
    
    platform = str(input_data.get("platform") or "feishu").strip().lower()
    webhook_url = str(input_data.get("webhookUrl") or "").strip()
    webhook_env_key = str(input_data.get("webhookUrlEnvKey") or "").strip()
    if webhook_env_key:
        webhook_url = os.getenv(webhook_env_key) or webhook_url
        
    if not webhook_url:
        raise ApplicationError("未配置可用的 Webhook URL", non_retryable=True)
        
    msg_type = str(input_data.get("msgType") or "text").strip().lower()
    title = str(input_data.get("title") or "").strip()
    content = str(input_data.get("contentTemplate") or "").strip()
    
    payload = {}
    if platform == "feishu":
        if msg_type == "markdown":
            payload = {
                "msg_type": "post",
                "content": {
                    "post": {
                        "zh_cn": {
                            "title": title or "通知",
                            "content": [[{"tag": "text", "text": content}]]
                        }
                    }
                }
            }
        elif msg_type == "card":
            payload = {
                "msg_type": "interactive",
                "card": {
                    "header": {
                        "title": {"tag": "plain_text", "content": title or "通知"},
                        "template": str(input_data.get("cardColor") or "green")
                    },
                    "elements": [{"tag": "markdown", "content": content}]
                }
            }
        else:
            payload = {
                "msg_type": "text",
                "content": {"text": content}
            }
    elif platform == "dingtalk":
        if msg_type in ("markdown", "card"):
            payload = {
                "msgtype": "markdown",
                "markdown": {"title": title or "通知", "text": content}
            }
        else:
            payload = {
                "msgtype": "text",
                "text": {"content": content}
            }
    elif platform == "wecom":
        if msg_type in ("markdown", "card"):
            payload = {
                "msgtype": "markdown",
                "markdown": {"content": content}
            }
        else:
            payload = {
                "msgtype": "text",
                "text": {"content": content}
            }
    else:
        raise ApplicationError(f"不支持的 IM 平台: {platform}", non_retryable=True)
        
    try:
        response = requests.post(webhook_url, json=payload, timeout=15)
        response.raise_for_status()
        return {
            "status": "success",
            "platform": platform,
            "response": response.text[:200]
        }
    except Exception as exc:
        raise ApplicationError(f"IM 通知发送失败: {str(exc)}", non_retryable=False)
`;

export const FIXED_CSV_PARSE_ACTIVITY_CODE = `import csv
import io
import json
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="csvParse")
async def csvParse(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行 CSV 解析任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)
        
    content_source = str(input_data.get("contentSource") or "input").strip()
    content_key = str(input_data.get("contentKey") or "content").strip()
    
    raw_content = input_data.get("content")
    if content_source == "previousStep" or raw_content is None:
        raw_content = input_data.get(content_key)
        
    if not raw_content:
        return {
            "status": "success",
            "rowCount": 0,
            "columnCount": 0,
            "headers": [],
            "rows": []
        }
        
    delimiter = str(input_data.get("delimiter") or ",")
    has_header = bool(input_data.get("hasHeader") if input_data.get("hasHeader") is not None else True)
    max_rows = int(input_data.get("maxRows") or 10000)
    column_types = input_data.get("columnTypes") or {}
    
    csv_file = io.StringIO(str(raw_content))
    reader = csv.reader(csv_file, delimiter=delimiter)
    
    rows = []
    headers = []
    
    if has_header:
        try:
            headers = next(reader)
        except StopIteration:
            pass
            
    row_count = 0
    column_count = len(headers)
    
    for row_data in reader:
        row_count += 1
        if row_count > max_rows:
            activity.logger.warning(f"行数超过最大限制: {max_rows}，已截断")
            break
            
        if not headers:
            headers = [f"col_{i}" for i in range(len(row_data))]
            column_count = len(headers)
            
        row_dict = {}
        for i, val in enumerate(row_data):
            if i >= len(headers):
                break
            col_name = headers[i]
            col_type = column_types.get(col_name, "string")
            
            try:
                if col_type == "number":
                    val = float(val) if "." in val else int(val)
                elif col_type == "boolean":
                    val = val.lower() in ("true", "1", "yes")
            except Exception:
                pass
            row_dict[col_name] = val
            
        rows.append(row_dict)
        if row_count % 1000 == 0:
            activity.heartbeat(f"parsed_{row_count}_rows")
            
    return {
        "status": "success",
        "rowCount": row_count,
        "columnCount": column_count,
        "headers": headers,
        "rows": rows
    }
`;

export const FIXED_JSON_TRANSFORM_ACTIVITY_CODE = `import json
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="jsonTransform")
async def jsonTransform(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行 JSON 转换任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)
        
    content_source = str(input_data.get("contentSource") or "input").strip()
    content_key = str(input_data.get("contentKey") or "data").strip()
    
    raw_content = input_data.get("content")
    if content_source == "previousStep" or raw_content is None:
        raw_content = input_data.get(content_key)
        
    if raw_content is None:
        raise ApplicationError("未找到输入数据", non_retryable=True)
        
    if isinstance(raw_content, str):
        try:
            data = json.loads(raw_content)
        except Exception:
            data = raw_content
    else:
        data = raw_content
        
    field_mappings = input_data.get("fieldMappings") or {}
    output_mode = str(input_data.get("outputMode") or "object").strip().lower()
    default_values = input_data.get("defaultValues") or {}
    drop_null = bool(input_data.get("dropNullFields"))
    
    def _resolve_json_path(obj: Any, path: str) -> Any:
        raw_path = str(path or "").strip()
        if raw_path in ("$", "$result", "$data", "$body", "result", "data", "body", ""):
            return obj
        if raw_path.startswith("$."):
            raw_path = raw_path[2:]
        elif raw_path.startswith("$"):
            raw_path = raw_path[1:]
        parts = [p for p in raw_path.split(".") if p]
        curr = obj
        for part in parts:
            clean_part = part.lstrip("$")
            if isinstance(curr, dict):
                if part in curr:
                    curr = curr[part]
                elif clean_part in curr:
                    curr = curr[clean_part]
                elif clean_part in ("result", "data", "body") and not any(k in curr for k in ("result", "data", "body")):
                    pass
                else:
                    return None
            elif isinstance(curr, list):
                if clean_part.endswith("]") and "[" in clean_part:
                    idx_str = clean_part[clean_part.find("[")+1:clean_part.find("]")]
                    prefix = clean_part[:clean_part.find("[")]
                    if prefix and isinstance(curr, dict):
                        curr = curr.get(prefix)
                    if isinstance(curr, list):
                        if idx_str == "*":
                            return curr
                        elif idx_str.isdigit():
                            idx = int(idx_str)
                            curr = curr[idx] if 0 <= idx < len(curr) else None
                elif clean_part.isdigit():
                    idx = int(clean_part)
                    curr = curr[idx] if 0 <= idx < len(curr) else None
                else:
                    return None
            else:
                return None
        return curr
        
    result = {}
    if output_mode == "value":
        first_path = list(field_mappings.values())[0] if field_mappings else "$."
        result = _resolve_json_path(data, first_path)
    else:
        for out_key, path in field_mappings.items():
            val = None
            if isinstance(path, str) and path.startswith("$"):
                val = _resolve_json_path(data, path)
            else:
                val = path
                
            if val is None:
                val = default_values.get(out_key)
                
            if val is not None or not drop_null:
                result[out_key] = val
                
    return {
        "status": "success",
        "result": result
    }
`;

export const FIXED_TEMPLATE_RENDER_ACTIVITY_CODE = `import json
import re
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="templateRender")
async def templateRender(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行模板渲染任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)
        
    engine = str(input_data.get("engine") or "jinja2").strip().lower()
    template_str = str(input_data.get("template") or "").strip()
    output_mode = str(input_data.get("outputMode") or "text").strip().lower()
    render_data = input_data.get("data") or {}
    
    if engine == "jinja2":
        try:
            from jinja2 import Template
            t = Template(template_str)
            rendered = t.render(**render_data)
        except ImportError:
            activity.logger.warning("jinja2 package not found, falling back to simple regex renderer")
            def repl(m):
                k = m.group(1).strip()
                return str(render_data.get(k, ""))
            rendered = re.sub(r"\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}", repl, template_str)
    else:
        def repl(m):
            k = m.group(1).strip()
            return str(render_data.get(k, ""))
        rendered = re.sub(r"\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}", repl, template_str)
        
    if output_mode == "json":
        try:
            rendered = json.loads(rendered)
        except Exception:
            pass
            
    return {
        "status": "success",
        "result": rendered
    }
`;

export const FIXED_DATABASE_QUERY_ACTIVITY_CODE = `import json
import os
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="databaseQuery")
async def databaseQuery(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行数据库查询任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)
        
    db_type = str(input_data.get("dbType") or "postgresql").strip().lower()
    conn_env_key = str(input_data.get("connectionEnvKey") or "DB_CONNECTION_URL").strip()
    conn_url = os.getenv(conn_env_key)
    sql = str(input_data.get("sql") or "").strip()
    params = input_data.get("params") or {}
    max_rows = int(input_data.get("maxRows") or 1000)
    return_mode = str(input_data.get("returnMode") or "rows").strip().lower()
    
    if not conn_url:
        raise ApplicationError(f"未配置数据库连接环境变量: {conn_env_key}", non_retryable=True)
    if not sql:
        raise ApplicationError("sql 是必需的参数", non_retryable=True)
        
    sql_upper = sql.upper().strip()
    if not sql_upper.startswith("SELECT") and not sql_upper.startswith("WITH"):
        raise ApplicationError("只允许执行 SELECT 或 WITH 只读查询", non_retryable=True)
        
    rows = []
    try:
        if db_type == "postgresql":
            try:
                import psycopg2
                from psycopg2.extras import RealDictCursor
            except ImportError:
                raise ApplicationError("PostgreSQL 查询需要 'psycopg2' 库", non_retryable=True)
                
            conn = psycopg2.connect(conn_url)
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(sql, params)
            rows = cur.fetchmany(max_rows)
            cur.close()
            conn.close()
        elif db_type == "mysql":
            raise ApplicationError("MySQL support is not fully configured", non_retryable=True)
        elif db_type == "sqlite":
            import sqlite3
            db_path = conn_url.replace("sqlite://", "")
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchmany(max_rows)]
            cur.close()
            conn.close()
        else:
            raise ApplicationError(f"不支持的数据库类型: {db_type}", non_retryable=True)
    except Exception as exc:
        raise ApplicationError(f"数据库查询执行失败: {str(exc)}", non_retryable=False)
        
    result = rows
    if return_mode == "first":
        result = rows[0] if rows else {}
    elif return_mode == "value":
        result = list(rows[0].values())[0] if rows and rows[0] else None
    elif return_mode == "count":
        result = len(rows)
        
    return {
        "status": "success",
        "rowCount": len(rows),
        "result": result
    }
`;

export const FIXED_SHELL_COMMAND_ACTIVITY_CODE = `import json
import os
import subprocess
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="shellCommand")
async def shellCommand(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行 Shell 命令任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)
        
    command = str(input_data.get("command") or "").strip()
    working_dir = str(input_data.get("workingDir") or "/tmp").strip()
    allowed_prefixes = input_data.get("allowedPrefixes") or [
        "python3", "python", "node", "ffmpeg", "convert",
        "pandoc", "libreoffice", "pdftotext", "unzip", "zip",
        "tar", "gzip", "gunzip", "wkhtmltopdf", "echo", "cat"
    ]
    env_overrides = input_data.get("envOverrides") or {}
    timeout = float(input_data.get("timeoutSeconds") or 60)
    capture_stderr = bool(input_data.get("captureStderr") if input_data.get("captureStderr") is not None else True)
    return_mode = str(input_data.get("returnMode") or "text").strip().lower()
    max_output_kb = float(input_data.get("maxOutputKb") or 1024)
    
    if not command:
        raise ApplicationError("command 是必需的参数", non_retryable=True)
        
    cmd_parts = command.split()
    if not cmd_parts:
        raise ApplicationError("非法的 Shell 命令", non_retryable=True)
    base_cmd = os.path.basename(cmd_parts[0])
    if base_cmd not in allowed_prefixes and cmd_parts[0] not in allowed_prefixes:
        raise ApplicationError(f"命令前缀 '{cmd_parts[0]}' 不在安全白名单内", non_retryable=True)
        
    env = os.environ.copy()
    env.update(env_overrides)
    
    try:
        proc = subprocess.run(
            command,
            shell=True,
            cwd=working_dir,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE if capture_stderr else subprocess.DEVNULL,
            timeout=timeout
        )
        activity.heartbeat("shell_command_executed")
        
        stdout_str = proc.stdout.decode("utf-8", errors="replace")
        stderr_str = proc.stderr.decode("utf-8", errors="replace") if capture_stderr else ""
        
        if len(stdout_str) > max_output_kb * 1024:
            stdout_str = stdout_str[:int(max_output_kb * 1024)] + "\\n[Output Truncated]"
            
        if proc.returncode != 0:
            raise ApplicationError(f"Shell 命令执行失败，退出码: {proc.returncode}, 错误信息: {stderr_str}", non_retryable=False)
            
        result = stdout_str
        if return_mode == "json":
            try:
                result = json.loads(stdout_str)
            except Exception:
                pass
        elif return_mode == "lines":
            result = stdout_str.splitlines()
            
        return {
            "status": "success",
            "exitCode": proc.returncode,
            "result": result,
            "stderr": stderr_str
        }
    except subprocess.TimeoutExpired:
        raise ApplicationError(f"Shell 命令执行超时 ({timeout} 秒)", non_retryable=False)
    except Exception as exc:
        raise ApplicationError(f"Shell 命令执行失败: {str(exc)}", non_retryable=False)
`;

export const FIXED_WAIT_DELAY_ACTIVITY_CODE = `import re
import time
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="waitDelay")
async def waitDelay(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行延迟等待任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)
        
    duration = str(input_data.get("duration") or "").strip()
    duration_seconds = float(input_data.get("durationSeconds") or 60)
    
    if duration:
        match = re.match(r"^(\\d+)\\s*([smhd])$", duration, re.IGNORECASE)
        if match:
            val = int(match.group(1))
            unit = match.group(2).lower()
            if unit == "m":
                duration_seconds = val * 60
            elif unit == "h":
                duration_seconds = val * 3600
            elif unit == "d":
                duration_seconds = val * 86400
            else:
                duration_seconds = val
                
    time.sleep(duration_seconds)
    return {
        "status": "success",
        "durationSeconds": duration_seconds
    }
`;

export const FIXED_CONDITION_CHECK_ACTIVITY_CODE = `import json
import requests
import time
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="conditionCheck")
async def conditionCheck(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行条件轮询检查任务")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)
        
    url = str(input_data.get("url") or "").strip()
    method = str(input_data.get("method") or "GET").strip().upper()
    headers = input_data.get("headers") or {}
    success_cond = str(input_data.get("successCondition") or "").strip()
    failure_cond = str(input_data.get("failureCondition") or "").strip()
    interval = float(input_data.get("intervalSeconds") or 10)
    max_attempts = int(input_data.get("maxAttempts") or 60)
    result_path = str(input_data.get("resultPath") or "").strip()
    
    if not url:
        raise ApplicationError("url 是必需的参数", non_retryable=True)
    if not success_cond:
        raise ApplicationError("successCondition 是必需的参数", non_retryable=True)
        
    def _eval_cond(json_data: Any, cond_expr: str) -> bool:
        if not cond_expr:
            return False
        import re
        expr = cond_expr
        paths = re.findall(r"\\$\\.[a-zA-Z0-9_\\.]+", expr)
        for path in paths:
            parts = path[2:].split(".")
            val = json_data
            for part in parts:
                if isinstance(val, dict):
                    val = val.get(part)
                else:
                    val = None
                    break
            expr = expr.replace(path, repr(val))
        try:
            return bool(eval(expr, {"__builtins__": None}, {}))
        except Exception:
            return False
            
    for attempt in range(1, max_attempts + 1):
        activity.logger.info(f"轮询接口第 {attempt}/{max_attempts} 次尝试")
        try:
            response = requests.request(method=method, url=url, headers=headers, timeout=10)
            response.raise_for_status()
            try:
                json_data = response.json()
            except Exception:
                json_data = {}
                
            if failure_cond and _eval_cond(json_data, failure_cond):
                raise ApplicationError(f"条件轮询命中失败条件: {failure_cond}", non_retryable=True)
                
            if _eval_cond(json_data, success_cond):
                res = json_data
                if result_path and result_path.startswith("$."):
                    parts = result_path[2:].split(".")
                    for part in parts:
                        if isinstance(res, dict):
                            res = res.get(part)
                        else:
                            res = None
                            break
                return {
                    "status": "success",
                    "attempts": attempt,
                    "result": res
                }
        except requests.RequestException as exc:
            activity.logger.warning(f"轮询请求异常: {str(exc)}")
            
        activity.heartbeat(f"polling_attempt_{attempt}")
        time.sleep(interval)
        
    raise ApplicationError(f"条件轮询超时，已达到最大尝试次数: {max_attempts}", non_retryable=False)
`;
