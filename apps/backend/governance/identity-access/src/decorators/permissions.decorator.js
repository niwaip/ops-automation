"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequireAdmin = exports.RequirePermissions = exports.SkipRbac = exports.Public = void 0;
const common_1 = require("@nestjs/common");
const authz_constants_1 = require("../metadata/authz.constants");
const Public = () => (0, common_1.SetMetadata)(authz_constants_1.IS_PUBLIC_KEY, true);
exports.Public = Public;
const SkipRbac = () => (0, common_1.SetMetadata)(authz_constants_1.SKIP_RBAC_KEY, true);
exports.SkipRbac = SkipRbac;
const RequirePermissions = (...permissions) => (0, common_1.SetMetadata)(authz_constants_1.REQUIRED_PERMISSIONS_KEY, permissions);
exports.RequirePermissions = RequirePermissions;
const RequireAdmin = () => (0, common_1.SetMetadata)(authz_constants_1.REQUIRED_PERMISSIONS_KEY, ['*']);
exports.RequireAdmin = RequireAdmin;
//# sourceMappingURL=permissions.decorator.js.map