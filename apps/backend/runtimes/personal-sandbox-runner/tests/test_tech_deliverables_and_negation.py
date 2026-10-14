import unittest
from pathlib import Path
import tempfile

from dsh_modules.skill_router import (
    is_text_only_request,
    is_term_negated,
    check_generation_target_is_physical,
    resolve_file_action_intent,
    SemanticSkillMatcher,
    SkillRouter,
)
from dsh_modules.deliverable_contract import (
    materialize_config_or_code_deliverable,
)
from dsh_modules.artifact_exporter import ArtifactExporter


class TechDeliverablesAndNegationTests(unittest.TestCase):

    def test_is_text_only_request(self):
        p1 = "请对比 Redis Cluster 与 Redis Sentinel。只在聊天中输出结构化 Markdown 对比表格与决策建议，不要生成或下载任何物理文件。"
        self.assertTrue(is_text_only_request(p1))

        p2 = "请给出详细的内核参数调优方案。只在正文中解答，不要生成或下载任何脚本或文件。"
        self.assertTrue(is_text_only_request(p2))

        p3 = "编写一个 Bash 运维分析脚本，文件名命名为 analyze_nginx_logs.sh。提供物理脚本文件下载，不要生成多余的 HTML 或 PPT。"
        self.assertFalse(is_text_only_request(p3))

        p4 = "生成一个 Dockerfile 和 docker-compose.yml 并提供下载"
        self.assertFalse(is_text_only_request(p4))

    def test_is_term_negated(self):
        prompt = "编写一个 Bash 脚本，不要生成多余的 HTML 或 PPT。"
        self.assertTrue(is_term_negated(prompt, "html"))
        self.assertTrue(is_term_negated(prompt, "ppt"))
        self.assertFalse(is_term_negated(prompt, "sh"))
        self.assertFalse(is_term_negated(prompt, "bash"))

        prompt2 = "只在聊天中输出对比表格，严禁生成任何物理表格文件或excel。"
        self.assertTrue(is_term_negated(prompt2, "excel"))
        self.assertTrue(is_term_negated(prompt2, "表格"))

        prompt3 = "要求：1. 不要覆盖或破坏原始 analyze_nginx_logs.sh 文件，将重构优化后的完整脚本保存为 analyze_nginx_logs_v2.sh 并确保其具备可执行权限（chmod +x）。2. 不要生成多余的 HTML 或 PPT 报告。"
        self.assertFalse(is_term_negated(prompt3, ".sh"))
        self.assertFalse(is_term_negated(prompt3, "sh"))
        self.assertFalse(is_term_negated(prompt3, "脚本"))
        self.assertTrue(is_term_negated(prompt3, "html"))
        self.assertTrue(is_term_negated(prompt3, "ppt"))

    def test_semantic_skill_matcher_negation_and_text_only(self):
        skills = [
            {"id": "xlsx", "triggers": ["excel", "表格", "xlsx"], "aliases": ["excel"], "description": "处理生成 Excel 表格"},
            {"id": "guizang-ppt", "triggers": ["ppt", "slides", "幻灯片"], "aliases": ["ppt"], "description": "生成 PPT 演示文稿"},
        ]
        matcher = SemanticSkillMatcher(skills)

        # 1. Text-only prompt should suppress xlsx and ppt
        p1 = "请对比 Redis Cluster 与 Redis Sentinel。只在聊天中输出结构化 Markdown 对比表格与决策建议，不要生成或下载任何物理文件。"
        matches = matcher.match(p1)
        for s_id, score, reasons in matches:
            if s_id in ["xlsx", "guizang-ppt"]:
                self.assertEqual(score, 0.0)

        # 2. Prompt with negated PPT should not give trigger score to guizang-ppt
        p2 = "编写一个 Bash 运维分析脚本，提供物理脚本文件下载，不要生成多余的 HTML 或 PPT。"
        matches2 = matcher.match(p2)
        ppt_score = next((score for s_id, score, _ in matches2 if s_id == "guizang-ppt"), 0.0)
        self.assertEqual(ppt_score, 0.0)

    def test_skill_router_tech_deliverables(self):
        p = "根据日志编写一个 Bash 运维分析脚本，文件名命名为“analyze_nginx_logs.sh”，提供物理脚本文件下载，不要生成多余的 HTML 或 PPT。"
        res = SkillRouter.route(p)
        self.assertTrue(res.is_generate_intent)
        self.assertIn("analyze_nginx_logs.sh", res.deliverables)
        self.assertNotIn("pptx", res.deliverables)
        self.assertNotIn("html", res.deliverables)

        p_docker = "编写一个多阶段构建的 Dockerfile 与 docker-compose.yml，提供可下载的物理文件"
        res_docker = SkillRouter.route(p_docker)
        self.assertTrue(res_docker.is_generate_intent)
        self.assertIn("Dockerfile", res_docker.deliverables)
        self.assertIn("docker-compose.yml", res_docker.deliverables)

    def test_materialize_config_or_code_deliverable(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            prompt = "编写一个多阶段构建的 Dockerfile 和 docker-compose.yml 配置文件"
            reply_text = (
                "以下是容器化配置：\n\n"
                "```dockerfile\n"
                "FROM node:20-alpine AS builder\n"
                "WORKDIR /app\n"
                "COPY package*.json ./\n"
                "RUN npm install\n"
                "COPY . .\n"
                "RUN npm run build\n\n"
                "FROM node:20-alpine AS runner\n"
                "WORKDIR /app\n"
                "USER node\n"
                "HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1\n"
                "CMD [\"node\", \"dist/main.js\"]\n"
                "```\n\n"
                "```yaml\n"
                "version: '3.8'\n"
                "services:\n"
                "  web:\n"
                "    build: .\n"
                "    ports:\n"
                "      - \"3000:3000\"\n"
                "```\n"
            )
            files = materialize_config_or_code_deliverable(prompt, reply_text, tmpdir)
            self.assertEqual(len(files), 2)
            self.assertTrue(any(f.endswith("Dockerfile") for f in files))
            self.assertTrue(any(f.endswith("docker-compose.yml") for f in files))

            df_path = Path(tmpdir) / "Dockerfile"
            self.assertTrue(df_path.exists())
            self.assertIn("FROM node:20-alpine", df_path.read_text())

            dc_path = Path(tmpdir) / "docker-compose.yml"
            self.assertTrue(dc_path.exists())
            self.assertIn("services:", dc_path.read_text())

    def test_export_deliverables_text_only(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a dummy file in workspace
            (Path(tmpdir) / "table.xlsx").write_text("dummy")
            prompt = "只在聊天中输出对比表格，不要生成或下载任何物理文件。"
            delivs = ArtifactExporter.export_deliverables(tmpdir, "这是对比结果", prompt=prompt)
            self.assertEqual(delivs, [])

    def test_mfg02_negation_and_markdown_routing(self):
        """MFG-02: '无需HTML/PPT' 必须准确识别否定，严禁激活 pptx 技能或产出 PPT/HTML 交付物契约"""
        prompt = "上传注塑机 M-03 白班交接记录，整理夜班清单，保存为制造业_M03夜班交接.md，无需HTML/PPT"
        self.assertTrue(is_term_negated(prompt, "ppt"))
        self.assertTrue(is_term_negated(prompt, "pptx"))
        self.assertTrue(is_term_negated(prompt, "html"))
        self.assertFalse(is_term_negated(prompt, "md"))

        res = SkillRouter.route(prompt)
        self.assertNotEqual(res.skill_id, "pptx")
        self.assertNotEqual(res.skill_id, "guizang-ppt")
        self.assertNotIn(".pptx", res.deliverables)
        self.assertNotIn(".html", res.deliverables)
        self.assertTrue(any(".md" in d for d in res.deliverables))

    def test_ret02_weather_re_exclusion(self):
        """RET-02: '冷藏食品温度' 绝不能被误判为天气查询导致激进预检检索"""
        from dsh_modules.runner import WEATHER_RE
        self.assertIsNone(WEATHER_RE.search("冷藏食品温度检查与设备断电核对"))
        self.assertIsNone(WEATHER_RE.search("设备运行温度保持在180度"))
        self.assertIsNotNone(WEATHER_RE.search("北京今天天气怎么样"))
        self.assertIsNotNone(WEATHER_RE.search("上海明天的气温与降水"))

    def test_open_query_no_misleading_inspect_prompt(self):
        """开放域纯提问（如'查看今天的体育比赛信息'）无附件无本地文件时，严禁注入【Inspect Mode】切勿发起外部网络调研提示词"""
        from dsh_modules.prompt_builder import build_user_turn
        q = "查看今天的体育比赛信息"
        res = SkillRouter.route(q)
        turn = build_user_turn(
            prompt=q,
            is_inspect_intent=res.is_inspect_intent,
            is_generate_intent=res.is_generate_intent,
            session_files=[],
            file_context="",
        )
        self.assertNotIn("【Inspect Mode】只做解决问题所需的本地检查；未明确指示深度调研时，切勿发起冗长外部网络调研", turn)
        self.assertNotIn("请直接基于上方提取的文件内容", turn)

    def test_mfg01_ret01_csv_rejection_in_spreadsheet_tools(self):
        """MFG-01 & RET-01: CSV 文件传入 execute_spreadsheet_analysis 或 inspect_workbook 必须优雅返回 unsupported_source_format，严禁抛出 openpyxl 致命崩溃"""
        from dsh_modules.spreadsheet_analysis import execute_spreadsheet_analysis
        from dsh_modules.workbook_reader import inspect_workbook
        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = Path(tmpdir) / "daily_report.csv"
            csv_path.write_text("line,plan,actual,defect\nLine1,100,95,5\nLine2,200,198,2\n")

            res_struct = inspect_workbook(str(csv_path))
            self.assertEqual(res_struct.status, "error")
            self.assertEqual(res_struct.error.get("code"), "unsupported_source_format")
            self.assertIn("CSV", res_struct.error.get("message", ""))

            res_agg = execute_spreadsheet_analysis({"file_path": str(csv_path), "sheet": "Sheet1", "formula": "SUM(B2:B3)"})
            self.assertIn("unsupported_source_format", str(res_agg))
            self.assertIn("CSV", str(res_agg))
            self.assertEqual(res_agg.tool_result.error.get("code"), "unsupported_source_format")


    def test_temporal_fact_query_triggers_planning_phase(self):
        """开放域时效性/动态事实查询（如'查看今天的体育赛事'）应在规划阶段激活只读事实检索"""
        from dsh_modules.planning_phase import should_run_planning_phase
        from dsh_modules.runtime_policy import RuntimePolicy
        from dsh_modules.prompt_builder import build_system_prompt, build_user_turn

        q = "查看今天的体育赛事"
        res = SkillRouter.route(q)
        policy = RuntimePolicy(thinking=True)

        should_plan, is_deliv = should_run_planning_phase(
            prompt=q,
            skill_res=res,
            policy=policy,
            has_web_search_permission=True,
            session_files=[],
            search_context=""
        )
        self.assertTrue(should_plan)
        self.assertFalse(is_deliv)

        # 验证提示词中包含防止推诿免责的指令
        user_turn = build_user_turn(
            prompt=q,
            is_inspect_intent=res.is_inspect_intent,
            is_generate_intent=res.is_generate_intent,
            session_files=[],
            file_context="",
            is_search_intent=res.is_search_intent
        )
        self.assertIn("[Live Information Retrieval Directive]", user_turn)
        self.assertIn("严禁以‘知识库截止’、‘无法访问未来/实时数据’或‘工具受限’为由推诿", user_turn)

        # 验证系统提示词中包含核心规则防免责声明
        sys_prompt = build_system_prompt(workspace_dir="/workspace", knowledge_dir="/knowledge")
        self.assertIn("NEVER claim that your tools cannot access real-time/current/future data", sys_prompt)

    def test_local_file_and_prechecked_queries_skip_fact_planning(self):
        """本地工作区提问或预检已获取事实时，不进入开放域事实规划"""
        from dsh_modules.planning_phase import should_run_planning_phase
        from dsh_modules.runtime_policy import RuntimePolicy

        policy = RuntimePolicy(thinking=True)

        # 本地工作区提问跳过外部事实规划
        res_local = SkillRouter.route("查看当前目录下的本地文件")
        should_plan, is_deliv = should_run_planning_phase(
            prompt="查看当前目录下的本地文件",
            skill_res=res_local,
            policy=policy,
            has_web_search_permission=True,
            session_files=[],
            search_context=""
        )
        self.assertFalse(should_plan)

        # 预检已成功获得事实上下文（如天气预报），无需重复进入外部事实规划
        res_weather = SkillRouter.route("查看今天北京的天气")
        should_plan_weather, _ = should_run_planning_phase(
            prompt="查看今天北京的天气",
            skill_res=res_weather,
            policy=policy,
            has_web_search_permission=True,
            session_files=[],
            search_context="【Live Weather】北京 晴 22℃"
        )
        self.assertFalse(should_plan_weather)

    def test_is_plausible_html_rejects_dummy_probe_and_accepts_rich_report(self):
        """验证 HTML 实质性有效校验：彻底拒绝 85 字节 Test 探针，接纳完整报告"""
        from dsh_modules.html_report_fallback import is_plausible_html_file, is_plausible_html_content

        dummy_html = '<html><head><meta charset="UTF-8"><title>Test</title></head><body>Test</body></html>'
        self.assertFalse(is_plausible_html_content(dummy_html))

        with tempfile.TemporaryDirectory() as tmp_dir:
            dummy_file = Path(tmp_dir) / "index.html"
            dummy_file.write_text(dummy_html, encoding="utf-8")
            self.assertFalse(is_plausible_html_file(dummy_file))

            real_html = (
                "<!doctype html><html lang='zh-CN'><head><title>2026年财务报告</title></head>"
                "<body><h1>2026 年度财务经营分析报告</h1>"
                "<p>营业收入 12,402 万元，超额完成预算目标。</p>"
                "<table><tr><th>指标</th><th>数值</th></tr><tr><td>净利润</td><td>1,603.83 万元</td></tr></table>"
                "</body></html>"
            )
            real_file = Path(tmp_dir) / "real.html"
            real_file.write_text(real_html, encoding="utf-8")
            self.assertTrue(is_plausible_html_file(real_file))

    def test_export_html_heals_fallback_state_and_rejects_dummy_probe(self):
        """验证 export_html 遇到 dummy probe 探针时不误认为成功，而是通过会话历史自愈，且消弭自相矛盾文案"""
        from dsh_modules.artifact_exporter import ArtifactExporter

        fallback_msg = (
            "⚠️ 沙箱已成功调用工具（bash），但上游模型在收尾汇总时未输出最终有效正文。\n"
            "- 已完成步骤：已成功调用 bash\n"
            "【沙箱已检索到的参考数据】:\n- 85 /workspace/index.html"
        )
        history = [
            {"role": "user", "content": "附件的内容是什么"},
            {
                "role": "assistant",
                "content": (
                    "根据提取的 PDF 内容，这份文件是 **2026 年度财务经营分析报告**：\n\n"
                    "### 一、核心经营指标摘要\n"
                    "| 指标 | 数值 |\n|---|---|\n| **营业收入** | **12,402.00 万元** |\n| **净利润** | **1,603.83 万元** |\n\n"
                    "下半年盈利加速，现金流健康。"
                )
            }
        ]

        with tempfile.TemporaryDirectory() as tmp_dir:
            # 工作区存在模型写入的 85 字节 Test 探针
            dummy_file = Path(tmp_dir) / "index.html"
            dummy_file.write_text('<html><head><meta charset="UTF-8"><title>Test</title></head><body>Test</body></html>', encoding="utf-8")

            final_text, exported = ArtifactExporter.export_html(
                final_text=fallback_msg,
                is_ppt_intent=False,
                workspace_dir=tmp_dir,
                prompt="【当前会话有效附件清单】: 2026年财务经营分析报告.pdf\n用户指令：生成一页的html",
                history=history,
                is_design_intent=True
            )

            # 确认导出产物被成功自愈恢复
            self.assertEqual(len(exported), 1)
            out_file = Path(exported[0])
            self.assertTrue(out_file.exists())
            content = out_file.read_text(encoding="utf-8")
            # 确认已替换掉 85 字节 Test，生成了真实财务报告
            self.assertIn("12,402.00 万元", content)
            self.assertIn("1,603.83 万元", content)
            # 确认不会出现“又说成功生成、又说未输出有效正文”的矛盾文案
            self.assertNotIn("⚠️ 沙箱已成功调用工具", final_text)
            self.assertIn("✨ **单页 HTML 报告已由系统基于会话内容自动整理生成！**", final_text)
            self.assertIn("恢复说明", final_text)

    def test_planning_phase_disables_web_search_with_attachment(self):
        """验证当存在本地附件且未明确要求外部检索时，规划阶段禁用 web_search，防止浪费轮次与耗时"""
        from dsh_modules.planning_phase import run_planning_phase
        from dsh_modules.runtime_policy import RuntimePolicy
        from unittest.mock import patch

        policy = RuntimePolicy(thinking=True)
        captured_tools = None

        def mock_call(messages, model, **kwargs):
            nonlocal captured_tools
            captured_tools = kwargs.get("tools")
            return {"content": "# 财务报告单页架构规划\n1. 财务指标卡片\n2. 预算达成率表格"}

        with patch("dsh_modules.runner.call_model_proxy", side_effect=mock_call):
            run_planning_phase(
                prompt="【当前会话有效附件清单】: 2026年财务经营分析报告.pdf\n用户指令：生成一页的html",
                messages=[{"role": "user", "content": "生成一页的html"}],
                model_name="default",
                policy=policy,
                has_web_search_permission=True,
                is_deliverable_task=True,
                session_files=["2026年财务经营分析报告.pdf"]
            )

        # 此时规划阶段应当禁用外部 web_search 工具，直接基于附件数据进行架构规划
        self.assertIsNone(captured_tools)


if __name__ == "__main__":
    unittest.main()

