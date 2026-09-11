import { Injectable, Logger } from '@nestjs/common';
import { createDecipheriv, createHash } from 'crypto';
import { validate as isUuid } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RuntimeCredentialResolverService {
  private readonly logger = new Logger(RuntimeCredentialResolverService.name);
  private readonly key: Buffer;

  constructor(private readonly prisma: PrismaService) {
    this.key = this.loadKey();
  }

  /**
   * JIT decrypts credential references and auto-injects bound credentials
   * for the digital employee right before invoking the worker.
   */
  async resolveInputForRuntime(
    userId: string | undefined,
    skillId: string | undefined,
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!input || typeof input !== 'object') {
      return input || {};
    }

    const resolved: Record<string, unknown> = { ...input };
    if (!userId) {
      return resolved;
    }

    // 1. Resolve explicit credential references: { source: 'credential_ref', credentialId: '...' }
    for (const [key, val] of Object.entries(resolved)) {
      if (val && typeof val === 'object') {
        const rec = val as Record<string, unknown>;
        const credId = (rec.credentialId || rec.credentialRef) as string | undefined;
        if ((rec.source === 'credential_ref' || rec.source === 'secret_ref') && credId) {
          try {
            const payload = await this.getDecryptedCredentialPayload(userId, credId);
            const prop = (rec.propertyPath || rec.field || key) as string;
            let valResolved = payload[prop];
            if (valResolved === undefined) {
              if (
                key.toLowerCase().includes('pass') ||
                key.toLowerCase().includes('credential') ||
                key.toLowerCase().includes('secret')
              ) {
                valResolved = payload.password || payload.token || payload.key || payload.deviceKey;
              } else if (
                key.toLowerCase().includes('user') ||
                key.toLowerCase().includes('account')
              ) {
                valResolved = payload.username || payload.user || payload.account;
              } else {
                valResolved = payload[key] ?? payload;
              }
            }
            resolved[key] = valResolved !== undefined ? valResolved : payload;

            const usernameVal = payload.username || payload.user || payload.account;
            if (usernameVal !== undefined) {
              if (isMissingOrPlaceholder(resolved.username)) resolved.username = usernameVal;
              if (isMissingOrPlaceholder(resolved.userName)) resolved.userName = usernameVal;
              if (isMissingOrPlaceholder(resolved.user)) resolved.user = usernameVal;
              if (isMissingOrPlaceholder(resolved.account)) resolved.account = usernameVal;
            }
            const passwordVal = payload.password || payload.passwd;
            if (passwordVal !== undefined) {
              if (isMissingOrPlaceholder(resolved.password)) resolved.password = passwordVal;
              if (isMissingOrPlaceholder(resolved.loginCredential)) resolved.loginCredential = passwordVal;
              if (isMissingOrPlaceholder(resolved.passwd)) resolved.passwd = passwordVal;
            }
          } catch (err: any) {
            this.logger.error(`Failed to resolve credential ref for param [${key}]: ${err.message}`);
            throw new Error(`Runtime credential resolution failed for parameter [${key}]`);
          }
        }
      }
    }

    // 2. Auto-inject default credentials if bound for this digital employee
    if (skillId) {
      try {
        const skillIsUuid = Boolean(isUuid(skillId));
        let skill: any = null;

        try {
          const skillWhere = skillIsUuid
            ? { OR: [{ id: skillId }, { name: skillId }] }
            : { name: skillId };
          skill = await (this.prisma as any).skillConfig?.findFirst({
            where: skillWhere,
            select: { id: true, paramsSchema: true },
          });
        } catch (err: any) {
          this.logger.warn(`Failed to query skillConfig for skill [${skillId}]: ${err.message}`);
        }

        if (!skill) {
          try {
            skill = await (this.prisma as any).builtinSkill?.findFirst({
              where: skillIsUuid
                ? { OR: [{ id: skillId }, { capabilityKey: skillId }] }
                : { capabilityKey: skillId },
              select: { id: true, paramsSchema: true },
            });
          } catch (err: any) {
            this.logger.warn(`Failed to query builtinSkill for skill [${skillId}]: ${err.message}`);
          }
        }

        const effectiveSkillUuid = skillIsUuid
          ? skillId
          : skill?.id && isUuid(skill.id)
            ? skill.id
            : null;

        const schema =
          skill?.paramsSchema && typeof skill.paramsSchema === 'object'
            ? (skill.paramsSchema as Record<string, unknown>)
            : {};
        const properties =
          schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
            ? (schema.properties as Record<string, unknown>)
            : {};
        const hasSchemaProperties = Object.keys(properties).length > 0;

        if (effectiveSkillUuid && userId) {
          const bindings = await (this.prisma as any).userSkillCredentialBinding?.findMany({
            where: { userId, skillId: effectiveSkillUuid },
            include: { credential: true },
          });

          if (Array.isArray(bindings)) {
            for (const b of bindings) {
              const currentVal = resolved[b.paramName];
              const isMissing = isMissingOrPlaceholder(currentVal);
              const isBasicAuth = b.credential?.category === 'basic_auth';
              const needsCompanionUsername =
                isBasicAuth &&
                (isMissingOrPlaceholder(resolved.username) ||
                  (hasSchemaProperties &&
                    Object.keys(properties).some(
                      (p) =>
                        (p.toLowerCase().includes('user') || p.toLowerCase().includes('account')) &&
                        !p.toLowerCase().includes('pass') &&
                        isMissingOrPlaceholder(resolved[p])
                    )));

              if ((isMissing || needsCompanionUsername) && b.credential?.encryptedData) {
                try {
                  const payload = this.decryptPayload(b.credential.encryptedData);
                  let injectedVal = payload[b.paramName];

                  if (injectedVal === undefined) {
                    if (b.credential.category === 'device_key') {
                      injectedVal = payload.deviceKey || payload.key || payload.token;
                    } else if (b.credential.category === 'basic_auth') {
                      if (
                        b.paramName.toLowerCase().includes('pass') ||
                        b.paramName.toLowerCase().includes('credential') ||
                        b.paramName.toLowerCase().includes('secret')
                      ) {
                        injectedVal = payload.password;
                      } else if (
                        b.paramName.toLowerCase().includes('user') ||
                        b.paramName.toLowerCase().includes('account')
                      ) {
                        injectedVal = payload.username;
                      }
                    } else if (b.credential.category === 'api_key' || b.credential.category === 'bearer_token') {
                      injectedVal = payload.apiKey || payload.token || payload.key;
                    }
                  }

                  if (isMissing && injectedVal !== undefined) {
                    resolved[b.paramName] = injectedVal;
                  }

                  const usernameVal = payload.username || payload.user || payload.account;
                  const passwordVal = payload.password || payload.passwd;

                  if (hasSchemaProperties) {
                    for (const propKey of Object.keys(properties)) {
                      const lowerProp = propKey.toLowerCase();
                      if (
                        usernameVal !== undefined &&
                        (lowerProp.includes('user') || lowerProp.includes('account')) &&
                        !lowerProp.includes('pass') &&
                        isMissingOrPlaceholder(resolved[propKey])
                      ) {
                        resolved[propKey] = usernameVal;
                      } else if (
                        passwordVal !== undefined &&
                        (lowerProp.includes('pass') || lowerProp.includes('credential') || lowerProp.includes('secret')) &&
                        isMissingOrPlaceholder(resolved[propKey])
                      ) {
                        resolved[propKey] = passwordVal;
                      }
                    }
                  } else {
                    if (usernameVal !== undefined && isMissingOrPlaceholder(resolved.username)) {
                      resolved.username = usernameVal;
                    }
                    if (passwordVal !== undefined && isMissingOrPlaceholder(resolved.password)) {
                      resolved.password = passwordVal;
                    }
                  }
                } catch (err: any) {
                  if (isMissing) {
                    this.logger.warn(`Failed to inject bound credential for [${b.paramName}]: ${err.message}`);
                    throw new Error(
                      `Runtime credential resolution failed for parameter [${b.paramName}]`
                    );
                  }
                }
              }
            }
          }
        }
        const missingCredentialFields = Object.entries(properties).flatMap(
          ([paramName, rawDefinition]) => {
            if (!this.isSensitiveParamName(paramName)) return [];
            const definition =
              rawDefinition && typeof rawDefinition === 'object' && !Array.isArray(rawDefinition)
                ? (rawDefinition as Record<string, unknown>)
                : {};
            const isSecret =
              definition.isSecret === true ||
              definition.format === 'password' ||
              Boolean(definition.credentialCategory) ||
              this.isSensitiveParamName(paramName);
            const hasUsableDefault =
              !isSecret &&
              definition.default !== undefined &&
              definition.default !== null &&
              definition.default !== '';
            const value = resolved[paramName];
            const isMissing = isMissingOrPlaceholder(value);
            return !hasUsableDefault && isMissing ? [paramName] : [];
          }
        );
        if (missingCredentialFields.length > 0) {
          throw new Error(
            `请先为当前 Skill 绑定用户凭证：${missingCredentialFields.join('、')}`
          );
        }
      } catch (err: any) {
        if (
          err.message?.includes('请先为当前 Skill 绑定用户凭证') ||
          err.message?.includes('Runtime credential resolution failed')
        ) {
          throw err;
        }
        this.logger.warn(`Error querying skill credential bindings: ${err.message}`);
      }
    }

    for (const [key, value] of Object.entries(resolved)) {
      if (
        typeof value === 'string' &&
        this.isSensitiveParamName(key) &&
        this.isMaskedPlaceholder(value)
      ) {
        throw new Error(
          `Runtime credential for parameter [${key}] is still masked; bind an active credential before execution`
        );
      }
    }

    return resolved;
  }

  /**
   * Sanitizes input for long-term database storage (executions.input_json).
   * Masks any raw cleartext secrets while preserving credential_ref metadata.
   */
  maskInputForStorage(input: Record<string, unknown>): Record<string, unknown> {
    if (!input || typeof input !== 'object') {
      return input;
    }

    const masked: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v && typeof v === 'object' && (v as any).source === 'credential_ref') {
        // Keep reference safe for future runs
        masked[k] = v;
      } else if (typeof v === 'string' && this.isSensitiveParamName(k)) {
        masked[k] = '••••••••';
      } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        masked[k] = this.maskInputForStorage(v as Record<string, unknown>);
      } else {
        masked[k] = v;
      }
    }
    return masked;
  }

  private isSensitiveParamName(name: string): boolean {
    const lower = name.toLowerCase();
    return (
      lower.includes('devicekey') ||
      lower.includes('device_key') ||
      lower.includes('password') ||
      lower.includes('passwd') ||
      lower.includes('secret') ||
      lower.includes('apikey') ||
      lower.includes('api_key') ||
      lower.includes('auth_token') ||
      lower.includes('credential') ||
      lower.includes('token')
    );
  }

  isMaskedPlaceholder(value: string): boolean {
    return isMaskedPlaceholder(value);
  }

  private async getDecryptedCredentialPayload(
    userId: string,
    credentialId: string
  ): Promise<Record<string, any>> {
    const cred = await (this.prisma as any).userCredential?.findFirst({
      where: { id: credentialId, userId, status: 'active' },
    });

    if (!cred || !cred.encryptedData) {
      throw new Error(`Credential [${credentialId}] not found or inactive`);
    }

    return this.decryptPayload(cred.encryptedData);
  }

  private decryptPayload(encryptedString: string): Record<string, any> {
    const [version, ivStr, tagStr, cipherStr] = encryptedString.split('.');
    if (version !== 'v1' || !ivStr || !tagStr || !cipherStr) {
      throw new Error('Invalid encrypted credential format');
    }

    const iv = Buffer.from(ivStr, 'base64');
    const tag = Buffer.from(tagStr, 'base64');
    const ciphertext = Buffer.from(cipherStr, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const decryptedJson = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');

    return JSON.parse(decryptedJson);
  }

  private loadKey(): Buffer {
    const raw = (
      process.env.USER_CREDENTIAL_ENCRYPTION_KEY ||
      process.env.BUILTIN_SKILL_CONFIG_ENCRYPTION_KEY ||
      process.env.IM_CHANNEL_ENCRYPTION_KEY
    )?.trim();

    const isProduction = process.env.NODE_ENV === 'production';
    const insecureFallbackKeys = new Set([
      'ops_dev_credential_vault_secret_2026',
      'ops_local_dev_jwt_secret_2026_06_02_8f4a6c9d7b1e53aa',
      'ops-automation-jwt-secret-key-change-in-production',
      'jwt_secret_key_change_in_production',
    ]);

    if (raw) {
      if (isProduction && insecureFallbackKeys.has(raw)) {
        this.logger.error('CRITICAL: Insecure USER_CREDENTIAL_ENCRYPTION_KEY configured in production!');
        throw new Error('FATAL: USER_CREDENTIAL_ENCRYPTION_KEY must be a secure key in production');
      }
      if (/^[0-9a-f]{64}$/i.test(raw)) {
        return Buffer.from(raw, 'hex');
      }
      try {
        const buf = Buffer.from(raw, 'base64');
        if (buf.length === 32) return buf;
      } catch {
        // fallthrough
      }
      if (raw.length >= 32) {
        return createHash('sha256').update(raw).digest();
      }
    }

    if (isProduction) {
      this.logger.error('CRITICAL: USER_CREDENTIAL_ENCRYPTION_KEY is required in production environment!');
      throw new Error('FATAL: USER_CREDENTIAL_ENCRYPTION_KEY must be set in production environment');
    }

    return createHash('sha256').update(process.env.JWT_SECRET || 'ops_dev_credential_vault_secret_2026').digest();
  }
}

export function isMaskedPlaceholder(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return (
    /^[\u2022\u25cf*•]+$/.test(normalized) ||
    normalized === '[redacted]' ||
    normalized === 'redacted' ||
    normalized === '[masked]' ||
    normalized === 'masked'
  );
}

export function isMissingOrPlaceholder(val: unknown): boolean {
  if (val === undefined || val === null) {
    return true;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return (
      trimmed === '' ||
      isMaskedPlaceholder(trimmed) ||
      /^\$\{[^}]+\}$/.test(trimmed) ||
      /^\{\{[^}]+\}\}$/.test(trimmed)
    );
  }
  return false;
}

