"""
Unit tests for personal reminder tool in dsh_modules.
"""

import unittest
import json
from unittest.mock import patch
import datetime
import zoneinfo
from dsh_modules.reminder_tools import create_personal_reminders
from dsh_modules.telemetry import extract_dsh_markers, strip_dsh_markers
from dsh_modules.tools import execute_tool, SANDBOX_TOOLS


class TestDshReminderTool(unittest.TestCase):
    def test_create_personal_reminders_batch(self):
        items = [
            {
                "title": "WSBK 排位赛",
                "message": "WSBK WorldSSP300 排位赛 19:10 - 19:35",
                "run_at": "2026-09-26T19:10:00+08:00",
                "send_wechat": True,
            },
            {
                "title": "WSBK 第一场正赛",
                "message": "WSBK WorldSSP300 第一场正赛 17:30",
                "run_at": "2026-09-27T17:30:00+08:00",
                "send_wechat": True,
            },
            {
                "title": "WSBK 第二场正赛",
                "message": "WSBK WorldSSP300 第二场正赛 20:30",
                "run_at": "2026-09-28T20:30:00+08:00",
                "send_wechat": True,
            },
        ]
        res = create_personal_reminders(reminders=items)
        self.assertIn("<<<DSH_REMINDER_CREATE:", res)
        self.assertIn("WSBK 排位赛", res)
        self.assertIn("WSBK 第一场正赛", res)
        self.assertIn("WSBK 第二场正赛", res)
        self.assertIn("已准备提交 3 条提醒日程", res)

        # 验证 protocol marker json
        markers = extract_dsh_markers(res, "REMINDER_CREATE")
        self.assertEqual(len(markers), 1)
        parsed = json.loads(markers[0][0])
        self.assertEqual(len(parsed), 3)
        self.assertEqual(parsed[0]["title"], "WSBK 排位赛")
        self.assertEqual(parsed[0]["runAt"], "2026-09-26T19:10:00+08:00")
        self.assertTrue(parsed[0]["sendWechat"])

    def test_create_personal_reminders_single_kwargs(self):
        res = create_personal_reminders(
            title="点检提醒",
            message="检查各微服务在线状态",
            run_at="2026-09-26T09:00:00+08:00"
        )
        self.assertIn("<<<DSH_REMINDER_CREATE:", res)
        self.assertIn("点检提醒", res)
        markers = extract_dsh_markers(res, "REMINDER_CREATE")
        parsed = json.loads(markers[0][0])
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["title"], "点检提醒")

    def test_execute_tool_dispatch_reminder(self):
        res = execute_tool("create_reminders", {
            "reminders": [
                {
                    "title": "会议提醒",
                    "message": "下午两点开周会",
                    "run_at": "2026-09-26T14:00:00+08:00"
                }
            ]
        })
        self.assertIn("<<<DSH_REMINDER_CREATE:", res)
        self.assertIn("会议提醒", res)

    def test_create_personal_reminders_synonyms_and_booleans(self):
        # 验证别名: name 代替 title, content 代替 message, time 代替 run_at, string 'false' 代替 boolean
        res = create_personal_reminders(
            items=[
                {
                    "name": "看花灯",
                    "content": "晚上18点40分看花灯活动",
                    "time": "2026-09-26T18:40:00+08:00",
                    "send_wechat": "false"
                }
            ]
        )
        self.assertIn("<<<DSH_REMINDER_CREATE:", res)
        self.assertIn("看花灯", res)
        markers = extract_dsh_markers(res, "REMINDER_CREATE")
        parsed = json.loads(markers[0][0])
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["title"], "看花灯")
        self.assertEqual(parsed[0]["message"], "晚上18点40分看花灯活动")
        self.assertEqual(parsed[0]["runAt"], "2026-09-26T18:40:00+08:00")
        self.assertFalse(parsed[0]["sendWechat"])

    def test_create_personal_reminders_stringified_json(self):
        # 验证大模型若返回序列化的 JSON 字符串时能自动反序列化
        json_str = json.dumps([
            {
                "title": "晨会点检",
                "message": "检查生产集群",
                "run_at": "2026-09-26T09:30:00+08:00"
            }
        ])
        res = create_personal_reminders(reminders=json_str)
        self.assertIn("<<<DSH_REMINDER_CREATE:", res)
        self.assertIn("晨会点检", res)
        markers = extract_dsh_markers(res, "REMINDER_CREATE")
        parsed = json.loads(markers[0][0])
        self.assertEqual(parsed[0]["title"], "晨会点检")

    def test_create_personal_reminders_flattened_kwargs_synonyms(self):
        # 验证扁平 kwargs 别名 (task, remind_at)
        res = create_personal_reminders(
            task="提交周报",
            remind_at="2026-09-26T18:00:00+08:00"
        )
        self.assertIn("<<<DSH_REMINDER_CREATE:", res)
        self.assertIn("提交周报", res)
        markers = extract_dsh_markers(res, "REMINDER_CREATE")
        parsed = json.loads(markers[0][0])
        self.assertEqual(parsed[0]["title"], "提交周报")
        self.assertEqual(parsed[0]["runAt"], "2026-09-26T18:00:00+08:00")

    def test_create_personal_reminders_scheduled_time_and_channel(self):
        # 验证真实场景: qwen 模型输出 scheduled_time 和 channel="微信+站内"
        res = create_personal_reminders(
            title="去洗澡",
            content="去洗澡",
            scheduled_time="2026-09-26T21:35:00+08:00",
            channel="微信+站内"
        )
        self.assertIn("<<<DSH_REMINDER_CREATE:", res)
        self.assertIn("去洗澡", res)
        markers = extract_dsh_markers(res, "REMINDER_CREATE")
        parsed = json.loads(markers[0][0])
        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0]["title"], "去洗澡")
        self.assertEqual(parsed[0]["message"], "去洗澡")
        self.assertEqual(parsed[0]["runAt"], "2026-09-26T21:35:00+08:00")
        self.assertTrue(parsed[0]["sendWechat"])

    def test_validation_rejects_missing_time(self):
        """[P1] 验证缺少提醒时间或周期时严禁输出成功标记与成功文案"""
        res = create_personal_reminders(title="无时间提醒", message="开会")
        self.assertIn("未能创建提醒", res)
        self.assertIn("缺少提醒时间或周期", res)
        self.assertNotIn("<<<DSH_REMINDER_CREATE:", res)
        self.assertNotIn("已成功为您创建", res)

    def test_validation_rejects_past_time(self):
        """[P1] 验证过去时间被严格拦截"""
        res = create_personal_reminders(title="过去提醒", run_at="2020-01-01T10:00:00")
        self.assertIn("未能创建提醒", res)
        self.assertIn("必须是将来的时间", res)
        self.assertNotIn("<<<DSH_REMINDER_CREATE:", res)

    def test_validation_rejects_invalid_cron(self):
        """[P1] 验证非法 Cron 表达式被严格拦截"""
        res = create_personal_reminders(title="周期提醒", cron="invalid-cron")
        self.assertIn("未能创建提醒", res)
        self.assertIn("格式无效", res)
        self.assertNotIn("<<<DSH_REMINDER_CREATE:", res)

    def test_marker_protocol_immune_to_arrow_delimiter(self):
        """[P2] 验证标题或内容中包含 >>> 字符时协议标记不被非贪婪截断"""
        res = create_personal_reminders(
            title="A>>>B",
            message="详情包含 >>> 符号",
            run_at="2026-09-26T10:00:00+08:00"
        )
        self.assertIn("<<<DSH_REMINDER_CREATE:len=", res)
        markers = extract_dsh_markers(res, "REMINDER_CREATE")
        self.assertEqual(len(markers), 1)
        parsed = json.loads(markers[0][0])
        self.assertEqual(parsed[0]["title"], "A>>>B")
        self.assertEqual(parsed[0]["message"], "详情包含 >>> 符号")

        # 验证剥离后不会遗留破坏性协议碎片
        stripped = strip_dsh_markers(res, ["REMINDER_CREATE"])
        self.assertNotIn("<<<DSH_REMINDER_CREATE", stripped)
        self.assertNotIn("A>>>B", stripped.split("已准备提交")[0])

    def test_parse_markdown_tool_call_for_reminders(self):
        # 验证模型输出 `create_reminders`\n```json\n{...}\n``` 时能够成功解析为工具调用
        from dsh_modules.llm import parse_tool_calls
        text = """`create_reminders`
```json
{
  "title": "去洗澡",
  "content": "去洗澡",
  "scheduled_time": "2026-09-26T21:35:00+08:00",
  "channel": "微信+站内"
}
```"""
        calls = parse_tool_calls(text)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["name"], "create_reminders")
        self.assertEqual(calls[0]["params"]["title"], "去洗澡")
        self.assertEqual(calls[0]["params"]["scheduled_time"], "2026-09-26T21:35:00+08:00")


if __name__ == "__main__":
    unittest.main()

