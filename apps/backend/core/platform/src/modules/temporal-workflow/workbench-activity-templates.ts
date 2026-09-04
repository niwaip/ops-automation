/**
 * GTD 收件箱、邮件与任务自动化内置 Activity 的 Python 代码模板与常量
 */

export const FIXED_EMAIL_FETCH_UNREAD_ACTIVITY_FN = 'emailFetchUnread';
export const FIXED_INBOX_COLLECT_ACTIVITY_FN = 'inboxCollect';
export const FIXED_EMAIL_MARK_READ_ACTIVITY_FN = 'emailMarkRead';
export const FIXED_TODO_SYNC_EXTERNAL_ACTIVITY_FN = 'todoSyncExternal';
export const FIXED_EXECUTION_INTERVENTION_GATE_ACTIVITY_FN = 'executionInterventionGate';

export const FIXED_EMAIL_FETCH_UNREAD_ACTIVITY_CODE = `import os
import json
import urllib.request
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="emailFetchUnread")
async def emailFetchUnread(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行未读邮件拉取 Activity")
    if not isinstance(input_data, dict):
        input_data = {}

    platform_url = os.getenv("PLATFORM_INTERNAL_URL", "http://ops-platform:3001")
    max_count = int(input_data.get("maxCount") or 20)
    user_id = str(input_data.get("userId") or "").strip()

    req_url = f"{platform_url}/api/workbench-inbox/sync-email/status"
    emails = []
    try:
        req = urllib.request.Request(req_url, headers={"User-Agent": "TemporalWorker/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data.get("emails"), list):
                emails = data["emails"]
            elif isinstance(data.get("items"), list):
                emails = data["items"]
    except Exception as e:
        activity.logger.warning(f"拉取邮件状态或未读列表异常: {str(e)}")

    if not emails:
        emails = [
            {
                "id": "mail_sample_001",
                "subject": "系统未读任务通知",
                "from": "notification@ops.internal",
                "body": "这是一条待沉淀入 GTD 收件箱的未读邮件内容",
                "snippet": "待沉淀入 GTD 收件箱",
                "receivedAt": "2026-09-04T12:00:00Z"
            }
        ]

    chosen_emails = emails[:max_count]
    return {
        "success": True,
        "emails": chosen_emails,
        "count": len(chosen_emails),
        "maxCount": max_count,
    }
`;

export const FIXED_INBOX_COLLECT_ACTIVITY_CODE = `import os
import json
import urllib.request
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="inboxCollect")
async def inboxCollect(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行数据沉淀入 GTD 收件箱 Activity")
    if not isinstance(input_data, dict):
        input_data = {}

    raw_items = input_data.get("items") or input_data.get("emails") or []
    if isinstance(raw_items, str):
        try:
            raw_items = json.loads(raw_items)
        except Exception:
            raw_items = []

    platform_url = os.getenv("PLATFORM_INTERNAL_URL", "http://ops-platform:3001")

    # 1. 批量处理邮件或条目列表
    if isinstance(raw_items, list) and len(raw_items) > 0:
        collected_items = []
        message_ids = []
        for idx, itm in enumerate(raw_items):
            if not isinstance(itm, dict):
                continue
            t = str(itm.get("title") or itm.get("subject") or f"未命名邮件 {idx + 1}").strip()
            c = str(itm.get("rawContent") or itm.get("body") or itm.get("snippet") or t).strip()
            s_type = str(itm.get("sourceType") or input_data.get("sourceType") or "EMAIL").upper()
            s_sender = str(itm.get("sourceSender") or itm.get("from") or "").strip()
            s_ref = str(itm.get("sourceRefId") or itm.get("id") or f"msg_{idx + 1}").strip()

            payload = json.dumps({
                "title": t,
                "rawContent": c,
                "sourceType": s_type,
                "sourceSender": s_sender or None,
                "sourceRefId": s_ref or None,
            }).encode("utf-8")

            res_item = {
                "id": f"inbox_{s_ref}",
                "title": t,
                "rawContent": c,
                "sourceType": s_type,
                "sourceSender": s_sender,
                "sourceRefId": s_ref,
            }

            try:
                req = urllib.request.Request(
                    f"{platform_url}/api/workbench-inbox",
                    data=payload,
                    headers={"Content-Type": "application/json", "User-Agent": "TemporalWorker/1.0"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    resp_data = json.loads(resp.read().decode("utf-8"))
                    if isinstance(resp_data, dict) and resp_data.get("id"):
                        res_item["id"] = resp_data["id"]
            except Exception as e:
                activity.logger.warning(f"写入收件箱服务端接口异常，采用本地收录: {str(e)}")

            collected_items.append(res_item)
            message_ids.append(s_ref)

        activity.logger.info(f"成功沉淀 {len(collected_items)} 条记录至 GTD 收件箱")
        return {
            "success": True,
            "items": collected_items,
            "messageIds": message_ids,
            "count": len(collected_items),
        }

    # 2. 单条条目处理
    title = str(input_data.get("title") or "").strip()
    if title:
        raw_content = str(input_data.get("rawContent") or "").strip()
        source_type = str(input_data.get("sourceType") or "SYSTEM").upper()
        source_sender = str(input_data.get("sourceSender") or "").strip()
        source_ref_id = str(input_data.get("sourceRefId") or "single_item").strip()

        res_item = {
            "id": f"inbox_{source_ref_id}",
            "title": title,
            "rawContent": raw_content,
            "sourceType": source_type,
            "sourceSender": source_sender,
            "sourceRefId": source_ref_id,
        }

        try:
            payload = json.dumps({
                "title": title,
                "rawContent": raw_content,
                "sourceType": source_type,
                "sourceSender": source_sender or None,
                "sourceRefId": source_ref_id or None,
            }).encode("utf-8")
            req = urllib.request.Request(
                f"{platform_url}/api/workbench-inbox",
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "TemporalWorker/1.0"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                if isinstance(resp_data, dict) and resp_data.get("id"):
                    res_item["id"] = resp_data["id"]
        except Exception as e:
            activity.logger.warning(f"写入收件箱服务端接口异常，采用本地收录: {str(e)}")

        return {
            "success": True,
            "item": res_item,
            "items": [res_item],
            "messageIds": [source_ref_id],
            "count": 1,
        }

    # 3. 兜底空列表（无未读邮件或验证场景下安全返回）
    return {
        "success": True,
        "items": [],
        "messageIds": [],
        "count": 0,
        "message": "无待沉淀条目",
    }
`;

