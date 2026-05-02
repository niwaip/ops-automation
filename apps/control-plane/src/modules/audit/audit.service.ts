import { Injectable, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  ipAddress?: string;
  statusCode?: number;
  durationMs?: number;
  requestBody?: Record<string, unknown>;
  responseBody?: Record<string, unknown>;
  createdAt: Date;
}

// Interface for audit log storage (can be replaced with database implementation)
export interface AuditLogStorage {
  save(log: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog>;
  query(filters?: { userId?: string; action?: string; resource?: string }): Promise<AuditLog[]>;
}

// In-memory storage implementation (for development/testing)
@Injectable()
export class InMemoryAuditStorage implements AuditLogStorage {
  private logs: AuditLog[] = [];

  async save(log: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog> {
    const auditLog: AuditLog = {
      id: `mem-${Date.now()}`,
      ...log,
      createdAt: new Date(),
    };
    this.logs.push(auditLog);
    return auditLog;
  }

  async query(filters?: { userId?: string; action?: string; resource?: string }): Promise<AuditLog[]> {
    let result = this.logs;

    if (filters?.userId) {
      result = result.filter((log) => log.userId === filters.userId);
    }
    if (filters?.action) {
      result = result.filter((log) => log.action === filters.action);
    }
    if (filters?.resource) {
      result = result.filter((log) => log.resource === filters.resource);
    }

    return result;
  }

  clear(): void {
    this.logs = [];
  }

  getAll(): AuditLog[] {
    return this.logs;
  }
}

// Prisma-based audit storage (production implementation)
@Injectable()
export class PrismaAuditStorage implements AuditLogStorage {
  constructor(private readonly prisma: PrismaService) {}

  async save(log: Omit<AuditLog, 'id' | 'createdAt'>): Promise<AuditLog> {
    const result = await this.prisma.auditLog.create({
      data: {
        userId: log.userId,
        action: log.action,
        resource: log.resource,
        ipAddress: log.ipAddress,
        statusCode: log.statusCode,
        durationMs: log.durationMs,
        requestBody: this.asJsonValue(log.requestBody),
        responseBody: this.asJsonValue(log.responseBody),
      },
    });

    return {
      id: result.id,
      userId: result.userId || undefined,
      action: result.action,
      resource: result.resource,
      ipAddress: result.ipAddress || undefined,
      statusCode: result.statusCode || undefined,
      durationMs: result.durationMs || undefined,
      requestBody: result.requestBody as Record<string, unknown> || undefined,
      responseBody: result.responseBody as Record<string, unknown> || undefined,
      createdAt: result.createdAt,
    };
  }

  async query(filters?: { userId?: string; action?: string; resource?: string }): Promise<AuditLog[]> {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters?.userId) {
      where.userId = filters.userId;
    }
    if (filters?.action) {
      where.action = filters.action;
    }
    if (filters?.resource) {
      where.resource = filters.resource;
    }

    const results = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    return results.map((r) => ({
      id: r.id,
      userId: r.userId || undefined,
      action: r.action,
      resource: r.resource,
      ipAddress: r.ipAddress || undefined,
      statusCode: r.statusCode || undefined,
      durationMs: r.durationMs || undefined,
      requestBody: r.requestBody as Record<string, unknown> || undefined,
      responseBody: r.responseBody as Record<string, unknown> || undefined,
      createdAt: r.createdAt,
    }));
  }

  private asJsonValue(value: unknown): Prisma.JsonValue {
    return value as Prisma.JsonValue;
  }
}

@Injectable()
export class AuditService {
  private storage: AuditLogStorage;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject('AUDIT_STORAGE') storage?: AuditLogStorage,
  ) {
    // Default to PrismaAuditStorage if PrismaService is available, otherwise fall back to InMemory
    this.storage = storage || new PrismaAuditStorage(prisma);
  }

  async log(
    userId: string | undefined,
    action: string,
    resource: string,
    ipAddress: string,
    details: Record<string, unknown>,
  ): Promise<AuditLog> {
    return this.storage.save({
      userId,
      action,
      resource,
      ipAddress,
      ...details,
    } as Omit<AuditLog, 'id' | 'createdAt'>);
  }

  async queryLogs(filters?: {
    userId?: string;
    action?: string;
    resource?: string;
  }): Promise<AuditLog[]> {
    return this.storage.query(filters);
  }

  // Log API call
  async logApiCall(
    userId: string | undefined,
    method: string,
    path: string,
    statusCode: number,
    ipAddress: string,
    durationMs: number,
    requestBody?: Record<string, unknown>,
    responseBody?: Record<string, unknown>,
  ): Promise<AuditLog> {
    return this.storage.save({
      userId,
      action: `${method}:${path}`,
      resource: path,
      ipAddress,
      statusCode,
      durationMs,
      requestBody: requestBody ? this.sanitizeBody(requestBody) : undefined,
      responseBody: responseBody ? this.sanitizeBody(responseBody) : undefined,
    });
  }

  // Log authentication event
  async logAuthEvent(
    userId: string | undefined,
    event: 'login' | 'logout' | 'refresh' | 'register',
    ipAddress: string,
    success: boolean,
    details?: Record<string, unknown>,
  ): Promise<AuditLog> {
    return this.storage.save({
      userId,
      action: `auth:${event}`,
      resource: 'auth',
      ipAddress,
      statusCode: success ? 200 : 401,
      ...details,
    });
  }

  // Sanitize sensitive data from body
  private sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...body };
    const sensitiveFields = ['password', 'passwordHash', 'token', 'accessToken', 'refreshToken', 'apiKey'];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
