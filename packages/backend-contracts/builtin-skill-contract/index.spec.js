"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
describe('canonicalizeObject & computeCanonicalDigest', () => {
    const baseManifest = {
        apiVersion: 'platform.ops/v1alpha1',
        kind: 'BuiltinWorkflowSkill',
        metadata: {
            key: 'platform.document.markdown-artifact-writer',
            displayName: 'Markdown Writer',
            owner: 'platform',
        },
        spec: {
            definitionVersion: '1.0.0',
            lifecycle: 'stable',
            defaultAccess: { mode: 'authenticated' },
            contracts: {
                input: { schema: { type: 'object', properties: { content: { type: 'string' } } } },
                output: { schema: { type: 'object' } },
            },
            runtime: {
                adapterRoute: 'builtin:workflow',
                handlerKey: 'document.markdown-artifact-writer',
            },
        },
    };
    it('should produce identical sha256 digest regardless of object key insertion order', () => {
        const manifestA = JSON.parse(JSON.stringify(baseManifest));
        const manifestB = {
            spec: {
                runtime: {
                    handlerKey: 'document.markdown-artifact-writer',
                    adapterRoute: 'builtin:workflow',
                },
                contracts: baseManifest.spec.contracts,
                defaultAccess: { mode: 'authenticated' },
                lifecycle: 'stable',
                definitionVersion: '1.0.0',
            },
            metadata: {
                owner: 'platform',
                displayName: 'Markdown Writer',
                key: 'platform.document.markdown-artifact-writer',
            },
            kind: 'BuiltinWorkflowSkill',
            apiVersion: 'platform.ops/v1alpha1',
        };
        const digestA = (0, index_1.computeCanonicalDigest)(manifestA);
        const digestB = (0, index_1.computeCanonicalDigest)(manifestB);
        expect(digestA).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(digestA).toBe(digestB);
    });
    it('should produce DIFFERENT digest when nested fields in spec or contracts change', () => {
        const digestOriginal = (0, index_1.computeCanonicalDigest)(baseManifest);
        // 1. Change nested definitionVersion
        const manifestChangedVer = JSON.parse(JSON.stringify(baseManifest));
        manifestChangedVer.spec.definitionVersion = '1.0.1';
        const digestVer = (0, index_1.computeCanonicalDigest)(manifestChangedVer);
        // 2. Change nested handlerKey
        const manifestChangedHandler = JSON.parse(JSON.stringify(baseManifest));
        manifestChangedHandler.spec.runtime.handlerKey = 'document.new-writer-key';
        const digestHandler = (0, index_1.computeCanonicalDigest)(manifestChangedHandler);
        // 3. Change nested schema
        const manifestChangedSchema = JSON.parse(JSON.stringify(baseManifest));
        manifestChangedSchema.spec.contracts.input.schema.properties.content.type = 'number';
        const digestSchema = (0, index_1.computeCanonicalDigest)(manifestChangedSchema);
        expect(digestVer).not.toBe(digestOriginal);
        expect(digestHandler).not.toBe(digestOriginal);
        expect(digestSchema).not.toBe(digestOriginal);
    });
});
//# sourceMappingURL=index.spec.js.map