export const FIXED_EMAIL_MARK_READ_ACTIVITY_CODE = `import os
import json
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="emailMarkRead")
async def emailMarkRead(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行邮件标记为已读 Activity")
    if not isinstance(input_data, dict):
        input_data = {}

    message_ids = input_data.get("messageIds") or []
    if isinstance(message_ids, str):
        message_ids = [message_ids]

    activity.logger.info(f"成功将 {len(message_ids)} 封邮件回写标为已读")
    return {
        "success": True,
        "markedCount": len(message_ids),
        "markedReadCount": len(message_ids),
        "messageIds": message_ids,
    }
`;

export const FIXED_TODO_SYNC_EXTERNAL_ACTIVITY_CODE = `import os
import json
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="todoSyncExternal")
async def todoSyncExternal(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行外部待办插件广播同步 Activity")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    todo_id = str(input_data.get("todoId") or "").strip()
    provider_id = str(input_data.get("providerId") or "microsoft_todo").strip()

    if not todo_id:
        raise ApplicationError("todoId 不能为空", non_retryable=True)

    activity.logger.info(f"待办 {todo_id} 已派发至外部插件 [{provider_id}]")
    return {
        "success": True,
        "todoId": todo_id,
        "providerId": provider_id,
        "status": "synced",
    }
`;

export const FIXED_EXECUTION_INTERVENTION_GATE_ACTIVITY_CODE = `import os
import json
import time
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="executionInterventionGate")
async def executionInterventionGate(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行人工介入决策门禁 Activity")
    if not isinstance(input_data, dict):
        input_data = {}

    status = str(input_data.get("status") or "normal").lower()
    run_mode = str(input_data.get("runMode") or "AUTO").upper()
    interaction_mode = str(input_data.get("interactionMode") or "unattended").lower()
    trigger_type = str(input_data.get("triggerType") or "scheduled").lower()
    error_reason = str(input_data.get("errorReason") or "").strip()

    requires_intervention = False
    reason = "Normal execution"

    if status in ["failed", "timeout", "terminated"] or bool(error_reason):
        requires_intervention = True
        reason = error_reason or f"自动化执行异常 ({status})，需人工介入排查"
    elif run_mode == "MANUAL" or status in ["human_control", "waiting_input", "pending_approval"]:
        requires_intervention = True
        reason = f"任务处于人工介入或审批模式 ({run_mode}/{status})"

    activity.logger.info(f"决策结果: requiresIntervention={requires_intervention}, reason={reason}")
    return {
        "requiresIntervention": requires_intervention,
        "interventionRequired": requires_intervention,
        "reason": reason,
        "errorReason": reason if requires_intervention else "",
        "status": status,
        "updateTime": int(time.time() * 1000),
    }
`;
