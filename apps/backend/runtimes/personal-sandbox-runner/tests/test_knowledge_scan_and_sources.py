"""
Unit tests for knowledge scan prioritization and retrieval sources footer.
"""

import unittest
import tempfile
import shutil
import sys
from pathlib import Path

# Add src to sys.path
src_dir = Path(__file__).resolve().parent.parent / "src"
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

from dsh_modules.file_tools import (
    scan_personal_knowledge,
    get_last_scanned_knowledge_files,
    _extract_knowledge_query_keywords,
    _get_file_type_tier_and_score
)
from dsh_modules.response_sources import (
    extract_search_sources,
    format_retrieval_sources_footer,
    append_retrieval_sources_footer,
    is_file_negated_in_text,
    KNOWLEDGE_CITATION_THRESHOLD
)


class KnowledgeScanAndSourcesTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        import dsh_modules.config as cfg
        self._orig_kn = getattr(cfg, "KNOWLEDGE_DIR", "/knowledge")
        cfg.KNOWLEDGE_DIR = self.temp_dir

    def tearDown(self):
        import dsh_modules.config as cfg
        cfg.KNOWLEDGE_DIR = self._orig_kn
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_tier_priority(self):
        """Under equal conditions: .md, .txt > .pdf > .docx > others."""
        tier_md, score_md = _get_file_type_tier_and_score(".md")
        tier_txt, score_txt = _get_file_type_tier_and_score(".txt")
        tier_pdf, score_pdf = _get_file_type_tier_and_score(".pdf")
        tier_docx, score_docx = _get_file_type_tier_and_score(".docx")
        tier_xlsx, score_xlsx = _get_file_type_tier_and_score(".xlsx")

        self.assertEqual(tier_md, 1)
        self.assertEqual(tier_txt, 1)
        self.assertEqual(tier_pdf, 2)
        self.assertEqual(tier_docx, 3)
        self.assertGreater(score_md, score_pdf)
        self.assertGreater(score_pdf, score_docx)
        self.assertGreater(score_docx, score_xlsx)

    def test_extract_knowledge_query_keywords(self):
        keywords = _extract_knowledge_query_keywords("查看个人空间中 harness 的安装方法")
        self.assertIn("harness", keywords)

    def test_scan_personal_knowledge_prioritization(self):
        kn_path = Path(self.temp_dir)
        # Create diverse files
        (kn_path / "other_note.txt").write_text("random content", encoding="utf-8")
        (kn_path / "general_guide.pdf").write_text("%PDF-1.4...", encoding="utf-8")
        (kn_path / "deepseek_harness_guide.docx").write_bytes(b"PK\x03\x04 fake docx")
        (kn_path / "DeepSeek_Harness_安装指南.md").write_text("# DeepSeek Harness 安装指南\n详细步骤...", encoding="utf-8")

        summary = scan_personal_knowledge(prompt="查看个人空间中 harness 的安装方法")
        scanned = get_last_scanned_knowledge_files()

        self.assertTrue(len(scanned) >= 3)
        # Top ranked file must be the matching .md file
        self.assertEqual(scanned[0]["name"], "DeepSeek_Harness_安装指南.md")
        self.assertTrue(scanned[0]["matched"])
        self.assertIn("DeepSeek Harness 安装指南", summary)
        # Verify no raw PK binary header is leaked
        self.assertNotIn("PK\x03\x04", summary)

    def test_skills_excluded_from_retrieval(self):
        """skills 目录及其内部代码/配置文件绝不能被扫描作为知识库文档"""
        kn_path = Path(self.temp_dir)
        skills_dir = kn_path / "skills" / "dept-summary"
        skills_dir.mkdir(parents=True)
        (skills_dir / "SKILL.md").write_text("# 部门别有偿统计", encoding="utf-8")
        (skills_dir / "run.py").write_text("print('skill')", encoding="utf-8")
        (kn_path / "doc.txt").write_text("正常文档内容", encoding="utf-8")

        summary = scan_personal_knowledge(prompt="部门别有偿统计")
        scanned = get_last_scanned_knowledge_files()

        self.assertNotIn("SKILL.md", summary)
        self.assertNotIn("run.py", summary)
        scanned_names = [f["name"] for f in scanned]
        self.assertNotIn("skills/dept-summary/SKILL.md", scanned_names)
        self.assertIn("doc.txt", scanned_names)

    def test_deliverables_included_in_retrieval(self):
        """工作区产出成果库 (/workspace/deliverables) 应一并纳入检索范围"""
        import dsh_modules.config as cfg
        ws_tmp = tempfile.mkdtemp()
        orig_ws = getattr(cfg, "WORKSPACE_DIR", "/workspace")
        cfg.WORKSPACE_DIR = ws_tmp

        try:
            deliv_dir = Path(ws_tmp) / "deliverables" / "20261030_技术调研"
            deliv_dir.mkdir(parents=True)
            (deliv_dir / "Harness安装配置指南.md").write_text("# DeepSeek Harness 安装配置指南详细内容", encoding="utf-8")

            summary = scan_personal_knowledge(prompt="查看harness安装")
            scanned = get_last_scanned_knowledge_files()

            self.assertIn("Harness安装配置指南.md", summary)
            self.assertTrue(any("deliverable" in f.get("source_category", "") for f in scanned))

            footer = format_retrieval_sources_footer(local_files=scanned)
            self.assertIn("**产出成果库：**", footer)
            self.assertIn("Harness安装配置指南.md", footer)
        finally:
            cfg.WORKSPACE_DIR = orig_ws
            shutil.rmtree(ws_tmp, ignore_errors=True)

    def test_extract_search_sources(self):
        raw_search = """【平台联网检索｜来源: tavily】
1. [DeepSeek Harness 安装 | 菜鸟教程](https://www.runoob.com/deepseek-harness/install.html)
    官方桌面版与 npm 安装教程
2. [harness/harness · GitHub](https://github.com/harness/harness)
    Harness Open Source DevOps platform
3. [DeepSeek Harness 安装 | 菜鸟教程](https://www.runoob.com/deepseek-harness/install.html)
"""
        sources = extract_search_sources(raw_search)
        self.assertEqual(len(sources), 2)  # Deduplicated
        self.assertEqual(sources[0]["title"], "DeepSeek Harness 安装 | 菜鸟教程")
        self.assertEqual(sources[0]["url"], "https://www.runoob.com/deepseek-harness/install.html")
        self.assertEqual(sources[1]["url"], "https://github.com/harness/harness")

    def test_format_retrieval_sources_footer(self):
        local_files = [{"name": "DeepSeek_Harness_安装指南.md"}]
        web_sources = [{"title": "菜鸟教程", "url": "https://www.runoob.com"}]

        footer = format_retrieval_sources_footer(local_files=local_files, web_sources=web_sources)
        self.assertIn("### 📚 资料与引用来源", footer)
        self.assertIn("本地知识库 / 个人空间：", footer)
        self.assertIn("`DeepSeek_Harness_安装指南.md`", footer)
        self.assertIn("网络检索来源：", footer)
        self.assertIn("[菜鸟教程](https://www.runoob.com)", footer)

    def test_append_retrieval_sources_footer(self):
        initial_reply = "这是关于 Harness 的安装回答正文。"
        local_files = [{"name": "DeepSeek_Harness_安装指南.md", "matched": True}]
        raw_search = "1. [菜鸟教程](https://www.runoob.com/dsh)\n"

        result = append_retrieval_sources_footer(
            initial_reply,
            prompt="查看个人空间中 harness 的安装方法",
            search_context=raw_search,
            local_knowledge_files=local_files
        )

        self.assertIn("这是关于 Harness 的安装回答正文。", result)
        self.assertIn("### 📚 资料与引用来源", result)
        self.assertIn("`DeepSeek_Harness_安装指南.md`", result)
        self.assertIn("[菜鸟教程](https://www.runoob.com/dsh)", result)

        # Do not duplicate if already exists
        result_again = append_retrieval_sources_footer(
            result,
            prompt="查看个人空间中 harness 的安装方法",
            search_context=raw_search,
            local_knowledge_files=local_files
        )
        self.assertEqual(result, result_again)

    def test_fulltext_grep_ranking_and_snippet(self):
        """文件名不含关键词，但正文全文包含关键词时，正文 Grep 机制能成功命中并提取窗口片段"""
        kn_path = Path(self.temp_dir)
        # 文件名完全不含关键词 'harness'
        doc_path = kn_path / "20261019_回归计算链路验证.md"
        doc_path.write_text(
            "# 链路自动化说明\n" + ("无关键内容行...\n" * 50) +
            "在第 51 行重点介绍了 DeepSeek Harness 的分布式调度配置与核心设计。\n" +
            ("更多后续内容...\n" * 30),
            encoding="utf-8"
        )
        summary = scan_personal_knowledge(prompt="查看个人空间中 harness 的内容")
        scanned = get_last_scanned_knowledge_files()

        self.assertTrue(len(scanned) >= 1)
        self.assertEqual(scanned[0]["name"], "20261019_回归计算链路验证.md")
        self.assertTrue(scanned[0]["matched"])
        # 验证提取出的 preview 为包含关键词的高亮段落，而不是机械的前50行
        self.assertIn("DeepSeek Harness 的分布式调度配置", summary)

    def test_multi_keywords_extraction_and_freshness(self):
        """测试多关键词切分提取以及新鲜度加权"""
        keywords = _extract_knowledge_query_keywords("查看个人空间关于ai运维自动化测试的文档")
        self.assertIn("ai", keywords)
        self.assertTrue(any(k in ["运维", "自动化", "测试"] for k in keywords))

        # 新鲜度加权
        from dsh_modules.personal_knowledge_search import _calculate_freshness_boost
        import time
        now = time.time()
        self.assertEqual(_calculate_freshness_boost(now - 3600), 80)  # 1小时前
        self.assertEqual(_calculate_freshness_boost(now - 5 * 86400), 40)  # 5天前
        self.assertEqual(_calculate_freshness_boost(now - 40 * 86400), 0)  # 40天前

    def test_is_file_negated_in_text(self):
        """测试正文否定语义识别，准确剔除模型判定为无关/排他的文档"""
        # 1. 真实复现用户场景：正文明确判定另一份文档无关
        text_case1 = (
            "您的个人空间中 harness 相关的内容如下：\n"
            "DeepSeek Harness多平台安装与首配置指南.md\n\n"
            "> 💡 个人空间中共有 2 份文档，另一份 E2E企业协同基础算力与格式遵循回归测试报告.md 与 harness 无关，属于企业协同回归测试产出。"
        )
        self.assertTrue(is_file_negated_in_text("E2E企业协同基础算力与格式遵循回归测试报告.md", text_case1))
        self.assertTrue(is_file_negated_in_text("deliverables/20261019_回归测试/E2E企业协同基础算力与格式遵循回归测试报告.md", text_case1))
        self.assertFalse(is_file_negated_in_text("DeepSeek Harness多平台安装与首配置指南.md", text_case1))

        # 2. 其他否定模式
        text_case2 = "经核实，该需求已排除架构设计总览.docx，不属于当前讨论范围。"
        self.assertTrue(is_file_negated_in_text("架构设计总览.docx", text_case2))

        # 3. 正常肯定引用不误伤
        text_case3 = "核心配置参见 DeepSeek Harness多平台安装与首配置指南.md 第 2 节。"
        self.assertFalse(is_file_negated_in_text("DeepSeek Harness多平台安装与首配置指南.md", text_case3))

    def test_sources_footer_strict_threshold_and_negation_exclusion(self):
        """测试页脚引用来源门禁：得分低于阈值或被正文否定的文档绝对不出现，且彻底杜绝无脑兜底"""
        reply_text = (
            "您的个人空间中 harness 相关的内容如下：\n"
            "重点配置为单机分布式调度。\n\n"
            "> 💡 个人空间中共有 2 份文档，另一份 E2E企业协同基础算力与格式遵循回归测试报告.md 与 harness 无关。"
        )

        scanned_files = [
            # 有效命中项：关键词匹配且得分达到阈值 (>= 200)
            {
                "name": "deliverables/20261030_技术调研/DeepSeek Harness多平台安装与首配置指南.md",
                "matched": True,
                "score": 650,
                "source_category": "deliverable"
            },
            # 误扫描项：正文已明确否定与 harness 无关
            {
                "name": "deliverables/20261019_回归测试/E2E企业协同基础算力与格式遵循回归测试报告.md",
                "matched": True,
                "score": 300,
                "source_category": "deliverable"
            },
            # 低分无关项：未匹配且分值低于阈值
            {
                "name": "other_notes.txt",
                "matched": False,
                "score": 100,
                "source_category": "knowledge"
            }
        ]

        result = append_retrieval_sources_footer(
            reply_text,
            prompt="查看个人空间里面harness的内容",
            local_knowledge_files=scanned_files
        )

        # 验证有效命中项正常展示
        self.assertIn("DeepSeek Harness多平台安装与首配置指南.md", result)
        # 验证被正文判定为无关的文档绝对不出现在产出成果库引用中
        self.assertNotIn("E2E企业协同基础算力与格式遵循回归测试报告.md", result.split("### 📚 资料与引用来源")[-1])
        # 验证低分无关项绝不展示
        self.assertNotIn("other_notes.txt", result)

        # 极端场景：若只有未匹配或低分项，绝不产生兜底引用来源
        empty_fallback_result = append_retrieval_sources_footer(
            "测试回答正文",
            prompt="某个无匹配关键词",
            local_knowledge_files=[{"name": "irrelevant.md", "matched": False, "score": 110}]
        )
        self.assertNotIn("### 📚 资料与引用来源", empty_fallback_result)
        self.assertEqual(empty_fallback_result, "测试回答正文")

    def test_scan_personal_knowledge_filters_out_irrelevant_files_when_matched(self):
        """当存在明确查询关键词且有高命中项时，scan_personal_knowledge 严禁将无关文档格式化进 summary"""
        kn_path = Path(self.temp_dir)
        (kn_path / "DeepSeek_Harness_安装指南.md").write_text("# Harness 指南\n包含关键 harness 安装内容...", encoding="utf-8")
        (kn_path / "E2E企业协同基础算力与格式遵循回归测试报告.md").write_text("# 企业协同回归报告\n完全无关的测试...", encoding="utf-8")

        summary = scan_personal_knowledge(prompt="查看个人空间中 harness 的内容")

        # summary 中只能包含 Harness 安装指南，绝不能包含无关的回归测试报告
        self.assertIn("DeepSeek_Harness_安装指南.md", summary)
        self.assertNotIn("E2E企业协同基础算力与格式遵循回归测试报告.md", summary)


if __name__ == "__main__":
    unittest.main()
