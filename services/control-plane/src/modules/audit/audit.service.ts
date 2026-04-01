import { Injectable, Inject, Optional } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  resource: string;
  ip_address: string;
  timestamp: Date;
  details: Record<string, unknown>;
}

// Interface for audit log storage (can be replaced with database implementation)
export interface AuditLogStorage {
  save(log: AuditLog): Promise<void>;
  query(filters?: { user_id?: string; action?: string; resource?: string }): Promise<AuditLog[]>;
}

// In-memory storage implementation (for development/testing)
@Injectable()
export class InMemoryAuditStorage implements AuditLogStorage {
  private logs: AuditLog[] = [];

  async save(log: AuditLog): Promise<void> {
    this.logs.push(log);
  }

  async query(filters?: { user_id?: string; action?: string; resource?: string }): Promise<AuditLog[]> {
    let result = this.logs;

    if (filters?.user_id) {
      result = result.filter((log) => log.user_id === filters.user_id);
    }
    if (filters?.action) {
      result = result.filter((log) => log.action === filters.action);
    }
    if (filters?.resource) {
      result = result.filter((log) => log.resource === filters.resource);
    }

    return result;
  }

  // Method to clear logs (for testing)
  clear(): void {
    this.logs = [];
  }

  // Method to get all logs (for testing)
  getAll(): AuditLog[] {
    return this.logs;
  }
}

@Injectable()
export class AuditService {
  private storage: AuditLogStorage;

  constructor(@Optional() @Inject('AUDIT_STORAGE') storage?: AuditLogStorage) {
    this.storage = storage || new InMemoryAuditStorage();
  }

  async log(
    userId: string | undefined,
    action: string,
    resource: string,
    ipAddress: string,
    details: Record<string, unknown>,
  ): Promise<AuditLog> {
    const log: AuditLog = {
      id: uuidv4(),
      user_id: userId,
      action,
      resource,
      ip_address: ipAddress,
      timestamp: new Date(),
      details,
    };

    await this.storage.save(log);
    return log;
  }

  async queryLogs(filters?: {
    user_id?: string;
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
    return this.log(userId, `${method}:${path}`, path, ipAddress, {
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
    return this.log(userId, `auth:${event}`, 'auth', ipAddress, {
      success,
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