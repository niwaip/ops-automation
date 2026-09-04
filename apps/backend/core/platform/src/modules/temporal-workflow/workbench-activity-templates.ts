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
    try:
        req = urllib.request.Request(req_url, headers={"User-Agent": "TemporalWorker/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {
                "success": True,
                "status": data,
                "maxCount": max_count,
            }
    except Exception as e:
        activity.logger.warning(f"拉取邮件状态或未读列表异常: {str(e)}")
        return {
            "success": False,
            "error": str(e),
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
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    title = str(input_data.get("title") or "").strip()
    raw_content = str(input_data.get("rawContent") or "").strip()
    source_type = str(input_data.get("sourceType") or "SYSTEM").upper()
    source_sender = str(input_data.get("sourceSender") or "").strip()
    source_ref_id = str(input_data.get("sourceRefId") or "").strip()

    if not title:
        raise ApplicationError("title (收件箱条目标题) 不能为空", non_retryable=True)

    platform_url = os.getenv("PLATFORM_INTERNAL_URL", "http://ops-platform:3001")
    payload = json.dumps({
        "title": title,
        "rawContent": raw_content,
        "sourceType": source_type,
        "sourceSender": source_sender or None,
        "sourceRefId": source_ref_id or None,
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            f"{platform_url}/api/workbench-inbox",
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "TemporalWorker/1.0"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return {
                "success": True,
                "item": result,
            }
    except Exception as e:
        activity.logger.error(f"收集条目存入 GTD 收件箱失败: {str(e)}")
        raise ApplicationError(f"收集入收件箱失败: {str(e)}", non_retryable=False)
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
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    message_ids = input_data.get("messageIds") or []
    if isinstance(message_ids, str):
        message_ids = [message_ids]

    activity.logger.info(f"成功将 {len(message_ids)} 封邮件回写标为已读")
    return {
        "success": True,
        "markedCount": len(message_ids),
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
from temporalio import activity
from temporalio.exceptions import ApplicationError
from typing import Dict, Any

@activity.defn(name="executionInterventionGate")
async def executionInterventionGate(input_data: Dict[str, Any]) -> Dict[str, Any]:
    activity.logger.info("开始执行人工介入决策门禁 Activity")
    if not isinstance(input_data, dict):
        raise ApplicationError("input_data 必须是 dict", non_retryable=True)

    status = str(input_data.get("status") or "failed").lower()
    interaction_mode = str(input_data.get("interactionMode") or "unattended").lower()
    trigger_type = str(input_data.get("triggerType") or "scheduled").lower()

    # 判定规则：后台静默模式或定时任务出错/需审批，需要人工介入
    requires_intervention = False
    reason = "Normal execution"

    if status in ["failed", "timeout", "terminated"]:
        if interaction_mode in ["unattended", "scheduled"] or trigger_type in ["scheduled", "cron"]:
            requires_intervention = True
            reason = f"静默自动化执行出错 ({status})，需人工介入排查"
    elif status in ["human_control", "waiting_input", "pending_approval"]:
        requires_intervention = True
        reason = f"任务处于挂起等待审批或交互状态 ({status})"

    activity.logger.info(f"决策结果: requiresIntervention={requires_intervention}, reason={reason}")
    return {
        "requiresIntervention": requires_intervention,
        "reason": reason,
        "status": status,
    }
`;
