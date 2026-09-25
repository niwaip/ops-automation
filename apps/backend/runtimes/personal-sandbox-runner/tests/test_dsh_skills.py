"""
Unit tests for DeepSeek Harness (dsh) skills, routing, artifacts, and contract architecture.
"""

import unittest
from unittest.mock import patch
import sys
from pathlib import Path

# Add src to sys.path
src_dir = Path(__file__).resolve().parent.parent / "src"
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

import os
import json
import time
import tempfile
import zipfile

from dsh_modules.tools import get_sandbox_tools
from dsh_modules.llm import parse_tool_calls
from dsh_modules.runtime_policy import RuntimePolicy
from dsh_modules.context_budget import ContextBudget
from dsh_modules.prompt_builder import (
    build_system_prompt, build_user_turn, is_context_dependent_action, extract_recent_history_topic
)
from dsh_modules.skill_router import SkillRouter, SemanticSkillMatcher, resolve_file_action_intent
from dsh_modules.eval_skill import run_skill_eval
from dsh_modules.artifact_exporter import ArtifactExporter
from dsh_modules.skills import read_skill
from dsh_modules.agent_loop import (
    run_agent_loop, is_explicit_code_request,
    detect_unexecuted_script_leak, detect_missing_requested_deliverable,
    detect_missing_claimed_artifacts
)
from dsh_modules.office_tools import extract_pptx_text


