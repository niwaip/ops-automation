"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStandardServiceUrl = exports.getPublicHost = exports.readConfiguredUrl = exports.isContainerRuntime = exports.sanitizeHost = exports.stripWrappingQuotes = exports.trimTrailingSlash = void 0;
const trimTrailingSlash = (value) => value.replace(/\/+$/, '');
exports.trimTrailingSlash = trimTrailingSlash;
const stripWrappingQuotes = (value) => {
    let normalized = value.trim();
    while (normalized.length >= 2 &&
        ((normalized.startsWith('"') && normalized.endsWith('"')) ||
            (normalized.startsWith("'") && normalized.endsWith("'")) ||
            (normalized.startsWith('`') && normalized.endsWith('`')))) {
        normalized = normalized.slice(1, -1).trim();
    }
    return normalized;
};
exports.stripWrappingQuotes = stripWrappingQuotes;
const sanitizeHost = (value) => {
    if (!value)
        return undefined;
    const stripped = (0, exports.stripWrappingQuotes)(value)
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')
        .trim();
    return stripped && stripped !== '0.0.0.0' ? stripped : undefined;
};
exports.sanitizeHost = sanitizeHost;
const isContainerRuntime = () => process.env.DOCKER_ENV === 'true' || process.env.NODE_ENV === 'production';
exports.isContainerRuntime = isContainerRuntime;
const readConfiguredUrl = (...candidates) => {
    const configured = candidates.find((value) => typeof value === 'string' && value.trim());
    if (!configured) {
        return undefined;
    }
    const normalized = (0, exports.trimTrailingSlash)((0, exports.stripWrappingQuotes)(configured));
    return normalized || undefined;
};
exports.readConfiguredUrl = readConfiguredUrl;
const getPublicHost = () => (0, exports.sanitizeHost)(process.env.HOST_IP) ||
    (0, exports.sanitizeHost)(process.env.EXTERNAL_HOST) ||
    'localhost';
exports.getPublicHost = getPublicHost;
const getStandardServiceUrl = (envUrlVar, containerHost, port, fallbackEnvVars = []) => {
    const allEnvVars = [envUrlVar, ...fallbackEnvVars];
    const configured = (0, exports.readConfiguredUrl)(...allEnvVars.map((v) => process.env[v]));
    if (configured) {
        return configured;
    }
    return (0, exports.isContainerRuntime)()
        ? `http://${containerHost}:${port}`
        : `http://localhost:${port}`;
};
exports.getStandardServiceUrl = getStandardServiceUrl;
//# sourceMappingURL=service-endpoints.js.map