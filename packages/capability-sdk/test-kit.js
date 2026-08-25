"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCapabilityFixtures = runCapabilityFixtures;
const ajv_1 = __importDefault(require("ajv"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
const manifest_1 = require("./manifest");
function runCapabilityFixtures(manifest, fixtures) {
    const ajv = new ajv_1.default({ allErrors: true, strict: false });
    (0, ajv_formats_1.default)(ajv);
    const inputValidator = ajv.compile(manifest.contract.contracts.input.schema);
    const outputValidator = ajv.compile(manifest.contract.contracts.output.schema);
    const failures = [];
    for (const fixture of fixtures) {
        verify('input', fixture.input, fixture.expectInputValid ?? true, inputValidator);
        if (fixture.output !== undefined) {
            verify('output', fixture.output, fixture.expectOutputValid ?? true, outputValidator);
        }
        function verify(phase, value, expected, validator) {
            const actual = Boolean(validator(value));
            if (actual !== expected) {
                failures.push({
                    fixture: fixture.name,
                    phase,
                    errors: (validator.errors || []).map((error) => `${error.instancePath} ${error.message}`),
                });
            }
        }
    }
    return { manifest: (0, manifest_1.validateCapabilityPackManifest)(manifest), failures };
}
//# sourceMappingURL=test-kit.js.map