class TestDshSkillsAndArtifacts(unittest.TestCase):

    def test_skill_contract_driven_architecture(self):
        """验证技能契约驱动体系：路由契约元数据提取、动态预算规划、物理交付物断言闭环"""
        # 1. 验证 PDF 技能契约透传
        pdf_res = SkillRouter.route("生成一页的pdf")
        self.assertEqual(pdf_res.skill_id, "pdf")
        self.assertIn(".pdf", pdf_res.deliverables)
        self.assertTrue(pdf_res.requires_execution)
        self.assertEqual(pdf_res.default_rounds, 5)

        # 2. 验证 Word 技能契约透传
        docx_res = SkillRouter.route("生成word合同文档")
        self.assertEqual(docx_res.skill_id, "docx")
        self.assertIn(".docx", docx_res.deliverables)
        self.assertTrue(docx_res.requires_execution)
        self.assertEqual(docx_res.default_rounds, 5)

        # 3. 验证 Excel 技能契约透传
        xlsx_res = SkillRouter.route("做个销售报表导出excel")
        self.assertEqual(xlsx_res.skill_id, "xlsx")
        self.assertIn(".xlsx", xlsx_res.deliverables)
        self.assertTrue(xlsx_res.requires_execution)
        self.assertEqual(xlsx_res.default_rounds, 5)

        # 4. 验证契约驱动的执行轮数规划 (RuntimePolicy)
        policy = RuntimePolicy()
        self.assertEqual(policy.determine_max_rounds("任意无关提示词", skill_res=pdf_res), 5)
        self.assertEqual(policy.determine_max_rounds("任意无关提示词", skill_res=docx_res), 5)
        self.assertEqual(policy.determine_max_rounds("任意无关提示词", skill_res=xlsx_res), 5)

        # 5. 验证契约驱动的物理交付物断言
        with tempfile.TemporaryDirectory() as tmp_ws:
            with patch("dsh_modules.agent_loop.WORKSPACE_DIR", tmp_ws):
                now = time.time()
                # 尚未生成任何物理文件 -> 必须断言缺失 .pdf
                missing = detect_missing_requested_deliverable("请输出报告", now, expected_deliverables=[".pdf"])
                self.assertEqual(missing, ".pdf")

                # 生成空文件 -> 仍旧断言缺失
                pdf_file = Path(tmp_ws) / "report.pdf"
                pdf_file.touch()
                missing = detect_missing_requested_deliverable("请输出报告", now, expected_deliverables=[".pdf"])
                self.assertEqual(missing, ".pdf")

                # 写入有效内容 -> 断言通过
                pdf_file.write_bytes(b"%PDF-1.4 test")
                missing = detect_missing_requested_deliverable("请输出报告", now, expected_deliverables=[".pdf"])
                self.assertIsNone(missing)

    def test_skill_router_high_precision_and_no_false_positives(self):
        """AC-2: 验证高精度技能路由，彻底杜绝歧义词导致的灾难性误判"""
        # 正向精准触发
        res_ppt = SkillRouter.route("帮我做个汇报ppt，主题是AI Agent")
        self.assertTrue(res_ppt.is_ppt_intent)
        self.assertEqual(res_ppt.skill_id, "guizang-ppt")

        res_slash = SkillRouter.route("/ppt 架构设计方案")
        self.assertTrue(res_slash.is_ppt_intent)

        res_table = SkillRouter.route("把这些数据整理成表格并导出excel")
        self.assertEqual(res_table.skill_id, "xlsx")

        res_img = SkillRouter.route("生成图片：赛博朋克风猫咪")
        self.assertEqual(res_img.skill_id, "image-gen")

        # 逆向防误伤测试（核心验收点）
        # 1. "换成" 不应被误判为生图
        res_neg1 = SkillRouter.route("把这段话换成英文并解释语法")
        self.assertFalse(res_neg1.is_ppt_intent)
        self.assertNotEqual(res_neg1.skill_id, "image-gen")

        # 2. "页面" 不应被误判为前端原型设计
        res_neg2 = SkillRouter.route("这个页面的业务逻辑是什么意思？")
        self.assertFalse(res_neg2.is_design_intent)
        self.assertNotEqual(res_neg2.skill_id, "frontend-design")

        # 3. "画" 单字（画重点）不应被误判为生图
        res_neg3 = SkillRouter.route("请帮我画一下这篇文章的重点核心")
        self.assertNotEqual(res_neg3.skill_id, "image-gen")

        # 4. "以前的" 不应误触发知识库扫描
        res_neg4 = SkillRouter.route("对比一下以前的版本，有什么不同？")
        self.assertFalse(res_neg4.is_knowledge_intent)

        # 5. 附件前缀隔离：带 Unknown.pdf 附件的 PPT 生成指令不应被误判为 pdf
        res_attachment_ppt = SkillRouter.route("【当前会话有效附件清单】: Unknown.pdf\n用户指令：生成ppt报告")
        self.assertTrue(res_attachment_ppt.is_ppt_intent)
        self.assertEqual(res_attachment_ppt.skill_id, "guizang-ppt")

        # 6. 新增扩充：html报告、网页报告等也应精准路由至 guizang-ppt
        res_html_rep = SkillRouter.route("生成html的报告")
        self.assertTrue(res_html_rep.is_ppt_intent)
        self.assertEqual(res_html_rep.skill_id, "guizang-ppt")

        res_web_rep = SkillRouter.route("帮我做一个交互式报告")
        self.assertTrue(res_web_rep.is_ppt_intent)
        self.assertEqual(res_web_rep.skill_id, "guizang-ppt")

    def test_progressive_disclosure_and_dynamic_schema(self):
        """验证渐进式披露：System Prompt 注入 Level 1 目录且 read_skill Schema 动态包含全部技能 ID"""
        # 1. 动态生成 System Prompt
        sys_prompt = build_system_prompt("/workspace", "/knowledge")
        self.assertIn("【Available Skills Catalog】", sys_prompt)
        self.assertIn("- research:", sys_prompt)
        self.assertIn("- docx:", sys_prompt)
        self.assertIn("- guizang-ppt:", sys_prompt)
        self.assertIn("- xlsx:", sys_prompt)

        # 2. 动态读取工具 Schema
        tools = get_sandbox_tools()
        read_skill_tool = next((t for t in tools if t["function"]["name"] == "read_skill"), None)
        self.assertIsNotNone(read_skill_tool)
        skill_enum = read_skill_tool["function"]["parameters"]["properties"]["skill_name"]["enum"]
        self.assertIn("research", skill_enum)
        self.assertIn("guizang-ppt", skill_enum)
        self.assertIn("docx", skill_enum)
        self.assertIn("xlsx", skill_enum)
        self.assertIn("dashboard", skill_enum)
        self.assertIn("web-prototype", skill_enum)

    def test_semantic_matcher_plug_and_play(self):
        """验证零代码即插即用：新增自定义技能无需修改任何 Python 代码即可被语义路由器精准识别"""
        custom_skills = [
            {
                "id": "k8s-diagnose",
                "name": "Kubernetes 集群排障助手",
                "description": "诊断排查 Kubernetes 集群 Pod 故障、CrashLoopBackOff、节点资源不足与网络延迟问题。不要用于写普通 Python 脚本。",
                "triggers": ["k8s排障", "集群诊断", "pod报错", "k8s故障"],
                "aliases": ["k8s", "kubernetes"],
                "type": "custom"
            },
            {
                "id": "research",
                "name": "research",
                "description": "深度技术调研、选型对比、模型评测、近30天动态追踪与真实社区口碑分析。",
                "triggers": ["调研", "调查", "深度调研"],
                "aliases": ["research"],
                "type": "certified"
            }
        ]

        matcher = SemanticSkillMatcher(custom_skills)
        res1 = matcher.match("帮我排查一下这个 pod 报错和 k8s 集群问题")
        top_id, top_score, _ = res1[0]
        self.assertEqual(top_id, "k8s-diagnose")
        self.assertTrue(top_score >= SkillRouter.AFFINITY_THRESHOLD)

        # 验证近邻负样本不误触
        res_neg = matcher.match("写一个 Python 脚本打印 Hello World")
        top_neg_id, top_neg_score, _ = res_neg[0]
        self.assertTrue(top_neg_score < SkillRouter.AFFINITY_THRESHOLD)

    def test_skill_intent_eval_suite(self):
        """验证技能意图评测套件可准确计算 Precision、Recall、F1-score"""
        rep_research = run_skill_eval("research")
        self.assertEqual(rep_research.precision, 1.0)
        self.assertEqual(rep_research.recall, 1.0)
        self.assertEqual(rep_research.f1, 1.0)
        self.assertTrue(rep_research.passed)

        rep_docx = run_skill_eval("docx")
        self.assertEqual(rep_docx.precision, 1.0)
        self.assertEqual(rep_docx.recall, 1.0)
        self.assertEqual(rep_docx.f1, 1.0)
        self.assertTrue(rep_docx.passed)

    def test_artifact_exporter_html_extraction(self):
        """AC-4: 验证 ArtifactExporter 提取 HTML 并正确生成 Banner 与落盘"""
        with tempfile.TemporaryDirectory() as tmpdir:
            sample_output = (
                "这是为您制作的幻灯片：\n"
                "```html\n"
                "<!DOCTYPE html><html><head><title>Test Deck</title></head><body>Slide 1</body></html>\n"
                "```\n"
                "请查收。"
            )
            final_text, exported = ArtifactExporter.export_html(sample_output, is_ppt_intent=True, workspace_dir=tmpdir)
            self.assertEqual(len(exported), 1)
            self.assertTrue(exported[0].endswith("presentation.html"))
            self.assertIn("✨ **演示文稿已生成完毕！**", final_text)

            # 验证通用 HTML（如游戏、原型）也具备交互 Banner
            final_text2, exported2 = ArtifactExporter.export_html(sample_output, is_ppt_intent=False, workspace_dir=tmpdir)
            self.assertEqual(len(exported2), 1)
            self.assertTrue(exported2[0].endswith("index.html"))
            self.assertIn("✨ **交互式页面已生成完毕！**", final_text2)

            # 验证文件已成功写入
            with open(exported[0], "r", encoding="utf-8") as f:
                content = f.read()
                self.assertIn("<title>Test Deck</title>", content)

            # 验证情况 B：模型仅在磁盘生成了 gomoku.html，回复文字未附代码块时，自动回填
            with open(Path(tmpdir) / "gomoku.html", "w", encoding="utf-8") as f:
                f.write("<!DOCTYPE html><html><body><h1>五子棋</h1></body></html>")
            plain_resp = "已为您生成五子棋游戏，文件保存在 /workspace/gomoku.html，请在浏览器中打开！"
            final_text3, exported3 = ArtifactExporter.export_html(plain_resp, is_ppt_intent=False, workspace_dir=tmpdir)
            self.assertIn("✨ **交互式页面已生成完毕！**", final_text3)
            self.assertIn("/workspace/gomoku.html", final_text3)
            self.assertIn("```html\n<!DOCTYPE html>", final_text3)
            self.assertTrue(any(e.endswith("gomoku.html") for e in exported3))

            # 验证情况 C：模型因上游闪断或 Token 限制输出被截断且未闭合代码块（复现真实 0.8KB 白屏场景）
            truncated_output = (
                "为您生成微博实时热点报告：\n"
                "```html\n"
                "<!DOCTYPE html>\n"
                "<html lang=\"zh-CN\">\n"
                "<head>\n"
                "    <meta charset=\"UTF-8\">\n"
                "    <title>微博实时热点与舆情趋势洞察报告</title>\n"
                "    <style>\n"
                "        :root {\n"
                "            --bg-canvas: #f6f5f1;\n"
                "            --bg-paper: #fcf"
            )
            from dsh_modules.agent_loop import is_unclosed_or_truncated_html
            self.assertTrue(is_unclosed_or_truncated_html(truncated_output))

            final_text4, exported4 = ArtifactExporter.export_html(truncated_output, is_ppt_intent=False, workspace_dir=tmpdir)
            self.assertEqual(len(exported4), 1)
            self.assertTrue(exported4[0].endswith("index.html"))
            self.assertIn("⚠️ **页面生成中断（已启动安全保护）**", final_text4)
            self.assertIn("```html\n", final_text4)
            self.assertTrue(final_text4.strip().endswith("```"))

            # 校验导出的 HTML 文件已自愈闭合，不会呈现空白页面
            with open(exported4[0], "r", encoding="utf-8") as f:
                repaired_content = f.read()
                self.assertIn("</style>", repaired_content)
                self.assertIn("<body", repaired_content)
                self.assertIn("页面内容未完全生成", repaired_content)
                self.assertIn("</html>", repaired_content)

    def test_artifact_exporter_cross_turn_isolation(self):
        """验证跨轮次/跨会话历史 HTML 不会泄漏到后续无关对话中"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # 模拟上一轮 (t = 1000.0) 生成了 index.html (如天气报告)
            weather_html = Path(tmpdir) / "index.html"
            with open(weather_html, "w", encoding="utf-8") as f:
                f.write("<!DOCTYPE html><html><head><title>上海天气</title></head><body>天气报告</body></html>")
            os.utime(weather_html, (1000.0, 1000.0))

            # 模拟下一轮对话 (t = 1050.0)，用户发送完全无关的指令 "查看bilibili热点"
            turn_start_time = 1050.0
            bili_resp = "为您整理了 Bilibili 当前实时热点与热门榜单：\n1. 12306拒绝出票\n2. 机器人格斗"
            final_text, exported = ArtifactExporter.export_html(
                bili_resp,
                is_ppt_intent=False,
                workspace_dir=tmpdir,
                turn_start_time=turn_start_time,
                is_design_intent=False,
                prompt="查看bilibili热点"
            )

            # 验证：上一轮的 HTML 决不能泄漏到本轮回复中，文本完全保持不变
            self.assertEqual(final_text, bili_resp)
            self.assertEqual(len(exported), 0)
            self.assertNotIn("✨ **交互式页面已生成完毕！**", final_text)
            self.assertNotIn("```html", final_text)

            # 模拟又一轮对话：用户发送有 HTML 意图的指令 "制作单页报告"，且在此轮中更新了 index.html
            new_turn_start = 1200.0
            with open(weather_html, "w", encoding="utf-8") as f:
                f.write("<!DOCTYPE html><html><head><title>新报告</title></head><body>更新后的报告</body></html>")
            os.utime(weather_html, (1205.0, 1205.0))

            plain_resp2 = "已为您生成单页报告，请查看。"
            final_text2, exported2 = ArtifactExporter.export_html(
                plain_resp2,
                is_ppt_intent=False,
                workspace_dir=tmpdir,
                turn_start_time=new_turn_start,
                is_design_intent=False,
                prompt="制作单页报告"
            )
            self.assertIn("✨ **交互式页面已生成完毕！**", final_text2)
            self.assertEqual(len(exported2), 1)
            self.assertIn("```html", final_text2)

    def test_artifact_exporter_deliverables(self):
        """验证 ArtifactExporter.export_deliverables 准确识别当前轮次生成与提及的 Office 文档交付物"""
        with tempfile.TemporaryDirectory() as tmpdir:
            # 1. 模拟当前轮次生成了 docx
            docx_file = Path(tmpdir) / "保密合同_审查意见书.docx"
            docx_file.write_bytes(b"PK\x03\x04test_docx")
            now = 2000.0
            os.utime(docx_file, (now, now))

            # 2. 模拟过去轮次遗留的旧 xlsx
            old_xlsx = Path(tmpdir) / "历史记录.xlsx"
            old_xlsx.write_bytes(b"PK\x03\x04test_xlsx")
            os.utime(old_xlsx, (1000.0, 1000.0))

            # 执行探测
            text = "我已将 《保密合同_审查意见书.docx》 发送至您的聊天界面，请查收。"
            deliverables = ArtifactExporter.export_deliverables(
                tmpdir,
                final_text=text,
                turn_start_time=1990.0
            )

            file_names = [d["fileName"] for d in deliverables]
            self.assertIn("保密合同_审查意见书.docx", file_names)
            self.assertNotIn("历史记录.xlsx", file_names)

    def test_dynamic_skill_triggers(self):
        """验证从技能元数据动态获取 triggers 能够生效"""
        mock_skills = [
            {
                "id": "custom-contract-review",
                "name": "合同审查",
                "type": "custom",
                "triggers": ["起草审查合同", "法务初审"]
            }
        ]
        with patch("dsh_modules.skill_router.get_available_skills", return_value=mock_skills):
            res = SkillRouter.route("请帮我进行法务初审")
            self.assertEqual(res.skill_id, "custom-contract-review")

    def test_artifact_assertion_guard_detects_missing(self):
        """验证物理产物断言拦截器 detect_missing_claimed_artifacts 能正确拦截口头声称的虚假生成产物"""
        import dsh_modules.agent_loop as al_mod

        with tempfile.TemporaryDirectory() as tmpdir:
            orig_ws = al_mod.WORKSPACE_DIR
            try:
                al_mod.WORKSPACE_DIR = tmpdir
                # 1. 模型口头声称生成了文件，但磁盘不存在
                fake_reply = "已按照要求完成审阅，输出文件为 **《合同审查结果_最终版.docx》**，已保存到工作区。"
                missing = detect_missing_claimed_artifacts(fake_reply)
                self.assertEqual(missing, ["合同审查结果_最终版.docx"])

                # 2. 当文件物理落盘后，不再被视为 missing
                real_file = Path(tmpdir) / "合同审查结果_最终版.docx"
                real_file.write_text("real content", encoding="utf-8")
                missing_after = detect_missing_claimed_artifacts(fake_reply)
                self.assertEqual(missing_after, [])

                # 3. 正常文本交流未声称生成产物，不触发断言
                normal_reply = "关于保密合同，我建议将争议解决机构改为上海仲裁委员会。"
                self.assertEqual(detect_missing_claimed_artifacts(normal_reply), [])
            finally:
                al_mod.WORKSPACE_DIR = orig_ws

    def test_skill_router_and_prompt_builder_research_intent(self):
        """验证 SkillRouter 正确识别深度调研意图并注入 Research Grounding 事实溯源规则"""
        # 1. 关键词触发深度调研意图
        res_kw = SkillRouter.route("帮我深度调研一下业内对 Claude 3.7 的真实评价与争议")
        self.assertEqual(res_kw.skill_id, "research")
        self.assertTrue(res_kw.is_research_intent)

        # 2. 竞品选型对比关键词
        res_cmp = SkillRouter.route("做个竞品调研：FastAPI 与 Litestar 架构选型对比")
        self.assertEqual(res_cmp.skill_id, "research")
        self.assertTrue(res_cmp.is_research_intent)

        # 3. Slash 命令触发
        res_slash = SkillRouter.route("/last30days DeepSeek V3")
        self.assertEqual(res_slash.skill_id, "research")
        self.assertTrue(res_slash.is_research_intent)

        res_slash2 = SkillRouter.route("/research OpenAI Operator")
        self.assertEqual(res_slash2.skill_id, "research")
        self.assertTrue(res_slash2.is_research_intent)

        # 4. PromptBuilder 注入 Research Grounding 事实溯源硬性规范
        user_turn = build_user_turn(
            prompt="帮我深度调研一下",
            is_research_intent=True
        )
        self.assertIn("【多源深度调研与事实溯源硬性规范 (Research Grounding)】", user_turn)
        self.assertIn("freshness='month'", user_turn)
        self.assertIn("deep_research.py", user_turn)

        # 5. 简单的日常查看与代码问询：严禁触发 research
        res_inspect1 = SkillRouter.route("查看当前工作区有哪些文件")
        self.assertNotEqual(res_inspect1.skill_id, "research")
        self.assertFalse(res_inspect1.is_research_intent)

        res_inspect2 = SkillRouter.route("帮我检查一下这行代码报错原因")
        self.assertNotEqual(res_inspect2.skill_id, "research")
        self.assertFalse(res_inspect2.is_research_intent)

        res_inspect3 = SkillRouter.route("查一下这个函数的用法")
        self.assertNotEqual(res_inspect3.skill_id, "research")
        self.assertFalse(res_inspect3.is_research_intent)

        # 6. 普通查看指令在 prompt 中不应注入强制外部网络调研诱导
        user_turn_inspect = build_user_turn(
            prompt="查看当前工作区有哪些文件",
            is_inspect_intent=True,
            is_research_intent=False
        )
        self.assertNotIn("deep_research.py", user_turn_inspect)
        self.assertIn("未明确指示深度调研时，切勿发起冗长外部网络调研", user_turn_inspect)

        # 7. 用户开启调研开关 (allow_research=True)：优先启用深度调研，代词口语化追问精准消歧
        history_last30days = [
            {"role": "user", "content": "查看这个项目 并且进行分析 https://github.com/mvanhorn/last30days-skill"},
            {"role": "assistant", "content": "对开源项目 **[`mvanhorn/last30days-skill`](https://github.com/mvanhorn/last30days-skill)** 进行深入拆解..."}
        ]
        res_toggle_oral = SkillRouter.route("查看他的评价", history_last30days, allow_research=True)
        self.assertEqual(res_toggle_oral.skill_id, "research")
        self.assertTrue(res_toggle_oral.is_research_intent)
        self.assertFalse(res_toggle_oral.is_inspect_intent)

        # 验证实体消歧
        resolved_q = SkillRouter.resolve_contextual_query("查看他的评价", history_last30days)
        self.assertIn("mvanhorn/last30days-skill", resolved_q)
        self.assertIn("评价", resolved_q)

        # 验证 Prompt 注入多轮实体指代消歧提示，且绝不注入反向抑制 prompt
        user_turn_research_oral = build_user_turn(
            prompt="查看他的评价",
            is_research_intent=res_toggle_oral.is_research_intent,
            is_inspect_intent=res_toggle_oral.is_inspect_intent,
            existing_history=history_last30days
        )
        self.assertIn("【多轮实体指代消歧】", user_turn_research_oral)
        self.assertIn("mvanhorn/last30days-skill", user_turn_research_oral)
        self.assertNotIn("未明确指示深度调研时，切勿发起冗长外部网络调研", user_turn_research_oral)

    def test_context_continuity_for_followup_ppt(self):
        """验证多轮会话承接指令（如'生成一张ppt报告'）正确继承上一轮上下文主题，并实施范例主题隔离"""
        # 1. 动作依存性测试
        self.assertTrue(is_context_dependent_action("生成一张ppt报告"))
        self.assertTrue(is_context_dependent_action("做个ppt"))
        self.assertTrue(is_context_dependent_action("把内容生成一张ppt"))
        self.assertTrue(is_context_dependent_action("导出为html"))
        self.assertTrue(is_context_dependent_action("生成演示文稿"))

        # 独立新任务不应被判定为纯承接动作
        self.assertFalse(is_context_dependent_action("帮我制作一份关于新能源汽车发展的深度行业调研ppt报告"))

        # 2. 历史主题抽取测试
        history = [
            {"role": "user", "content": "查看上海这周的天气"},
            {"role": "assistant", "content": "以下是**上海本周（9月20日–9月26日）的天气预报**：\n\n| 日期 | 天气 | 最低温 | 最高温 | 降水概率 | 状况 |\n| 9月20日 | 晴 | 23°C | 29°C | 20% | 晴 |"}
        ]
        u_topic, a_topic = extract_recent_history_topic(history)
        self.assertEqual(u_topic, "查看上海这周的天气")
        self.assertIn("上海本周（9月20日–9月26日）的天气预报", a_topic)

        # 3. 验证 build_user_turn 正确注入上下文继承指令与隔离声明
        res = SkillRouter.route("生成一张ppt报告", history)
        self.assertTrue(res.is_ppt_intent)
        user_turn = build_user_turn(
            prompt="生成一张ppt报告",
            skill_context=res.skill_context,
            is_ppt_intent=res.is_ppt_intent,
            existing_history=history
        )

        self.assertIn("【多轮会话上下文继承硬性要求 (Context Continuity Directive)】", user_turn)
        self.assertIn("前序用户问题：【查看上海这周的天气】", user_turn)
        self.assertIn("上海本周（9月20日–9月26日）的天气预报", user_turn)
        self.assertIn("【注意与主题隔离要求】", user_turn)
        self.assertIn("绝不是本次生成任务的内容主题", user_turn)
        self.assertIn("若当前会话讨论的是天气、指标、业务总结等具体场景", user_turn)

    def test_hierarchical_pdf_skill_and_code_guard(self):
        """验证 PDF 技能分层按需载入、max_skill_chars 预算提升及未执行代码拦截规则"""
        # 1. 验证 RuntimePolicy 与 ContextBudget 预算提升至 12000
        policy = RuntimePolicy()
        self.assertEqual(policy.max_skill_chars, 12000)
        clipped = ContextBudget.clip_skill("A" * 4000)
        self.assertNotIn("内容已截断", clipped)

        # 2. 验证分层载入：报告场景 vs Word转PDF vs 表单
        pdf_report = read_skill("pdf", prompt="生成一页的pdf")
        self.assertIn("CleanReportPDF", pdf_report)
        self.assertIn("add_page()", pdf_report)
        self.assertIn("report.pdf", pdf_report)

        pdf_docx = read_skill("pdf", prompt="把合同转成pdf")
        self.assertIn("docx2pdf.md", pdf_docx)
        self.assertIn("DOCX_PATH", pdf_docx)

        pdf_form = read_skill("pdf", prompt="填写这个pdf表单")
        self.assertIn("fill_fillable_fields.py", pdf_form)

        # 3. 验证显式代码咨询识别
        self.assertFalse(is_explicit_code_request("生成一页的pdf"))
        self.assertFalse(is_explicit_code_request("导出为excel报表"))
        self.assertTrue(is_explicit_code_request("给我看下生成pdf的python代码"))
        self.assertTrue(is_explicit_code_request("查看代码实现"))

        # 4. 验证未执行代码脚本泄露检测
        leak_code = "```python\nimport os\nfrom fpdf import FPDF\npdf = FPDF()\npdf.output('/workspace/test.pdf')\n```"
        self.assertTrue(detect_unexecuted_script_leak(leak_code))

        # 5. 验证安全防线：未调工具的 Python/Bash 脚本不会被 parse_tool_calls 自动升级为命令执行（防 Prompt Injection 注入）
        tools = parse_tool_calls(leak_code, is_guide=False)
        self.assertEqual(len(tools), 0)

        # 6. 验证 PPTX 脚本同样被 detect_unexecuted_script_leak 检出，且不会被 parse_tool_calls 静默执行
        pptx_leak_code = '```python\nfrom pptx import Presentation\nprs = Presentation("AIGC.pptx")\nprint(prs)\n```'
        self.assertTrue(detect_unexecuted_script_leak(pptx_leak_code))
        pptx_tools = parse_tool_calls(pptx_leak_code, is_guide=False)
        self.assertEqual(len(pptx_tools), 0)

        # 7. 验证 PPTX 原生文本提取
        with tempfile.NamedTemporaryFile(suffix='.pptx', delete=False) as tf:
            pptx_path = tf.name
            slide_xml = "<?xml version='1.0' encoding='UTF-8' standalone='yes'?><p:sld xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main' xmlns:p='http://schemas.openxmlformats.org/presentationml/2006/main'><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>AIGC 深度报告测试</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>"
            with zipfile.ZipFile(pptx_path, 'w') as z:
                z.writestr('ppt/slides/slide1.xml', slide_xml)
        try:
            pptx_res = extract_pptx_text(Path(pptx_path))
            self.assertIn("AIGC 深度报告测试", pptx_res)
        finally:
            if os.path.exists(pptx_path):
                os.unlink(pptx_path)

    def test_semantic_intent_file_inspect_vs_generate(self):
        """验证文件动作语义意图分类，解耦查阅与生成，杜绝查看文件时误触发物理产物拦截"""
        # 1. 语义动作意图分类测试
        # 纯查看/查阅/分析意图 -> is_generate=False, is_inspect=True
        is_gen, is_insp = resolve_file_action_intent("查看文件内容")
        self.assertFalse(is_gen)
        self.assertTrue(is_insp)

        is_gen, is_insp = resolve_file_action_intent("查看 sample.pdf 的内容")
        self.assertFalse(is_gen)
        self.assertTrue(is_insp)

        is_gen, is_insp = resolve_file_action_intent("查阅 /workspace/data.xlsx 中的销售数据")
        self.assertFalse(is_gen)
        self.assertTrue(is_insp)

        is_gen, is_insp = resolve_file_action_intent("看一下已上传的报告")
        self.assertFalse(is_gen)
        self.assertTrue(is_insp)

        is_gen, is_insp = resolve_file_action_intent("这个pdf里讲了什么")
        self.assertFalse(is_gen)
        self.assertTrue(is_insp)

        # 语法消歧：查看刚才生成的文件 -> 仍是查看
        is_gen, is_insp = resolve_file_action_intent("查看刚才生成的 test.pdf")
        self.assertFalse(is_gen)
        self.assertTrue(is_insp)

        is_gen, is_insp = resolve_file_action_intent("检查已生成的代码")
        self.assertFalse(is_gen)
        self.assertTrue(is_insp)

        # 纯生成意图 -> is_generate=True, is_inspect=False
        is_gen, is_insp = resolve_file_action_intent("生成一份pdf")
        self.assertTrue(is_gen)
        self.assertFalse(is_insp)

        is_gen, is_insp = resolve_file_action_intent("做个销售报表导出excel")
        self.assertTrue(is_gen)
        self.assertFalse(is_insp)

        is_gen, is_insp = resolve_file_action_intent("/pdf 制作总结")
        self.assertTrue(is_gen)
        self.assertFalse(is_insp)

        # 分析并生成 -> 两者皆有
        is_gen, is_insp = resolve_file_action_intent("分析数据并生成一份报告pdf")
        self.assertTrue(is_gen)
        self.assertTrue(is_insp)

        # 2. SkillRouter 路由解耦测试
        # 查看 sample.pdf：可以命中 pdf 技能提供解析上下文，但 deliverables 必须为空，requires_execution=False
        res_insp = SkillRouter.route("查看 sample.pdf 的内容")
        self.assertTrue(res_insp.is_inspect_intent)
        self.assertFalse(res_insp.is_generate_intent)
        self.assertEqual(res_insp.deliverables, [])
        self.assertFalse(res_insp.requires_execution)
        # 查看文档的内容，然后生成一份总结（目标为文本总结，绝非 Word 物理文件落盘）
        res_doc_summary = SkillRouter.route("查看文档的内容，然后生成一份总结")
        self.assertTrue(res_doc_summary.is_inspect_intent)
        self.assertFalse(res_doc_summary.is_generate_intent)
        self.assertEqual(res_doc_summary.deliverables, [])
        self.assertFalse(res_doc_summary.requires_execution)

        # 查看文档的内容，然后生成一份word格式的总结报告（明确指出 Word/物理文件载体）
        res_doc_word = SkillRouter.route("查看文档的内容，然后生成一份word格式的总结报告")
        self.assertTrue(res_doc_word.is_inspect_intent)
        self.assertTrue(res_doc_word.is_generate_intent)
        self.assertIn(".docx", res_doc_word.deliverables)
        self.assertTrue(res_doc_word.requires_execution)

        # 验证附件指代消歧：带 AIGC.pptx 附件且用代词“查看这个文档，并且进行总结”，应精准路由至 pptx 技能
        res_attached_pptx = SkillRouter.route(
            "【当前轮次用户上传附件】: AIGC.pptx（这是用户本轮刚上传的新文件，为本次指令的主要处理对象）\n用户指令：查看这个文档，并且进行总结"
        )
        self.assertEqual(res_attached_pptx.skill_id, "pptx")
        self.assertTrue(res_attached_pptx.is_ppt_intent)
        self.assertTrue(res_attached_pptx.is_inspect_intent)
        self.assertFalse(res_attached_pptx.is_generate_intent)
        self.assertEqual(res_attached_pptx.deliverables, [])

        # 生成 sample.pdf：必须绑定 deliverables=[".pdf"]，requires_execution=True
        res_gen = SkillRouter.route("生成一份pdf报告")
        self.assertTrue(res_gen.is_generate_intent)
        self.assertIn(".pdf", res_gen.deliverables)
        self.assertTrue(res_gen.requires_execution)
        self.assertEqual(res_gen.default_rounds, 5)

        # 内容生成html报告：必须准确识别为物理生成意图 (is_generate_intent=True)
        res_html = SkillRouter.route("内容生成html报告")
        self.assertTrue(res_html.is_generate_intent)

        # 3. 产物与交付物物理断言测试
        # 查看场景下，即使模型文本包含了 "保存到 sample.pdf" 等词汇，绝不能拦截声称产物
        claim_text = "我已查看完毕，内容已保存在 sample.pdf 中，主要指标包含：..."
        missing_claims_insp = detect_missing_claimed_artifacts(
            claim_text,
            is_generate_intent=False,
            is_inspect_intent=True
        )
        self.assertEqual(missing_claims_insp, [])

        # 生成场景下，如果模型声称已保存但文件不存在，必须触发拦截
        missing_claims_gen = detect_missing_claimed_artifacts(
            claim_text,
            is_generate_intent=True,
            is_inspect_intent=False
        )
        self.assertIn("sample.pdf", missing_claims_gen)

        # 查看场景下，交付物物理断言检测必须返回 None
        missing_deliv_insp = detect_missing_requested_deliverable(
            user_prompt="查看 sample.pdf 的内容",
            turn_start_time=time.time(),
            expected_deliverables=res_insp.deliverables,
            is_generate_intent=False,
            is_inspect_intent=True
        )
        self.assertIsNone(missing_deliv_insp)

        # 生成场景下，若物理文件未落盘，必须断言返回期望后缀
        missing_deliv_gen = detect_missing_requested_deliverable(
            user_prompt="生成一份pdf报告",
            turn_start_time=time.time(),
            expected_deliverables=res_gen.deliverables,
            is_generate_intent=True,
            is_inspect_intent=False
        )
        self.assertEqual(missing_deliv_gen, ".pdf")

        # 4. 轮数预算策略测试
        policy = RuntimePolicy()
        self.assertEqual(policy.determine_max_rounds("查看 sample.pdf 的内容", skill_res=res_insp), 3)
        self.assertEqual(policy.determine_max_rounds("查看 sample.pdf 的内容", is_inspect_intent=True), 3)
        self.assertEqual(policy.determine_max_rounds("生成一份pdf", skill_res=res_gen), 5)

        # 5. ReAct Agent Loop 验证：纯查看任务严禁触发物理文件断言拦截死循环
        messages = [{"role": "user", "content": "[User Request]:\n查看 sample.pdf 的内容"}]
        mock_response = {
            "content": "已为您查阅 sample.pdf，该文件总结保存在本地，其核心要点如下：1. 业务稳定 2. 增长良好。",
            "tool_calls": []
        }
        with patch("dsh_modules.agent_loop.call_model_proxy", return_value=mock_response):
            loop_res = run_agent_loop(
                messages,
                model="deepseek-v3",
                policy=policy,
                max_rounds=3,
                is_generate_intent=False,
                is_inspect_intent=True,
                expected_deliverables=[]
            )
            # 必须一轮顺利完成，绝无系统拦截消息插入
            self.assertIn("已为您查阅 sample.pdf", loop_res.final_text)
            self.assertNotIn("【系统产物物理断言拦截】", str(loop_res.messages))
            self.assertNotIn("【系统交付物断言拦截】", str(loop_res.messages))


if __name__ == "__main__":
    unittest.main()
