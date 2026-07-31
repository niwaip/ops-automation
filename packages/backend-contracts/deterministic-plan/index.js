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
exports.canonicalizePlan = canonicalizePlan;
exports.computePlanHash = computePlanHash;
const crypto = __importStar(require("crypto"));
/**
 * Stable canonical JSON representation of a plan draft for deterministic SHA-256 hashing.
 */
function canonicalizePlan(plan) {
    const sortedNodes = [...plan.nodes]
        .sort((a, b) => a.sequence - b.sequence)
        .map((node) => {
        const canonicalNode = {
            nodeId: node.nodeId,
            sequence: node.sequence,
            kind: node.kind,
            title: node.title,
            dependsOn: [...node.dependsOn].sort(),
            inputBindings: sortObjectKeys(node.inputBindings),
            outputContract: sortObjectKeys(node.outputContract),
            failurePolicy: node.failurePolicy,
        };
        if (node.kind === 'skill') {
            canonicalNode.skillId = node.skillId;
            canonicalNode.skillVersion = node.skillVersion;
            canonicalNode.runtimeType = node.runtimeType;
            if (node.executionRuntimeType)
                canonicalNode.executionRuntimeType = node.executionRuntimeType;
            if (node.retryPolicyId)
                canonicalNode.retryPolicyId = node.retryPolicyId;
        }
        else if (node.kind === 'llm_operation') {
            canonicalNode.operationId = node.operationId;
            canonicalNode.promptTemplateId = node.promptTemplateId;
            canonicalNode.promptTemplateVersion = node.promptTemplateVersion;
            canonicalNode.modelPolicyId = node.modelPolicyId;
            canonicalNode.temperature = node.temperature;
            canonicalNode.maxInputTokens = node.maxInputTokens;
            canonicalNode.maxOutputTokens = node.maxOutputTokens;
        }
        return canonicalNode;
    });
    const sortedFinalOutputs = [...plan.finalOutputs]
        .sort((a, b) => `${a.fromNodeId}:${a.targetField}`.localeCompare(`${b.fromNodeId}:${b.targetField}`))
        .map((fo) => sortObjectKeys(fo));
    return {
        schemaVersion: plan.schemaVersion,
        planType: plan.planType,
        objective: plan.objective.trim(),
        nodes: sortedNodes,
        finalOutputs: sortedFinalOutputs,
    };
}
function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    }
    const sortedObj = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
        sortedObj[key] = sortObjectKeys(obj[key]);
    }
    return sortedObj;
}
function computePlanHash(plan) {
    const canonical = canonicalizePlan(plan);
    const jsonStr = JSON.stringify(canonical);
    return crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
}
//# sourceMappingURL=index.js.map