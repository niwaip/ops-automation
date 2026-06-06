import json
import re
from datetime import timedelta
from typing import Any, Dict, List

from temporalio import activity, workflow
from temporalio.exceptions import ApplicationError

import os
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
    source_language = input_data.get("sourceLanguage")
    target_languages = input_data.get("targetLanguages") or []

    if not template_id:
        raise ApplicationError("templateId 是必需的参数", non_retryable=True)
    if not isinstance(render_data, dict):
        raise ApplicationError("data 参数必须是字典类型", non_retryable=True)
    if source_language is not None and not isinstance(source_language, str):
        raise ApplicationError("sourceLanguage 参数必须是字符串类型", non_retryable=True)
    if not isinstance(target_languages, list):
        raise ApplicationError("targetLanguages 参数必须是数组类型", non_retryable=True)

    external_base_url = (os.getenv("CARBONE_EXTERNAL_URL") or "http://192.168.100.143:3009").rstrip("/")

    candidate_base_urls = []
    configured_base_url = (os.getenv("CARBONE_SERVICE_URL") or "http://carbone-engine:3009")
    if configured_base_url:
        candidate_base_urls.append(str(configured_base_url).rstrip("/"))
    default_base_url = "http://carbone-engine:3009"
    if default_base_url:
        candidate_base_urls.append(str(default_base_url).rstrip("/"))

    deduped_base_urls = []
    for candidate in candidate_base_urls:
        if candidate and candidate not in deduped_base_urls:
            deduped_base_urls.append(candidate)

    if source_language or target_languages:
        render_data_payload = {
            "templateId": template_id,
            "userInput": "",
            "userOverrides": render_data,
        }
        if source_language:
            render_data_payload["sourceLanguage"] = source_language
        if target_languages:
            render_data_payload["targetLanguages"] = target_languages

        render_data_result = None
        last_render_data_error = None
        for base_url in deduped_base_urls:
            render_data_url = base_url + "/studio/template/render-data"
            activity.logger.info(
                "开始生成模板渲染数据",
                extra={"templateId": template_id, "renderDataUrl": render_data_url, "fieldCount": len(render_data)},
            )
            try:
                response = requests.post(render_data_url, json=render_data_payload, timeout=60)
                response.raise_for_status()
                render_data_result = response.json()
                activity.heartbeat("template_render_data_completed")
                break
            except requests.RequestException as exc:
                last_render_data_error = exc
                activity.logger.error(
                    "模板渲染数据生成失败，尝试下一个地址",
                    extra={"renderDataUrl": render_data_url, "error": str(exc)},
                )
        if render_data_result is None:
            raise ApplicationError(
                f"模板渲染数据生成失败: {str(last_render_data_error) if last_render_data_error else 'unknown error'}",
                non_retryable=True,
            )
        resolved_render_data = render_data_result.get("data") if isinstance(render_data_result, dict) else None
        if not isinstance(resolved_render_data, dict):
            raise ApplicationError("模板渲染数据生成结果格式无效", non_retryable=True)
        render_data = resolved_render_data

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

