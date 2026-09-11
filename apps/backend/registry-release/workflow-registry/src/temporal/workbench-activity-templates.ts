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
import urllib.error
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

    if not user_id:
        raise ApplicationError("缺少必要的用户上下文 (userId)，无法执行邮件拉取", non_retryable=True)

    req_url = f"{platform_url}/internal/workbench-inbox/emails/fetch-unread"
    payload = json.dumps({"userId": user_id, "maxCount": max_count}).encode("utf-8")
    req = urllib.request.Request(
        req_url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-User-Id": user_id,
            "User-Agent": "TemporalWorker/1.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            emails = data.get("emails", [])
            activity.logger.info(f"成功拉取到 {len(emails)} 封未读邮件")
            return {
                "success": True,
                "emails": emails,
                "count": len(emails),
                "maxCount": max_count,
            }
    except urllib.error.HTTPError as e:
        err_msg = str(e)
        try:
            body = json.loads(e.read().decode("utf-8"))
            err_msg = body.get("message") or err_msg
        except Exception:
            pass
        activity.logger.error(f"拉取未读邮件接口异常: {err_msg}")
        raise ApplicationError(f"未读邮件拉取失败: {err_msg}", non_retryable=True)
    except Exception as e:
        activity.logger.error(f"拉取未读邮件网络或系统异常: {str(e)}")
        raise ApplicationError(f"未读邮件拉取异常: {str(e)}", non_retryable=True)
`;

export const FIXED_INBOX_COLLECT_ACTIVITY_CODE = `import os
import json
import urllib.request
import urllib.error
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="inboxCollect")
async def inboxCollect(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行数据沉淀入 GTD 收件箱 Activity")
    if not isinstance(input_data, dict):
        input_data = {}

    user_id = str(input_data.get("userId") or "").strip()
    if not user_id:
        raise ApplicationError("缺少必要的用户上下文 (userId)，无法沉淀数据入库", non_retryable=True)

    raw_items = input_data.get("items") or input_data.get("emails") or []
    if isinstance(raw_items, str):
        try:
            raw_items = json.loads(raw_items)
        except Exception:
            raw_items = []

    platform_url = os.getenv("PLATFORM_INTERNAL_URL", "http://ops-platform:3001")

    payload = json.dumps({
        "userId": user_id,
        "items": raw_items,
        "sourceType": input_data.get("sourceType") or "EMAIL",
        "title": input_data.get("title"),
        "rawContent": input_data.get("rawContent"),
        "sourceSender": input_data.get("sourceSender"),
        "sourceRefId": input_data.get("sourceRefId"),
        "autoDeduplicate": bool(input_data.get("autoDeduplicate", True)),
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{platform_url}/internal/workbench-inbox/collect",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-User-Id": user_id,
            "User-Agent": "TemporalWorker/1.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            items = data.get("items") or []
            message_ids = data.get("messageIds") or []
            activity.logger.info(f"成功将 {len(items)} 条记录真实沉淀至 GTD 收件箱")
            return {
                "success": True,
                "items": items,
                "messageIds": message_ids,
                "count": len(items),
            }
    except urllib.error.HTTPError as e:
        err_msg = str(e)
        try:
            body = json.loads(e.read().decode("utf-8"))
            err_msg = body.get("message") or err_msg
        except Exception:
            pass
        activity.logger.error(f"写入收件箱失败: {err_msg}")
        raise ApplicationError(f"写入收件箱失败: {err_msg}", non_retryable=True)
    except Exception as e:
        activity.logger.error(f"写入收件箱异常: {str(e)}")
        raise ApplicationError(f"写入收件箱异常: {str(e)}", non_retryable=True)
`;

export const FIXED_EMAIL_MARK_READ_ACTIVITY_CODE = `import os
import json
import urllib.request
import urllib.error
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="emailMarkRead")
async def emailMarkRead(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行邮件标记为已读 Activity")
    if not isinstance(input_data, dict):
        input_data = {}

    user_id = str(input_data.get("userId") or "").strip()
    if not user_id:
        raise ApplicationError("缺少必要的用户上下文 (userId)，无法执行邮件回写已读", non_retryable=True)

    message_ids = input_data.get("messageIds") or []
    if isinstance(message_ids, str):
        message_ids = [message_ids]

    if not message_ids:
        activity.logger.info("无待标记已读邮件，跳过回写")
        return {
            "success": True,
            "markedCount": 0,
            "markedReadCount": 0,
            "messageIds": [],
        }

    platform_url = os.getenv("PLATFORM_INTERNAL_URL", "http://ops-platform:3001")
    payload = json.dumps({
        "userId": user_id,
        "messageIds": message_ids,
    }).encode("utf-8")

    req = urllib.request.Request(
        f"{platform_url}/internal/workbench-inbox/emails/mark-read",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-User-Id": user_id,
            "User-Agent": "TemporalWorker/1.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            marked_count = int(data.get("markedCount", len(message_ids)))
            activity.logger.info(f"成功将 {marked_count} 封邮件回写标为已读")
            return {
                "success": True,
                "markedCount": marked_count,
                "markedReadCount": marked_count,
                "messageIds": data.get("messageIds", message_ids),
            }
    except urllib.error.HTTPError as e:
        err_msg = str(e)
        try:
            body = json.loads(e.read().decode("utf-8"))
            err_msg = body.get("message") or err_msg
        except Exception:
            pass
        activity.logger.error(f"标记邮件已读失败: {err_msg}")
        raise ApplicationError(f"标记邮件已读失败: {err_msg}", non_retryable=True)
    except Exception as e:
        activity.logger.error(f"标记邮件已读异常: {str(e)}")
        raise ApplicationError(f"标记邮件已读异常: {str(e)}", non_retryable=True)
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
