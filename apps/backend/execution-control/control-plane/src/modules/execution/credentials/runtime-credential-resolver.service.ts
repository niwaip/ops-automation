import { Injectable, Logger } from '@nestjs/common';
import { createDecipheriv, createHash } from 'crypto';
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
            resolved[key] = payload[prop] !== undefined ? payload[prop] : (payload[key] ?? payload);
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
        const bindings = await (this.prisma as any).userSkillCredentialBinding?.findMany({
          where: { userId, skillId },
          include: { credential: true },
        });

        if (Array.isArray(bindings)) {
          for (const b of bindings) {
            const currentVal = resolved[b.paramName];
            const isMissing =
              currentVal === undefined ||
              currentVal === null ||
              (typeof currentVal === 'string' &&
                (currentVal.trim() === '' || this.isMaskedPlaceholder(currentVal)));

            if (isMissing && b.credential?.encryptedData) {
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

                if (injectedVal !== undefined) {
                  resolved[b.paramName] = injectedVal;
                }
              } catch (err: any) {
                this.logger.warn(`Failed to inject bound credential for [${b.paramName}]: ${err.message}`);
                throw new Error(
                  `Runtime credential resolution failed for parameter [${b.paramName}]`
                );
              }
            }
          }
        }

        const skill = await (this.prisma as any).skillConfig?.findFirst({
          where: { OR: [{ id: skillId }, { name: skillId }] },
          select: { paramsSchema: true },
        });
        const schema =
          skill?.paramsSchema && typeof skill.paramsSchema === 'object'
            ? (skill.paramsSchema as Record<string, unknown>)
            : {};
        const properties =
          schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
            ? (schema.properties as Record<string, unknown>)
            : {};
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
            const isMissing =
              value === undefined ||
              value === null ||
              value === '' ||
              (typeof value === 'string' && this.isMaskedPlaceholder(value));
            return !hasUsableDefault && isMissing ? [paramName] : [];
          }
        );
        if (missingCredentialFields.length > 0) {
          throw new Error(
            `请先为当前 Skill 绑定用户凭证：${missingCredentialFields.join('、')}`
          );
        }
      } catch (err: any) {
        this.logger.warn(`Error querying skill credential bindings: ${err.message}`);
        throw err;
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

  private isMaskedPlaceholder(value: string): boolean {
    const normalized = value.trim();
    return (
      normalized === '••••••••' ||
      normalized === '[redacted]' ||
      normalized === '********'
    );
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

    if (raw) {
      if (/^[0-9a-f]{64}$/i.test(raw)) {
        return Buffer.from(raw, 'hex');
      }
      try {
        const buf = Buffer.from(raw, 'base64');
        if (buf.length === 32) return buf;
      } catch {
        // fallthrough
      }
    }

    return createHash('sha256').update(process.env.JWT_SECRET || 'ops_dev_credential_vault_secret_2026').digest();
  }
}