@workflow.defn(name="技术サービス契約生成ワークフロー")
class Template1febbc18Workflow:
    ACTIVITY_START_TO_CLOSE_TIMEOUT = timedelta(seconds=60)
    RENDER_BINDINGS = {
        "payment.method": [
            "payment.method_cn",
            "payment.method_jp"
        ],
        "payment.remark": [
            "payment.remark_cn",
            "payment.remark_jp"
        ],
        "service.period": [
            "service.period_cn",
            "service.period_jp"
        ],
        "acceptance.days": [
            "acceptance.days_cn",
            "acceptance.days_jp"
        ],
        "contract.partyA": [
            "contract.partyA_cn",
            "contract.partyA_jp"
        ],
        "service.endUser": [
            "service.endUser_cn",
            "service.endUser_jp"
        ],
        "items[].quantity": [
            "items[].quantity_cn",
            "items[].quantity_jp"
        ],
        "otherTerms.title": [
            "otherTerms.title_jp"
        ],
        "service.location": [
            "service.location_cn",
            "service.location_jp"
        ],
        "service.progress": [
            "service.progress_cn",
            "service.progress_jp"
        ],
        "payment.finalDays": [
            "payment.finalDays_cn",
            "payment.finalDays_jp"
        ],
        "payment.firstDays": [
            "payment.firstDays",
            "payment.firstDays_jp"
        ],
        "payment.finalRatio": [
            "payment.finalRatio_jp",
            "payment.finalRatio_cn"
        ],
        "payment.firstRatio": [
            "payment.firstRatio_jp",
            "payment.firstRatio_cn"
        ],
        "contract.contractNo": [
            "contract.contractNo_cn",
            "contract.contractNo_jp"
        ],
        "contract.partyA.fax": [
            "contract.partyA.fax_cn",
            "contract.partyA.fax_jp"
        ],
        "items[].productName": [
            "items[].productName_cn",
            "items[].productName_jp"
        ],
        "items[].projectName": [
            "items[].projectName_cn",
            "items[].projectName_jp"
        ],
        "payment.bankAccount": [
            "payment.bankAccount_cn",
            "payment.bankAccount_jp"
        ],
        "payment.firstAmount": [
            "payment.firstAmount_jp",
            "payment.firstAmount_cn"
        ],
        "payment.totalAmount": [
            "payment.totalAmount_cn",
            "payment.totalAmount_jp"
        ],
        "contract.partyA.name": [
            "contract.partyA.name_cn",
            "contract.partyA.name_jp"
        ],
        "contract.projectName": [
            "contract.projectName_cn",
            "contract.projectName_jp"
        ],
        "contract.serviceName": [
            "contract.serviceName_cn",
            "contract.serviceName_jp"
        ],
        "contract.signingDate": [
            "contract.signingDate_cn",
            "contract.signingDate_jp"
        ],
        "warranty.periodYears": [
            "warranty.periodYears_cn",
            "warranty.periodYears_jp"
        ],
        "contract.partyA.phone": [
            "contract.partyA.phone_cn",
            "contract.partyA.phone_jp"
        ],
        "items[].maintenanceFee": [
            "items[].maintenanceFee_cn",
            "items[].maintenanceFee_jp"
        ],
        "contract.partyA.address": [
            "contract.partyA.address_cn",
            "contract.partyA.address_jp"
        ],
        "contract.systemLocation": [
            "contract.systemLocation_cn",
            "contract.systemLocation_jp"
        ],
        "contract.originalCopyCount": [
            "contract.originalCopyCount_cn",
            "contract.originalCopyCount_jp"
        ],
        "contract.partyA.postalCode": [
            "contract.partyA.postalCode_cn",
            "contract.partyA.postalCode_jp"
        ],
        "contract.eachPartyCopyCount": [
            "contract.eachPartyCopyCount_cn",
            "contract.eachPartyCopyCount_jp"
        ],
        "contract.partyA.representative": [
            "contract.partyA.representative_jp",
            "contract.partyA.representative_cn"
        ],
        "contract.partyB.representative": [
            "contract.partyB.representative_cn",
            "contract.partyB.representative_jp"
        ]
    }

    @staticmethod
    def _normalize(value: Any) -> Any:
        if value is None:
            return ""
        if isinstance(value, (str, int, float, bool, dict, list)):
            return value
        try:
            json.dumps(value, ensure_ascii=False)
            return value
        except Exception:
            return str(value)

    @classmethod
    def _normalize_params(cls, params: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "payment.method": cls._normalize(params.get("payment.method", json.loads("\"\""))),
            "payment.remark": cls._normalize(params.get("payment.remark", json.loads("\"\""))),
            "service.period": cls._normalize(params.get("service.period", json.loads("\"\""))),
            "acceptance.days": cls._normalize(params.get("acceptance.days", json.loads("\"\""))),
            "contract.partyA": cls._normalize(params.get("contract.partyA", json.loads("\"\""))),
            "service.endUser": cls._normalize(params.get("service.endUser", json.loads("\"\""))),
            "items[].quantity": cls._normalize(params.get("items[].quantity", json.loads("\"\""))),
            "otherTerms.title": cls._normalize(params.get("otherTerms.title", json.loads("\"\""))),
            "service.location": cls._normalize(params.get("service.location", json.loads("\"\""))),
            "service.progress": cls._normalize(params.get("service.progress", json.loads("\"\""))),
            "payment.finalDays": cls._normalize(params.get("payment.finalDays", json.loads("\"\""))),
            "payment.firstDays": cls._normalize(params.get("payment.firstDays", json.loads("\"\""))),
            "payment.finalRatio": cls._normalize(params.get("payment.finalRatio", json.loads("\"\""))),
            "payment.firstRatio": cls._normalize(params.get("payment.firstRatio", json.loads("\"\""))),
            "contract.contractNo": cls._normalize(params.get("contract.contractNo", json.loads("\"\""))),
            "contract.partyA.fax": cls._normalize(params.get("contract.partyA.fax", json.loads("\"\""))),
            "items[].productName": cls._normalize(params.get("items[].productName", json.loads("\"\""))),
            "items[].projectName": cls._normalize(params.get("items[].projectName", json.loads("\"\""))),
            "payment.bankAccount": cls._normalize(params.get("payment.bankAccount", json.loads("\"\""))),
            "payment.firstAmount": cls._normalize(params.get("payment.firstAmount", json.loads("\"\""))),
            "payment.totalAmount": cls._normalize(params.get("payment.totalAmount", json.loads("\"\""))),
            "contract.partyA.name": cls._normalize(params.get("contract.partyA.name", json.loads("\"\""))),
            "contract.projectName": cls._normalize(params.get("contract.projectName", json.loads("\"\""))),
            "contract.serviceName": cls._normalize(params.get("contract.serviceName", json.loads("\"\""))),
            "contract.signingDate": cls._normalize(params.get("contract.signingDate", json.loads("\"\""))),
            "warranty.periodYears": cls._normalize(params.get("warranty.periodYears", json.loads("\"\""))),
            "contract.partyA.phone": cls._normalize(params.get("contract.partyA.phone", json.loads("\"\""))),
            "items[].maintenanceFee": cls._normalize(params.get("items[].maintenanceFee", json.loads("\"\""))),
            "contract.partyA.address": cls._normalize(params.get("contract.partyA.address", json.loads("\"\""))),
            "contract.systemLocation": cls._normalize(params.get("contract.systemLocation", json.loads("\"\""))),
            "contract.originalCopyCount": cls._normalize(params.get("contract.originalCopyCount", json.loads("\"\""))),
            "contract.partyA.postalCode": cls._normalize(params.get("contract.partyA.postalCode", json.loads("\"\""))),
            "contract.eachPartyCopyCount": cls._normalize(params.get("contract.eachPartyCopyCount", json.loads("\"\""))),
            "contract.partyA.representative": cls._normalize(params.get("contract.partyA.representative", json.loads("\"\""))),
            "contract.partyB.representative": cls._normalize(params.get("contract.partyB.representative", json.loads("\"\""))),
        }

    @staticmethod
    def _is_missing(value: Any) -> bool:
        if value is None:
            return True
        if isinstance(value, str):
            return value.strip() == ""
        if isinstance(value, (dict, list)):
            return len(value) == 0
        return False

    @classmethod
    def _resolve_binding_paths(cls, key: str) -> List[str]:
        raw_paths = cls.RENDER_BINDINGS.get(key) or [key]
        if isinstance(raw_paths, str):
            raw_paths = [raw_paths]
        normalized: List[str] = []
        for item in raw_paths:
            if not isinstance(item, str):
                continue
            path = item.strip()
            if not path:
                continue
            if path.startswith("{d.") and path.endswith("}"):
                path = path[3:-1].strip()
            if path.startswith("d."):
                path = path[2:].strip()
            if path.startswith("data."):
                path = path[5:].strip()
            if path and path not in normalized:
                normalized.append(path)
        return normalized or [key]

    @staticmethod
    def _set_nested_value(target: Dict[str, Any], path: str, value: Any) -> None:
        segments = [segment.strip() for segment in str(path or "").split(".") if segment and segment.strip()]
        if not segments:
            return
        current = target
        for segment in segments[:-1]:
            existing = current.get(segment)
            if not isinstance(existing, dict):
                existing = {}
                current[segment] = existing
            current = existing
        current[segments[-1]] = value

    @staticmethod
    def _ensure_array_path(target: Dict[str, Any], path: str) -> list:
        segments = [segment.strip() for segment in str(path or "").split(".") if segment and segment.strip()]
        if not segments:
            return []
        current = target
        for segment in segments[:-1]:
            existing = current.get(segment)
            if not isinstance(existing, dict):
                existing = {}
                current[segment] = existing
            current = existing
        leaf_key = segments[-1]
        existing_leaf = current.get(leaf_key)
        if not isinstance(existing_leaf, list):
            existing_leaf = []
            current[leaf_key] = existing_leaf
        return existing_leaf

    @staticmethod
    def _extract_binding_locale(path: str) -> str | None:
        normalized_path = str(path or "").strip()
        if re.search(r"(_cn|_zh)$", normalized_path, re.IGNORECASE):
            return "cn"
        if re.search(r"(_jp|_ja)$", normalized_path, re.IGNORECASE):
            return "jp"
        return None

    @classmethod
    def _resolve_localized_binding_value(cls, path: str, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        locale = cls._extract_binding_locale(path)
        if not locale:
            for candidate in ["cn", "zh", "jp", "ja"]:
                if candidate in value and value[candidate] is not None:
                    return value[candidate]
            return value
        locale_candidates = ["cn", "zh"] if locale == "cn" else ["jp", "ja"]
        for candidate in locale_candidates:
            if candidate in value and value[candidate] is not None:
                return value[candidate]
        return None

    @classmethod
    def _set_bound_value(cls, target: Dict[str, Any], path: str, value: Any) -> None:
        resolved_value = cls._resolve_localized_binding_value(path, value)
        if resolved_value is None:
            return
        array_match = re.match(r"^(.*)\[\]\.(.+)$", str(path or "").strip())
        if array_match:
            array_path = array_match.group(1).strip()
            item_path = array_match.group(2).strip()
            if not array_path or not item_path or not isinstance(resolved_value, list):
                return
            items = cls._ensure_array_path(target, array_path)
            for index, item_value in enumerate(resolved_value):
                existing_item = items[index] if index < len(items) else None
                if not isinstance(existing_item, dict):
                    existing_item = {}
                    if index < len(items):
                        items[index] = existing_item
                    else:
                        items.append(existing_item)
                cls._set_nested_value(existing_item, item_path, item_value)
            return
        cls._set_nested_value(target, path, resolved_value)

    @classmethod
    def _build_render_data(cls, params: Dict[str, Any]) -> Dict[str, Any]:
        render_data: Dict[str, Any] = {}
        for key, value in params.items():
            for binding_path in cls._resolve_binding_paths(key):
                cls._set_bound_value(render_data, binding_path, value)
        return render_data

    @staticmethod
    def _validate_required_params(params: Dict[str, Any]) -> None:
        required_params = ["payment.method","payment.remark","service.period","acceptance.days","contract.partyA","service.endUser","items[].quantity","otherTerms.title","service.location","service.progress","payment.finalDays","payment.firstDays","payment.finalRatio","payment.firstRatio","contract.contractNo","contract.partyA.fax","items[].productName","items[].projectName","payment.bankAccount","payment.firstAmount","payment.totalAmount","contract.partyA.name","contract.projectName","contract.serviceName","contract.signingDate","warranty.periodYears","contract.partyA.phone","items[].maintenanceFee","contract.partyA.address","contract.systemLocation","contract.originalCopyCount","contract.partyA.postalCode","contract.eachPartyCopyCount","contract.partyA.representative","contract.partyB.representative"]
        missing_params = [key for key in required_params if Template1febbc18Workflow._is_missing(params.get(key))]
        if missing_params:
            raise ApplicationError(f"缺少必需参数: {', '.join(missing_params)}", non_retryable=True)

    async def run(self, params: dict) -> Dict[str, Any]:
        workflow.logger.info("启动工作流: 技术サービス契約生成ワークフロー")
        normalized_params = self._normalize_params(params or {})
        self._validate_required_params(normalized_params)
        activity_input = {
            "templateId": "1febbc18-1f17-4c49-a4b2-9bfb38fffeaf",
            "data": normalized_params,
            "outputFormat": "docx",
            "targetLanguages": json.loads("[\"ja\"]"),
            "prepareLocalizedRenderData": True,
            "outputName": "技术服务合同_{contract.contractNo}_{contract.signingDate}.docx",
        }
        workflow.logger.info("执行共享文档渲染 Activity: 文档渲染")
        result = await workflow.execute_activity(
            documentRender,
            activity_input,
            start_to_close_timeout=timedelta(seconds=60),
        )
        return result

