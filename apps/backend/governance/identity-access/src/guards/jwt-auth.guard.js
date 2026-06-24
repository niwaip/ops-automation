"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const jwt_1 = require("@nestjs/jwt");
const authz_constants_1 = require("../metadata/authz.constants");
let JwtAuthGuard = class JwtAuthGuard {
    constructor(jwtService, reflector) {
        this.jwtService = jwtService;
        this.reflector = reflector;
    }
    async canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(authz_constants_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const debugUrl = process.env.DEBUG_SERVER_URL ||
            (process.env.DOCKER_ENV
                ? 'http://host.docker.internal:7777/event'
                : 'http://127.0.0.1:7777/event');
        const debugSessionId = process.env.DEBUG_SESSION_ID || 'draft-sessions-401';
        const internalSecret = process.env.INTERNAL_API_SHARED_SECRET || process.env.JWT_SECRET;
        const internalAuth = request.headers['x-internal-auth'];
        const internalUserId = request.headers['x-user-id'];
        const internalUserRole = request.headers['x-user-role'];
        const internalUsername = request.headers['x-user-name'];
        if (internalSecret &&
            typeof internalAuth === 'string' &&
            internalAuth === internalSecret &&
            typeof internalUserId === 'string' &&
            internalUserId.trim()) {
            request.user = {
                id: internalUserId,
                username: typeof internalUsername === 'string' && internalUsername.trim()
                    ? internalUsername
                    : internalUserId,
                role: typeof internalUserRole === 'string' && internalUserRole.trim()
                    ? internalUserRole
                    : 'employee',
                activeOrgId: null,
            };
            void fetch(debugUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: debugSessionId,
                    runId: 'pre-fix',
                    hypothesisId: 'A',
                    location: 'jwt-auth.guard.ts:40',
                    msg: '[DEBUG] internal auth accepted',
                    data: {
                        method: request.method,
                        url: request.url,
                        userId: internalUserId,
                        hasInternalAuth: true,
                    },
                    ts: Date.now(),
                }),
            }).catch(() => { });
            return true;
        }
        const authorization = request.headers.authorization;
        if (!authorization) {
            void fetch(debugUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: debugSessionId,
                    runId: 'pre-fix',
                    hypothesisId: 'A',
                    location: 'jwt-auth.guard.ts:58',
                    msg: '[DEBUG] authorization header missing',
                    data: {
                        method: request.method,
                        url: request.url,
                        hasAuthorization: false,
                        hasInternalAuth: typeof internalAuth === 'string' && internalAuth.length > 0,
                    },
                    ts: Date.now(),
                }),
            }).catch(() => { });
            throw new common_1.UnauthorizedException('Authorization header is required');
        }
        const token = authorization.replace('Bearer ', '');
        if (!token) {
            void fetch(debugUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: debugSessionId,
                    runId: 'pre-fix',
                    hypothesisId: 'A',
                    location: 'jwt-auth.guard.ts:65',
                    msg: '[DEBUG] bearer token empty after normalization',
                    data: {
                        method: request.method,
                        url: request.url,
                        authorizationPreview: String(authorization).slice(0, 20),
                    },
                    ts: Date.now(),
                }),
            }).catch(() => { });
            throw new common_1.UnauthorizedException('Token is required');
        }
        try {
            const payload = await this.jwtService.verifyAsync(token);
            request.user = {
                id: payload.sub,
                username: payload.username,
                role: payload.role,
                activeOrgId: payload.activeOrgId ?? null,
            };
            void fetch(debugUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: debugSessionId,
                    runId: 'pre-fix',
                    hypothesisId: 'A',
                    location: 'jwt-auth.guard.ts:81',
                    msg: '[DEBUG] jwt auth accepted',
                    data: {
                        method: request.method,
                        url: request.url,
                        userId: payload.sub,
                        role: payload.role,
                    },
                    ts: Date.now(),
                }),
            }).catch(() => { });
            return true;
        }
        catch {
            void fetch(debugUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: debugSessionId,
                    runId: 'pre-fix',
                    hypothesisId: 'A',
                    location: 'jwt-auth.guard.ts:85',
                    msg: '[DEBUG] jwt verification failed',
                    data: { method: request.method, url: request.url, tokenLength: token.length },
                    ts: Date.now(),
                }),
            }).catch(() => { });
            throw new common_1.UnauthorizedException('Invalid or expired token');
        }
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        core_1.Reflector])
], JwtAuthGuard);
//# sourceMappingURL=jwt-auth.guard.js.map