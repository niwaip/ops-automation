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
});
//# sourceMappingURL=planning-contract.spec.js.map