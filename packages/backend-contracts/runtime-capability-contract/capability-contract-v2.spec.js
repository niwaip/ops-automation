"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
describe('CapabilityContractV2 & JsonSchemaValidator', () => {
    describe('computeContractDigest', () => {
        it('should generate a deterministic sha256 digest ignoring metadata.contractDigest', () => {
            const contract1 = {
                apiVersion: 'ops-automation/v2',
                kind: 'Capability',
                metadata: {
                    id: 'web-search',
                    version: '2.1.0',
                    sourceType: 'published_skill',
                },
                contracts: {
                    input: {
                        schema: {
                            type: 'object',
                            required: ['query'],
                            properties: { query: { type: 'string' } },
                        },
                    },
                    output: {
                        dataPath: '$.result.businessData',
                        schema: {
                            type: 'object',
                            required: ['searchResults', 'responseMetadata'],
                            properties: {
                                searchResults: { type: 'array' },
                                responseMetadata: { type: 'object' },
                            },
                        },
                    },
                },
                runtime: {
                    type: 'temporal',
                    workflowType: 'WebSearchWorkflow',
                },
            };
            const digest1 = (0, index_1.computeContractDigest)(contract1);
            expect(digest1).toMatch(/^sha256:[a-f0-9]{64}$/);
            // Digest remains identical when metadata.contractDigest is set
            const contract2 = {
                ...contract1,
                metadata: {
                    ...contract1.metadata,
                    contractDigest: digest1,
                },
            };
            const digest2 = (0, index_1.computeContractDigest)(contract2);
            expect(digest2).toBe(digest1);
        });
    });
    describe('jsonSchemaValidator', () => {
        const searchOutputSchema = {
            type: 'object',
            required: ['searchResults', 'responseMetadata'],
            properties: {
                searchResults: { type: 'array' },
                responseMetadata: { type: 'object' },
            },
        };
        it('should successfully validate valid output data', () => {
            const validData = {
                searchResults: [{ title: 'News 1' }],
                responseMetadata: { total: 1 },
            };
            const res = index_1.jsonSchemaValidator.validate(validData, searchOutputSchema);
            expect(res.valid).toBe(true);
        });
        it('should reject invalid output data missing responseMetadata (Web Search regression test)', () => {
            const invalidData = {
                searchResults: [{ title: 'News 1' }],
            };
            const res = index_1.jsonSchemaValidator.validate(invalidData, searchOutputSchema);
            expect(res.valid).toBe(false);
            expect(res.errors?.some(e => e.message.includes('responseMetadata'))).toBe(true);
        });
        it('should extract nested data using JSON Path', () => {
            const envelope = {
                result: {
                    businessData: {
                        searchResults: ['a', 'b'],
                        responseMetadata: { count: 2 },
                    },
                },
            };
            const extracted = index_1.jsonSchemaValidator.extractDataByPath(envelope, '$.result.businessData');
            expect(extracted).toEqual({
                searchResults: ['a', 'b'],
                responseMetadata: { count: 2 },
            });
        });
    });
});
//# sourceMappingURL=capability-contract-v2.spec.js.map