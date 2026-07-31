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
exports.canonicalizeObject = canonicalizeObject;
exports.computeCanonicalDigest = computeCanonicalDigest;
const crypto = __importStar(require("crypto"));
/**
 * Recursively sort object keys for deterministic canonical JSON representation.
 */
function canonicalizeObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(canonicalizeObject);
    }
    const sorted = {};
    const keys = Object.keys(obj).sort();
    for (const k of keys) {
        sorted[k] = canonicalizeObject(obj[k]);
    }
    return sorted;
}
/**
 * Compute canonical SHA-256 digest of a BuiltinSkillManifest.
 */
function computeCanonicalDigest(manifest) {
    const canonicalObj = canonicalizeObject(manifest);
    const jsonStr = JSON.stringify(canonicalObj);
    const hash = crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
    return `sha256:${hash}`;
}
//# sourceMappingURL=index.js.map