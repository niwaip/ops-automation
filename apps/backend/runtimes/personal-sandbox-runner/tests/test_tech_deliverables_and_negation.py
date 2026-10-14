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


if __name__ == "__main__":
    unittest.main()
