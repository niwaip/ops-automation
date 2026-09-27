"""
Personal reminder creation tool for DeepSeek Harness (dsh).
Allows users to create one-off or recurring reminders from natural language schedules.
"""

import json
import re
import datetime
import zoneinfo
from typing import Optional, List, Dict, Any, Tuple


def _parse_bool_flag(val: Any) -> Optional[bool]:
    """Safely normalizes various string/number/boolean values to a boolean."""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return bool(val)
    if isinstance(val, str):
        clean = val.strip().lower()
        if "微信" in val or "wechat" in clean:
            return True
        if clean in ("false", "0", "no", "off", "disable", "disabled", "否", "关", "站内", "仅站内"):
            return False
        if clean in ("true", "1", "yes", "on", "enable", "enabled", "是", "开"):
            return True
    return bool(val)


def _is_valid_timezone(tz_name: str) -> bool:
    """Validates if timezone name is recognized."""
    try:
        zoneinfo.ZoneInfo(tz_name)
        return True
    except Exception:
        return False


def _is_valid_cron(cron_str: str) -> bool:
    """Validates 5-field cron expression (supports up to 12 semicolon-separated expressions)."""
    clean = (cron_str or "").strip()
    if not clean:
        return False
    expressions = [p.strip() for p in clean.split(';') if p.strip()]
    if not expressions or len(expressions) > 12:
        return False
    cron_field_pattern = re.compile(r'^[\d\*\/\,\-]+$')
    for expr in expressions:
        parts = expr.split()
        if len(parts) != 5:
            return False
        for f in parts:
            if not cron_field_pattern.match(f):
                return False
    return True


def _get_current_time(tz: datetime.tzinfo) -> datetime.datetime:
    return datetime.datetime.now(tz)


