"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalizeValue = canonicalizeValue;
exports.computeContractDigest = computeContractDigest;
const crypto = __importStar(require("crypto"));
/**
 * Sort object keys recursively for canonical JSON stringification.
 */
function canonicalizeValue(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(canonicalizeValue);
    }
    const sorted = {};
    const keys = Object.keys(obj).sort();
    for (const k of keys) {
        sorted[k] = canonicalizeValue(obj[k]);
    }
    return sorted;
}
/**
 * Compute SHA-256 digest of a normalized CapabilityContractV2.
 * Excludes metadata.contractDigest from calculation to avoid self-reference recursion.
 */
function computeContractDigest(contract) {
    const canonicalObj = {
        apiVersion: contract.apiVersion || 'ops-automation/v2',
        kind: contract.kind || 'Capability',
        metadata: {
            id: contract.metadata.id,
            version: contract.metadata.version,
            sourceType: contract.metadata.sourceType,
        },
        contracts: canonicalizeValue(contract.contracts),
    };
    const jsonStr = JSON.stringify(canonicalObj);
    const hash = crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
    return `sha256:${hash}`;
}
//# sourceMappingURL=capability-contract-v2.js.map