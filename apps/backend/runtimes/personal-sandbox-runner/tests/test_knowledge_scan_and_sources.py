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

    def test_auto_match_deliverable_on_tag_and_keyword(self):
        """测试在无显式个人空间意图下，当 prompt 包含成果 frontmatter 中的 tag 或文件名实体时，自动引入成果"""
        import dsh_modules.config as cfg
        ws_tmp = tempfile.mkdtemp()
        orig_ws = getattr(cfg, "WORKSPACE_DIR", "/workspace")
        cfg.WORKSPACE_DIR = ws_tmp

        try:
            deliv_dir = Path(ws_tmp) / "deliverables" / "20261104_安全方案总结"
            deliv_dir.mkdir(parents=True)
            doc_content = (
                "---\n"
                "title: \"启明星辰安全解决方案及案例简介 总结\"\n"
                "tags: [\"Venusgroup\", \"安全服务\", \"启明星辰\"]\n"
                "---\n\n"
                "# 启明星辰安全解决方案及案例简介\n"
                "涵盖专业安全服务 PSS、RSS、MSS 等体系...\n"
            )
            (deliv_dir / "安全方案总结.md").write_text(doc_content, encoding="utf-8")

            # 1. 普通提问包含 tag 'Venusgroup'，无任何 '个人空间/知识库' 指令 -> 应自动触发引入
            res_matched = scan_personal_knowledge(prompt="Venusgroup 有什么服务", auto_match_only=True)
            self.assertTrue(bool(res_matched))
            self.assertIn("安全方案总结.md", res_matched)
            scanned = get_last_scanned_knowledge_files()
            self.assertTrue(any(f.get("matched") for f in scanned))

            # 2. 普通提问包含实体 '启明星辰' -> 命中 title 和 tag -> 应自动触发引入
            res_entity = scan_personal_knowledge(prompt="启明星辰有什么服务", auto_match_only=True)
            self.assertTrue(bool(res_entity))
            self.assertIn("安全方案总结.md", res_entity)

            # 3. 完全无关的提问 -> auto_match_only 应返回空，绝不污染上下文
            res_unrelated = scan_personal_knowledge(prompt="今天北京天气怎么样", auto_match_only=True)
            self.assertEqual(res_unrelated, "")
            scanned_unrelated = get_last_scanned_knowledge_files()
            self.assertEqual(len(scanned_unrelated), 0)
        finally:
            cfg.WORKSPACE_DIR = orig_ws
            shutil.rmtree(ws_tmp, ignore_errors=True)

    def test_dynamic_web_search_sources_in_footer(self):
        """测试当 ReAct 循环内动态调用 web_search 时，提取来源链接并正确生成 ### 📚 资料与引用来源"""
        from dsh_modules.response_sources import append_retrieval_sources_footer
        
        reply_text = "根据最新公开资料，启明星辰提供专业的网络安全服务。"
        dynamic_search_output = (
            "【平台联网检索｜来源: tavily】\n\n"
            "查询覆盖：启明星辰 安全服务 产品与服务体系\n\n"
            "1. [启明星辰官网](https://www.venustech.com.cn/new_type/zyaqfw)\n"
            "    专业安全服务提供覆盖客户信息系统规划、设计、建设、运行全生命周期。\n"
            "2. [百度百科 - 启明星辰](https://baike.baidu.com/item/%E5%90%AF%E6%98%8E%E6%98%9F%E8%BE%B0/10964436)\n"
            "    国内领先的网络安全企业。\n"
        )

        final_reply = append_retrieval_sources_footer(
            reply_text,
            prompt="启明星辰有什么服务",
            search_context=dynamic_search_output,
            local_knowledge_files=[]
        )

        self.assertIn("### 📚 资料与引用来源", final_reply)
        self.assertIn("**网络检索来源：**", final_reply)
        self.assertIn("[启明星辰官网](https://www.venustech.com.cn/new_type/zyaqfw)", final_reply)
        self.assertIn("[百度百科 - 启明星辰](https://baike.baidu.com/item/%E5%90%AF%E6%98%8E%E6%98%9F%E8%BE%B0/10964436)", final_reply)

    def test_derived_cache_files_excluded_from_retrieval_and_citations(self):
        """测试内部派生文本缓存 (*.pptx.txt, 同名 .txt 派生) 及临时目录严禁被检索或引用"""
        import dsh_modules.config as cfg
        ws_tmp = tempfile.mkdtemp()
        orig_ws = getattr(cfg, "WORKSPACE_DIR", "/workspace")
        cfg.WORKSPACE_DIR = ws_tmp

        try:
            deliv_dir = Path(ws_tmp) / "deliverables" / "20261104_安全方案总结"
            deliv_dir.mkdir(parents=True)
            # 真实成果：pptx 和 md
            (deliv_dir / "启明星辰安全解决方案.pptx").write_bytes(b"PK\x03\x04 fake pptx")
            (deliv_dir / "启明星辰安全解决方案 总结.md").write_text("# 启明星辰方案总结", encoding="utf-8")
            # 内部派生提取缓存：.pptx.txt 以及同名 .txt
            (deliv_dir / "启明星辰安全解决方案.pptx.txt").write_text("内部提取缓存文本", encoding="utf-8")
            (deliv_dir / "启明星辰安全解决方案.txt").write_text("内部同名提取文本", encoding="utf-8")

            res = scan_personal_knowledge(prompt="启明星辰有什么服务", auto_match_only=True)
            scanned = get_last_scanned_knowledge_files()
            scanned_names = [f["name"] for f in scanned]

            # 验证内部派生文件已被完全过滤，绝不注入 Prompt
            self.assertFalse(any("pptx.txt" in name for name in scanned_names))
            self.assertFalse(any(name.endswith("启明星辰安全解决方案.txt") for name in scanned_names))
            # 真实成果必须正常保留
            self.assertTrue(any(name.endswith(".pptx") for name in scanned_names))
            self.assertTrue(any(name.endswith(".md") for name in scanned_names))

            # 验证引用来源页脚绝不展示派生 txt
            footer = format_retrieval_sources_footer(local_files=scanned)
            self.assertNotIn(".pptx.txt", footer)
            self.assertNotIn("启明星辰安全解决方案.txt", footer)
            self.assertIn("启明星辰安全解决方案.pptx", footer)
        finally:
            cfg.WORKSPACE_DIR = orig_ws
            shutil.rmtree(ws_tmp, ignore_errors=True)

    def test_frontmatter_tag_cleaning_and_folder_preservation(self):
        """测试 Frontmatter 标签清洗（剔除基于词、停用词、数字、格式词）以及文件夹/标题保真输出"""
        from dsh_modules.personal_knowledge_search import _extract_markdown_frontmatter
        raw_md = """---
title: "时空可组合性论文归纳分析"
tags: ["markdown", "Based", "thorough", "1996", "时空可组合性", "分布式系统", "数据分析"]
---
# 正文
"""
        fm = _extract_markdown_frontmatter(raw_md)
        self.assertEqual(fm["title"], "时空可组合性论文归纳分析")
        # 验证 markdown, Based, thorough, 1996 等无效垃圾标签已被清洗
        self.assertNotIn("markdown", fm["tags"])
        self.assertNotIn("Based", fm["tags"])
        self.assertNotIn("thorough", fm["tags"])
        self.assertNotIn("1996", fm["tags"])
        self.assertIn("时空可组合性", fm["tags"])
        self.assertIn("分布式系统", fm["tags"])
        self.assertIn("数据分析", fm["tags"])

        # 测试扫描输出中包含归档成果文件夹与文档标题保真字段
        import dsh_modules.config as cfg
        ws_tmp = tempfile.mkdtemp()
        orig_ws = getattr(cfg, "WORKSPACE_DIR", "/workspace")
        cfg.WORKSPACE_DIR = ws_tmp

        try:
            folder_name = "20261104_分析和归纳文件的详细内容，markdown，需要方...的总结"
            deliv_dir = Path(ws_tmp) / "deliverables" / folder_name
            deliv_dir.mkdir(parents=True)
            doc_file = deliv_dir / "分析总结.md"
            doc_file.write_text(raw_md, encoding="utf-8")

            # 同时放置一个自动化回归测试文件夹，验证是否被拦截
            test_dir = Path(ws_tmp) / "deliverables" / "20261019_回归测试_企业协同回归计算链路验证"
            test_dir.mkdir(parents=True)
            (test_dir / "测试报告.md").write_text("---\ntitle: '回归报告'\ntags: ['端到端测试', '回归测试']\n---\n", encoding="utf-8")

            summary = scan_personal_knowledge(prompt="查看个人空间有哪些内容")
            self.assertIn("业务主题/成果名称 (Topic): 时空可组合性论文归纳分析", summary)
            self.assertIn("核心分类标签 (Tags): #时空可组合性 #分布式系统 #数据分析", summary)
            # 确认回归测试文件夹被过滤拦截
            self.assertNotIn("20261019_回归测试_企业协同回归计算链路验证", summary)
        finally:
            cfg.WORKSPACE_DIR = orig_ws
            shutil.rmtree(ws_tmp, ignore_errors=True)

    def test_url_and_repo_keyword_filtering_and_word_boundaries(self):
        """测试针对外部 URL 与代码仓库的停用词过滤与词边界匹配，彻底杜绝短词子串误撞"""
        from dsh_modules.personal_knowledge_search import _matches_keyword

        # 1. 验证关键词提取中的 URL 协议、域名与噪音虚词过滤
        prompt1 = "查看和风险这个文章的内容 https://github.com/vercel-labs/agent-desktop/"
        kws1 = _extract_knowledge_query_keywords(prompt1)
        for noise in ["https", "http", "github", "com", "github.com", "风险", "这个", "文章", "和风险"]:
            self.assertNotIn(noise, kws1)
        self.assertIn("vercel-labs", kws1)
        self.assertIn("agent-desktop", kws1)

        # 2. 验证英文介词与通用代码词过滤
        prompt2 = "查看和分析 GitHub - vercel-labs/agent-desktop: Computer use CLI for AI agents · GitHub"
        kws2 = _extract_knowledge_query_keywords(prompt2)
        for noise in ["github", "for", "use", "cli", "和分析"]:
            self.assertNotIn(noise, kws2)

        # 3. 验证 _matches_keyword 严格遵循词边界
        self.assertFalse(_matches_keyword("contain detail daily", "ai"))
        self.assertTrue(_matches_keyword("ai agent application", "ai"))
        self.assertFalse(_matches_keyword("platform information", "for"))
        self.assertTrue(_matches_keyword("designed for users", "for"))
        self.assertFalse(_matches_keyword("telecom community", "com"))

    def test_external_url_auto_match_does_not_inject_deliverables(self):
        """验证 auto_match_only 模式下，针对外部 URL 或仓库的提问绝不误撞注入本地历史成果产物"""
        import dsh_modules.config as cfg
        ws_tmp = tempfile.mkdtemp()
        orig_ws = getattr(cfg, "WORKSPACE_DIR", "/workspace")
        cfg.WORKSPACE_DIR = ws_tmp

        try:
            # 模拟一个内容包含大量 github, for, use, 风险 等技术词汇的历史产出成果
            deliv_dir = Path(ws_tmp) / "deliverables" / "20261104_阿里AI开发新范式"
            deliv_dir.mkdir(parents=True)
            doc_file = deliv_dir / "阿里-AI开发-新范式.md"
            doc_file.write_text(
                "---\ntitle: '阿里-AI开发-新范式'\ntags: ['AI架构', '范式', '工程演化']\n---\n"
                "本文介绍了 AI Agent 的发展与风险评估。详情参见 https://github.com/alibaba/harness 项目。\n"
                "Computer use is a powerful paradigm for agents.\n",
                encoding="utf-8"
            )

            # 用户提问纯外部仓库 URL，且未带个人空间修饰
            res1 = scan_personal_knowledge(
                prompt="查看和风险这个文章的内容 https://github.com/vercel-labs/agent-desktop/",
                auto_match_only=True
            )
            self.assertEqual(res1, "")
            self.assertEqual(len(get_last_scanned_knowledge_files()), 0)

            res2 = scan_personal_knowledge(
                prompt="查看和分析 GitHub - vercel-labs/agent-desktop: Computer use CLI for AI agents · GitHub",
                auto_match_only=True
            )
            self.assertEqual(res2, "")
            self.assertEqual(len(get_last_scanned_knowledge_files()), 0)
        finally:
            cfg.WORKSPACE_DIR = orig_ws
            shutil.rmtree(ws_tmp, ignore_errors=True)

    def test_skill_router_external_url_and_repo_search_intent(self):
        """验证 SkillRouter 对外部 URL 与 GitHub 仓库的提问准确激活 is_search_intent"""
        from dsh_modules.skill_router import SkillRouter

        res1 = SkillRouter.route("查看和风险这个文章的内容 https://github.com/vercel-labs/agent-desktop/")
        self.assertTrue(res1.is_search_intent)

        res2 = SkillRouter.route("查看和分析 GitHub - vercel-labs/agent-desktop: Computer use CLI for AI agents · GitHub")
        self.assertTrue(res2.is_search_intent)


if __name__ == "__main__":
    unittest.main()
