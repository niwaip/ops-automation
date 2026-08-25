"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertUniqueRuntimeRoutes = assertUniqueRuntimeRoutes;
function assertUniqueRuntimeRoutes(adapters) {
    const seen = new Set();
    for (const adapter of adapters) {
        if (seen.has(adapter.routeKey))
            throw new Error(`Duplicate runtime route: ${adapter.routeKey}`);
        seen.add(adapter.routeKey);
    }
}
//# sourceMappingURL=runtime-adapter.js.map