def _validate_and_normalize_run_at(run_at_val: Any, tz_name: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Validates run_at against future time in specified timezone.
    Returns (normalized_iso_str, error_msg).
    """
    if not run_at_val:
        return None, "缺少提醒时间"
    val_str = str(run_at_val).strip().strip("\"'")
    if " " in val_str and "T" not in val_str:
        val_str = val_str.replace(" ", "T", 1)
    if not re.search(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}', val_str):
        return None, f"时间格式无效（{val_str}），请提供如 2026-09-26T10:00:00 的标准格式"

    try:
        tz = zoneinfo.ZoneInfo(tz_name)
    except Exception:
        tz = zoneinfo.ZoneInfo("Asia/Shanghai")

    try:
        iso_parse_str = val_str.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(iso_parse_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz)
        else:
            dt = dt.astimezone(tz)
    except Exception as e:
        return None, f"时间解析失败（{val_str}）: {e}"

    now = _get_current_time(tz)
    if dt <= now:
        return None, f"提醒时间（{val_str}）必须是将来的时间，当前时间为 {now.strftime('%Y-%m-%d %H:%M:%S')}"

    return val_str, None


def create_personal_reminders(reminders: Optional[Any] = None, **kwargs) -> str:
    """
    Creates one or multiple personal reminders.
    Emits the protocol marker <<<DSH_REMINDER_CREATE:...>>> for host ingestion.
    Supports a wide array of LLM parameter synonyms, stringified JSON payloads, and flattened kwargs.
    """
    raw_items = []

    # 1. 尝试从 reminders 解析（支持 list、dict 或序列化的 JSON 字符串）
    if isinstance(reminders, str) and reminders.strip():
        try:
            parsed = json.loads(reminders.strip())
            if isinstance(parsed, list):
                raw_items = parsed
            elif isinstance(parsed, dict):
                raw_items = [parsed]
        except Exception:
            pass
    elif isinstance(reminders, list) and reminders:
        raw_items = reminders
    elif isinstance(reminders, dict):
        raw_items = [reminders]

    # 2. 尝试从 kwargs 中常见的列表字段提取
    if not raw_items:
        for list_key in ("items", "reminders", "tasks", "events", "list", "records"):
            candidate = kwargs.get(list_key)
            if isinstance(candidate, str) and candidate.strip():
                try:
                    parsed = json.loads(candidate.strip())
                    if isinstance(parsed, list):
                        raw_items = parsed
                        break
                    elif isinstance(parsed, dict):
                        raw_items = [parsed]
                        break
                except Exception:
                    pass
            elif isinstance(candidate, list) and candidate:
                raw_items = candidate
                break

    # 3. 兼容单条扁平化 kwargs 参数调用（例如 create_reminders(title="...", time="...") 或 name/content 等别名）
    if not raw_items and kwargs:
        has_content = any(k in kwargs for k in (
            "title", "name", "subject", "topic", "task", "event",
            "message", "content", "desc", "description", "detail", "text"
        ))
        has_time = any(k in kwargs for k in (
            "run_at", "runAt", "time", "datetime", "date_time", "remind_at", "remindAt",
            "remind_time", "remindTime", "scheduled_at", "scheduledAt", "scheduled_time", "scheduledTime",
            "schedule_time", "scheduleTime", "due_date", "dueDate", "target_time", "targetTime", "target",
            "cron_expression", "cronExpression", "cron", "cron_expr"
        ))
        if has_content or has_time:
            raw_items = [kwargs]

    if not raw_items:
        return "未能创建提醒：未提供有效的提醒内容或时间。"

    normalized = []
    summary_lines = []
    validation_errors = []

    for idx, item in enumerate(raw_items, 1):
        if not isinstance(item, dict):
            continue

        raw_title = str(
            item.get("title")
            or item.get("name")
            or item.get("subject")
            or item.get("topic")
            or item.get("task")
            or item.get("event")
            or item.get("summary")
            or ""
        ).strip()

        raw_msg = str(
            item.get("message")
            or item.get("content")
            or item.get("desc")
            or item.get("description")
            or item.get("detail")
            or item.get("text")
            or item.get("note")
            or ""
        ).strip()

        raw_run_at = (
            item.get("run_at")
            or item.get("runAt")
            or item.get("time")
            or item.get("datetime")
            or item.get("date_time")
            or item.get("remind_at")
            or item.get("remindAt")
            or item.get("remind_time")
            or item.get("remindTime")
            or item.get("scheduled_at")
            or item.get("scheduledAt")
            or item.get("scheduled_time")
            or item.get("scheduledTime")
            or item.get("schedule_time")
            or item.get("scheduleTime")
            or item.get("due_date")
            or item.get("dueDate")
            or item.get("target_time")
            or item.get("targetTime")
            or item.get("target")
        )

        raw_cron = (
            item.get("cron_expression")
            or item.get("cronExpression")
            or item.get("cron")
            or item.get("cron_expr")
            or item.get("schedule")
            or item.get("cycle")
        )

        raw_wechat = None
        for k in ("send_wechat", "sendWechat", "wechat", "sync_wechat", "is_wechat", "notify_wechat", "channel", "channels"):
            if k in item:
                raw_wechat = item[k]
                break

        send_wechat = _parse_bool_flag(raw_wechat)
        timezone = str(item.get("timezone") or item.get("timeZone") or "Asia/Shanghai").strip()
        if not _is_valid_timezone(timezone):
            timezone = "Asia/Shanghai"

        if not raw_msg and raw_title:
            raw_msg = raw_title
        elif not raw_title and raw_msg:
            raw_title = raw_msg[:30]

        if not raw_msg:
            validation_errors.append(f"第 {idx} 条提醒缺少必要的内容或标题。")
            continue

        run_at_str = str(raw_run_at).strip().strip("\"'") if raw_run_at else ""
        cron_str = str(raw_cron).strip().strip("\"'") if raw_cron else ""

        # 严格时间校验：必须提供 runAt 或 cronExpression 中的至少一个，且不能同时提供
        if not run_at_str and not cron_str:
            validation_errors.append(
                f"提醒【{raw_title}】缺少提醒时间或周期。必须指定具体执行时间（未来时间，如 2026-09-26T10:00:00）或重复周期（Cron 表达式，如 0 9 * * 1-5）。"
            )
            continue

        if run_at_str and cron_str:
            validation_errors.append(
                f"提醒【{raw_title}】不能同时设置一次性提醒时间与重复周期。"
            )
            continue

        if run_at_str:
            norm_run_at, time_err = _validate_and_normalize_run_at(run_at_str, timezone)
            if time_err:
                validation_errors.append(f"提醒【{raw_title}】: {time_err}")
                continue
            run_at_str = norm_run_at

        if cron_str:
            if not _is_valid_cron(cron_str):
                validation_errors.append(
                    f"提醒【{raw_title}】的重复周期（{cron_str}）格式无效，请输入合法的 5 字段 Cron 表达式（如 0 9 * * 1-5）。"
                )
                continue

        entry: Dict[str, Any] = {
            "title": raw_title,
            "message": raw_msg,
        }
        if run_at_str:
            entry["runAt"] = run_at_str
        if cron_str:
            entry["cronExpression"] = cron_str
        if timezone:
            entry["timezone"] = timezone
        if send_wechat is not None:
            entry["sendWechat"] = send_wechat

        normalized.append(entry)

        time_desc = entry.get("runAt") or entry.get("cronExpression") or "指定时间"
        wechat_desc = "微信+站内" if entry.get("sendWechat", True) else "站内"
        summary_lines.append(f"{len(normalized)}. 【{raw_title}】时间: {time_desc} (提醒渠道: {wechat_desc})")

    if not normalized:
        err_msg = "\n".join(validation_errors) if validation_errors else "未提供有效的提醒内容或时间信息。"
        return f"未能创建提醒：\n{err_msg}"

    payload = json.dumps(normalized, ensure_ascii=False)
    # 采用长度前缀帧封装协议标记，杜绝标题/正文中的 >>> 字符导致正则非贪婪截断
    marker = f"<<<DSH_REMINDER_CREATE:len={len(payload)}:{payload}>>>"
    
    header = f"已准备提交 {len(normalized)} 条提醒日程至系统调度中心："
    body = "\n".join(summary_lines)
    footer = "提醒请求已提交控制面确认，待调度中心落库确认后将正式生效。"

    err_suffix = ""
    if validation_errors:
        err_suffix = "\n\n【部分提醒未通过校验未能提交】：\n" + "\n".join(validation_errors)

    return f"{marker}\n{header}\n{body}\n\n{footer}{err_suffix}"


def delete_personal_reminders(
    reminder_id: Optional[str] = None,
    id: Optional[str] = None,
    ids: Optional[Any] = None,
    title: Optional[str] = None,
    titles: Optional[Any] = None,
    **kwargs
) -> str:
    """
    Deletes one or multiple personal reminders by id or title keyword.
    Emits the protocol marker <<<DSH_REMINDER_DELETE:len=N:PAYLOAD>>> for host ingestion.
    """
    target_ids: List[str] = []
    target_titles: List[str] = []

    cand_id = reminder_id or id or kwargs.get("target_id")
    if cand_id:
        target_ids.append(str(cand_id).strip())

    if ids:
        if isinstance(ids, list):
            target_ids.extend([str(i).strip() for i in ids if str(i).strip()])
        elif isinstance(ids, str):
            try:
                parsed = json.loads(ids)
                if isinstance(parsed, list):
                    target_ids.extend([str(i).strip() for i in parsed if str(i).strip()])
                else:
                    target_ids.append(str(parsed).strip())
            except Exception:
                target_ids.append(ids.strip())

    cand_title = title or kwargs.get("name") or kwargs.get("keyword") or kwargs.get("query")
    if cand_title:
        target_titles.append(str(cand_title).strip())

    if titles:
        if isinstance(titles, list):
            target_titles.extend([str(t).strip() for t in titles if str(t).strip()])
        elif isinstance(titles, str):
            target_titles.append(titles.strip())

    if not target_ids and not target_titles and kwargs:
        for k in ("task", "item", "remind", "reminder", "content", "subject"):
            if k in kwargs and kwargs[k]:
                target_titles.append(str(kwargs[k]).strip())
                break

    if not target_ids and not target_titles:
        return "未能删除提醒：未指定要删除的提醒 ID 或标题关键词。"

    payload_data: Dict[str, Any] = {}
    if target_ids:
        payload_data["ids"] = target_ids
    if target_titles:
        payload_data["titles"] = target_titles

    payload = json.dumps(payload_data, ensure_ascii=False)
    marker = f"<<<DSH_REMINDER_DELETE:len={len(payload)}:{payload}>>>"

    desc = []
    if target_ids:
        desc.append(f"ID: {', '.join(target_ids)}")
    if target_titles:
        desc.append(f"关键词/标题: {', '.join(target_titles)}")
    header = f"已准备提交删除提醒请求至调度中心（{' | '.join(desc)}）："
    footer = "删除请求已提交控制面确认，待调度中心落库确认后将正式移除。"

    return f"{marker}\n{header}\n{footer}"


def update_personal_reminder(
    reminder_id: Optional[str] = None,
    id: Optional[str] = None,
    title: Optional[str] = None,
    message: Optional[str] = None,
    run_at: Optional[Any] = None,
    cron_expression: Optional[str] = None,
    timezone: Optional[str] = None,
    send_wechat: Optional[Any] = None,
    is_active: Optional[Any] = None,
    **kwargs
) -> str:
    """
    Updates an existing personal reminder's schedule, content, or active status.
    Emits the protocol marker <<<DSH_REMINDER_UPDATE:len=N:PAYLOAD>>> for host ingestion.
    """
    target_id = str(reminder_id or id or kwargs.get("target_id") or "").strip()
    target_title = str(title or kwargs.get("name") or kwargs.get("subject") or "").strip()

    if not target_id and not target_title:
        return "未能更新提醒：必须指定要修改的提醒 ID 或标题关键词。"

    entry: Dict[str, Any] = {}
    if target_id:
        entry["id"] = target_id
    if target_title:
        entry["title"] = target_title

    raw_msg = message or kwargs.get("content") or kwargs.get("desc") or kwargs.get("text")
    if raw_msg:
        entry["message"] = str(raw_msg).strip()

    raw_run_at = (
        run_at or kwargs.get("runAt") or kwargs.get("time") or
        kwargs.get("datetime") or kwargs.get("new_time") or kwargs.get("scheduled_time")
    )
    raw_cron = cron_expression or kwargs.get("cronExpression") or kwargs.get("cron") or kwargs.get("cycle")
    tz_name = str(timezone or kwargs.get("timeZone") or "Asia/Shanghai").strip()
    if not _is_valid_timezone(tz_name):
        tz_name = "Asia/Shanghai"
    entry["timezone"] = tz_name

    if raw_run_at and raw_cron:
        return f"未能更新提醒【{target_title or target_id}】：不能同时设置一次性提醒时间与重复周期。"

    if raw_run_at:
        norm_run_at, time_err = _validate_and_normalize_run_at(raw_run_at, tz_name)
        if time_err:
            return f"未能更新提醒【{target_title or target_id}】：{time_err}"
        entry["runAt"] = norm_run_at

    if raw_cron:
        cron_str = str(raw_cron).strip().strip("\"'")
        if not _is_valid_cron(cron_str):
            return f"未能更新提醒【{target_title or target_id}】：重复周期（{cron_str}）格式无效。"
        entry["cronExpression"] = cron_str

    raw_wechat = send_wechat if send_wechat is not None else kwargs.get("sendWechat", kwargs.get("wechat"))
    wechat_flag = _parse_bool_flag(raw_wechat)
    if wechat_flag is not None:
        entry["sendWechat"] = wechat_flag

    raw_active = is_active if is_active is not None else kwargs.get("isActive", kwargs.get("active"))
    active_flag = _parse_bool_flag(raw_active)
    if active_flag is not None:
        entry["isActive"] = active_flag

    # 至少要更新一个字段
    check_keys = [k for k in entry.keys() if k not in ("id", "title", "timezone")]
    if not check_keys:
        return f"未能更新提醒【{target_title or target_id}】：未提供需要修改的时间、内容或状态参数。"

    payload = json.dumps(entry, ensure_ascii=False)
    marker = f"<<<DSH_REMINDER_UPDATE:len={len(payload)}:{payload}>>>"

    time_desc = entry.get("runAt") or entry.get("cronExpression") or "原定时间"
    header = f"已准备提交更新提醒【{target_title or target_id}】至系统调度中心："
    body = f"新调整时间/周期: {time_desc}"
    if "sendWechat" in entry:
        body += f" | 渠道: {'微信+站内' if entry['sendWechat'] else '站内'}"
    if "isActive" in entry:
        body += f" | 状态: {'启用' if entry['isActive'] else '暂停'}"
    footer = "修改请求已提交控制面确认，待调度中心更新确认后将正式生效。"

    return f"{marker}\n{header}\n{body}\n\n{footer}"

