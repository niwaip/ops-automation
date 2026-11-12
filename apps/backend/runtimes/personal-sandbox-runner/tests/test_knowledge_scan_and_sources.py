"""Canonical personal-space retrieval and citation regressions."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

src_dir = Path(__file__).resolve().parent.parent / 'src'
sys.path.insert(0, str(src_dir))
from dsh_modules.personal_knowledge_search import scan_personal_knowledge, get_last_scanned_knowledge_files, read_personal_knowledge
from dsh_modules.response_sources import (extract_search_sources, format_retrieval_sources_footer,
    append_retrieval_sources_footer, is_file_negated_in_text, KNOWLEDGE_CITATION_THRESHOLD)


class KnowledgeScanAndSourcesTests(unittest.TestCase):
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

    def test_skill_router_external_url_and_repo_search_intent(self):
        """验证 SkillRouter 对外部 URL 与 GitHub 仓库的提问准确激活 is_search_intent"""
        from dsh_modules.skill_router import SkillRouter

        res1 = SkillRouter.route("查看和风险这个文章的内容 https://github.com/vercel-labs/agent-desktop/")
        self.assertTrue(res1.is_search_intent)

        res2 = SkillRouter.route("查看和分析 GitHub - vercel-labs/agent-desktop: Computer use CLI for AI agents · GitHub")
        self.assertTrue(res2.is_search_intent)

    def test_reads_authoritative_documents_without_enumerating_local_copies(self):
        doc = {'id': 'doc-1', 'workspaceId': 'ws-1', 'name': 'AI网关资料.md', 'content': '最新资料正文',
               'tags': ['AI网关'], 'path': 'personal-knowledge://ws-1/doc-1',
               'url': '/workspaces?fileId=doc-1', 'score': 500, 'contentSha256': 'current-hash'}
        with patch('dsh_modules.personal_knowledge_search._request', return_value={
                'source': 'personal_workspace', 'documents': [doc], 'matchedCount': 1}) as request, \
             patch.object(Path, 'glob', side_effect=AssertionError('local mirror scanned')):
            result = scan_personal_knowledge('关于ai网关呢', auto_match_only=True)
        self.assertIn('最新资料正文', result)
        self.assertIn('AI网关', result)
        request.assert_called_once_with('search', {'query': '关于ai网关呢', 'browse': False})
        self.assertEqual(get_last_scanned_knowledge_files()[0]['contentSha256'], 'current-hash')

    def test_failure_and_empty_search_never_reuse_previous_results(self):
        with patch('dsh_modules.personal_knowledge_search._request', side_effect=OSError('offline')), \
             patch.object(Path, 'glob', side_effect=AssertionError('stale fallback')):
            self.assertEqual(scan_personal_knowledge('AI网关', auto_match_only=True), '')
            self.assertIn('尚未完成检索', scan_personal_knowledge('AI网关'))
        self.assertEqual(get_last_scanned_knowledge_files(), [])
        with patch('dsh_modules.personal_knowledge_search._request', return_value={
                'source': 'personal_workspace', 'documents': [], 'matchedCount': 0}):
            self.assertEqual(scan_personal_knowledge('AI网关', auto_match_only=True), '')
        self.assertEqual(get_last_scanned_knowledge_files(), [])

    def test_external_page_request_does_not_scan_personal_library(self):
        with patch('dsh_modules.personal_knowledge_search._request') as request:
            self.assertEqual(scan_personal_knowledge('分析 https://example.com/ai', auto_match_only=True), '')
        request.assert_not_called()

    def test_read_file_routes_canonical_ids_and_does_not_resolve_a_local_path(self):
        from dsh_modules.file_tools import read_workspace_file
        uri = 'personal-knowledge://11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222'
        with patch('dsh_modules.personal_knowledge_search._request', return_value={
                'name': 'AI网关资料.md', 'totalLines': 10, 'content': '2: 当前正文'}) as request, \
             patch('dsh_modules.file_tools.resolve_sandboxed_path', side_effect=AssertionError('local path')):
            result = read_workspace_file(uri, start_line=2, end_line=3)
        self.assertIn('当前正文', result)
        self.assertEqual(request.call_args.args[0], 'read')
        self.assertEqual(request.call_args.args[1]['startLine'], 2)
        self.assertIn('无效', read_personal_knowledge('personal-knowledge://../../etc/passwd'))

    def test_personal_source_links_open_the_same_workspace_node(self):
        footer = format_retrieval_sources_footer([{'name': 'AI网关.md', 'url': '/workspaces?fileId=node-1',
            'source_category': 'personal_workspace', 'matched': True, 'score': 500}], [])
        self.assertIn('[AI网关.md](/workspaces?fileId=node-1)', footer)

    def test_search_telemetry_distinguishes_failure_from_zero_matches(self):
        with patch('dsh_modules.personal_knowledge_search._record') as record, \
             patch('dsh_modules.personal_knowledge_search._request', side_effect=OSError('offline')):
            scan_personal_knowledge('AI网关', auto_match_only=True)
        self.assertEqual(record.call_args.args[0], 'failed')
        with patch('dsh_modules.personal_knowledge_search._record') as record, \
             patch('dsh_modules.personal_knowledge_search._request', return_value={
                 'source': 'personal_workspace', 'documents': [], 'matchedCount': 0}):
            scan_personal_knowledge('AI网关', auto_match_only=True)
        self.assertEqual(record.call_args.args[0], 'no_match')


if __name__ == "__main__":
    unittest.main()
