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
            "schedule_time", "scheduleTime", "due_date", "dueDate",
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

