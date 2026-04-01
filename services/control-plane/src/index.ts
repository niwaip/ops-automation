/**
 * Control Plane Service - API Gateway
 *
 * This service is the central orchestration controller for the Browser Control Plane.
 * It provides unified API routing to all backend services.
 */

export { AppModule } from './app.module';
export { ProxyModule } from './modules/proxy/proxy.module';
export { ProxyController } from './modules/proxy/proxy.controller';
export { ProxyService } from './modules/proxy/proxy.service';
export { AuthMiddleware, AuthenticatedRequest } from './modules/auth/auth.middleware';
export { AuditModule } from './modules/audit/audit.module';
export { AuditService, AuditLog, AuditLogStorage, InMemoryAuditStorage } from './modules/audit/audit.service';

export const SERVICE_NAME = 'control-plane';