"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const planning_contract_1 = require("./planning-contract");
describe('planning capability contract', () => {
    it('matches an explicitly mentioned capability id', () => {
        const match = (0, planning_contract_1.matchDeterministicRoutingCapability)('请使用 platform.document.pdf-create 生成一个 PDF', [
            {
                id: 'platform.document.pdf-create',
                name: '创建 PDF 文档',
                triggerKeywords: ['生成PDF'],
            },
            {
                id: 'platform.document.pdf-merge',
                name: '合并 PDF 文档',
                triggerKeywords: ['合并PDF'],
            },
        ]);
        expect(match?.capability.id).toBe('platform.document.pdf-create');
        expect(match?.matchedSignals).toContain('platform.document.pdf-create');
    });
    it('derives a distinctive subject signal from a capability action name', () => {
        const match = (0, planning_contract_1.matchDeterministicRoutingCapability)('上海的天气', [
            { id: 'weather', name: '天气查询', triggerKeywords: ['HTTP 请求'] },
            { id: 'report', name: '报表查询', triggerKeywords: ['查询报表'] },
        ]);
        expect(match).toEqual(expect.objectContaining({
            capability: expect.objectContaining({ id: 'weather' }),
            reason: 'deterministic_routing_signal',
        }));
    });
    it('rejects ambiguous deterministic signals', () => {
        expect((0, planning_contract_1.matchDeterministicRoutingCapability)('执行查询', [
            { id: 'one', name: '能力一', aliases: ['查询'] },
            { id: 'two', name: '能力二', aliases: ['查询'] },
        ])).toBeNull();
    });
    it('uses a distinctive phrase segment from a legacy compound capability name', () => {
        const match = (0, planning_contract_1.matchDeterministicRoutingCapability)('打开网页', [
            {
                id: 'browser-summary',
                name: '打开网页 总结信息',
                triggerKeywords: ['打开网页 总结信息'],
            },
        ]);
        expect(match?.capability.id).toBe('browser-summary');
        expect(match?.reason).toBe('deterministic_routing_signal');
    });
    it('canonicalizes localized enum aliases without domain-specific code', () => {
        expect((0, planning_contract_1.resolveDeterministicEnumParams)('上海的天气', {
            location: {
                enum: ['Shanghai', 'Beijing'],
                'x-enum-aliases': {
                    Shanghai: ['上海', '上海市'],
                    Beijing: ['北京', '北京市'],
                },
            },
        }).params).toEqual({ location: 'Shanghai' });
    });
    it('does not allow generic action verbs like 查看 to hijack unrelated requests', () => {
        const emailCapability = {
            id: 'platform.email.messages',
            name: '内置邮件读取与搜索',
            aliases: ['查看 邮件', '读取 邮件'],
            triggerKeywords: ['查邮件', '读邮件', '查看邮件', '搜索邮件'],
        };
        const docExtractorCapability = {
            id: 'platform.document.pdf-content-extractor',
            name: '内置文档内容提取',
            triggerKeywords: ['提取文档内容', '查看合同内容', '读取文档'],
        };
        // '查看合同内容' should NEVER match email skill even if email had aliases with '查看'
        const emailMatch = (0, planning_contract_1.matchDeterministicRoutingCapability)('查看合同内容', [emailCapability]);
        expect(emailMatch).toBeNull();
        // '查看合同内容' should match document extractor capability
        const docMatch = (0, planning_contract_1.matchDeterministicRoutingCapability)('查看合同内容', [
            emailCapability,
            docExtractorCapability,
        ]);
        expect(docMatch?.capability.id).toBe('platform.document.pdf-content-extractor');
    });
    it('gates physical file generation skills when user prompt is an inspection query', () => {
        const mdWriterCapability = {
            id: 'platform.document.markdown-artifact-writer',
            name: '内置 Markdown 文件生成',
            category: 'artifact',
            aliases: ['文件生成', 'Markdown文件生成', '生成md文件'],
            triggerKeywords: ['生成md文件', '输出Markdown文件', '保存Markdown', '生成Markdown', '输出md文件'],
        };
        const workspaceSearchCapability = {
            id: 'platform.workspace.explorer',
            name: '内置工作空间文档探索',
            category: 'search',
            triggerKeywords: ['工作空间探索', '查看工作空间文件'],
        };
        // '查询关于ai能力测试的文件' is an inspection request without generate verbs;
        // it MUST NOT match markdown-artifact-writer even if its alias has '文件生成'
        const match = (0, planning_contract_1.matchDeterministicRoutingCapability)('查询关于ai能力测试的文件', [
            mdWriterCapability,
            workspaceSearchCapability,
        ]);
        expect(match?.capability.id).not.toBe('platform.document.markdown-artifact-writer');
        expect(match).toBeNull();
    });
    it('matches physical file generation skills when user explicitly requests file generation', () => {
        const mdWriterCapability = {
            id: 'platform.document.markdown-artifact-writer',
            name: '内置 Markdown 文件生成',
            category: 'artifact',
            aliases: ['文件生成', 'Markdown文件生成', '生成md文件'],
            triggerKeywords: ['生成md文件', '输出Markdown文件', '保存Markdown', '生成Markdown', '输出md文件'],
        };
        const match = (0, planning_contract_1.matchDeterministicRoutingCapability)('请生成Markdown文件', [mdWriterCapability]);
        expect(match?.capability.id).toBe('platform.document.markdown-artifact-writer');
    });
});
//# sourceMappingURL=planning-contract.spec.js.map