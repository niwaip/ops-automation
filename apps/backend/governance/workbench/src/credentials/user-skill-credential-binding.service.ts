import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { WORKBENCH_PRISMA, WorkbenchPrismaPort } from '../ports';
import { UserCredentialVaultService } from './user-credential-vault.service';
import {
  CredentialCategoryType,
  ResolveRuntimeInputResponseDto,
  SkillCredentialFieldRequirement,
  SkillCredentialStatusDto,
} from './user-credential.dto';

@Injectable()
export class UserSkillCredentialBindingService {
  private readonly logger = new Logger(UserSkillCredentialBindingService.name);

  constructor(
    @Inject(WORKBENCH_PRISMA)
    private readonly prisma: WorkbenchPrismaPort,
    private readonly vaultService: UserCredentialVaultService
  ) {}

  async getSkillCredentialStatus(
    userId: string,
    skillId: string
  ): Promise<SkillCredentialStatusDto> {
    // 1. Locate Skill Config from database
    let skill: any = null;
    try {
      skill = await this.prisma.skillConfig.findFirst({
        where: {
          OR: [{ id: skillId }, { name: skillId }],
        },
      });
    } catch {
      // Ignore if table not queried directly
    }

    if (!skill) {
      try {
        skill = await this.prisma.builtinSkill.findFirst({
          where: {
            OR: [{ id: skillId }, { capabilityKey: skillId }],
          },
        });
      } catch {
        // Ignore
      }
    }

    const skillName = skill?.name || skill?.displayName || skillId;
    const paramsSchema = (skill?.paramsSchema || skill?.params_schema || {}) as Record<string, any>;
    const properties = (paramsSchema.properties || {}) as Record<string, any>;
    const requiredList = Array.isArray(paramsSchema.required) ? paramsSchema.required : [];

    // 2. Query active bindings for this user and skill
    const bindings = await this.prisma.userSkillCredentialBinding.findMany({
      where: { userId, skillId: skill?.id || skillId },
      include: { credential: true },
    });
    const bindingMap = new Map<string, any>();
    for (const b of bindings) {
      bindingMap.set(b.paramName, b.credential);
    }

    // 3. Inspect properties to detect credential fields
    const requirements: SkillCredentialFieldRequirement[] = [];

    for (const [paramName, prop] of Object.entries(properties)) {
      const isSecret = Boolean(
        prop.isSecret ||
        prop['x-is-secret'] ||
        prop.format === 'password' ||
        this.isHeuristicSecretField(paramName, prop)
      );

      if (!isSecret) continue;

      const category = this.inferCredentialCategory(paramName, prop);
      const bound = bindingMap.get(paramName);
      const credentialRequired =
        requiredList.includes(paramName) ||
        prop.credentialRequired === true ||
        prop['x-credential-required'] === true ||
        prop.default === undefined ||
        prop.default === null ||
        prop.default === '';

      requirements.push({
        paramName,
        title: prop.title || paramName,
        description: prop.description,
        credentialCategory: category,
        required: credentialRequired,
        boundCredential: bound
          ? {
              id: bound.id,
              name: bound.name,
              category: bound.category,
              maskedPreview: bound.maskedPreview,
            }
          : null,
      });
    }

    const hasCredentialRequirements = requirements.length > 0;
    const isFullyConfigured =
      !hasCredentialRequirements ||
      requirements.every((req) => !req.required || req.boundCredential != null);

    return {
      skillId: skill?.id || skillId,
      skillName,
      hasCredentialRequirements,
      isFullyConfigured,
      fields: requirements,
    };
  }

  async bindSkillCredential(
    userId: string,
    skillId: string,
    paramName: string,
    credentialId: string
  ): Promise<{ success: boolean; bindingId: string }> {
    // Verify credential belongs to this user
    await this.vaultService.getUserCredential(userId, credentialId);

    const binding = await this.prisma.userSkillCredentialBinding.upsert({
      where: {
        userId_skillId_paramName: {
          userId,
          skillId,
          paramName,
        },
      },
      create: {
        userId,
        skillId,
        paramName,
        credentialId,
      },
      update: {
        credentialId,
        updatedAt: new Date(),
      },
    });

    return { success: true, bindingId: binding.id };
  }

  async unbindSkillCredential(
    userId: string,
    skillId: string,
    paramName: string
  ): Promise<{ success: boolean }> {
    await this.prisma.userSkillCredentialBinding.deleteMany({
      where: {
        userId,
        skillId,
        paramName,
      },
    });

    return { success: true };
  }

  async resolveRuntimeInput(
    userId: string,
    skillId: string | undefined,
    inputJson: Record<string, any>
  ): Promise<ResolveRuntimeInputResponseDto> {
    const resolved: Record<string, any> = { ...inputJson };
    const injectedParamNames: string[] = [];

    // A. Resolve explicit { source: 'credential_ref', credentialId: '...' }
    for (const [key, value] of Object.entries(resolved)) {
      if (value && typeof value === 'object') {
        const credId = value.credentialId || value.credentialRef;
        if ((value.source === 'credential_ref' || value.source === 'secret_ref') && credId) {
          try {
            const payload = await this.vaultService.getDecryptedPayload(userId, credId);
            const propertyPath = value.propertyPath || value.field || key;
            let valResolved = payload[propertyPath];
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
            injectedParamNames.push(key);

            const usernameVal = payload.username || payload.user || payload.account;
            if (usernameVal !== undefined) {
              if (this.isMissingOrPlaceholder(resolved.username)) {
                resolved.username = usernameVal;
                injectedParamNames.push('username');
              }
              if (this.isMissingOrPlaceholder(resolved.userName)) {
                resolved.userName = usernameVal;
                injectedParamNames.push('userName');
              }
              if (this.isMissingOrPlaceholder(resolved.user)) {
                resolved.user = usernameVal;
                injectedParamNames.push('user');
              }
              if (this.isMissingOrPlaceholder(resolved.account)) {
                resolved.account = usernameVal;
                injectedParamNames.push('account');
              }
            }
            const passwordVal = payload.password || payload.passwd;
            if (passwordVal !== undefined) {
              if (this.isMissingOrPlaceholder(resolved.password)) {
                resolved.password = passwordVal;
                injectedParamNames.push('password');
              }
              if (this.isMissingOrPlaceholder(resolved.loginCredential)) {
                resolved.loginCredential = passwordVal;
                injectedParamNames.push('loginCredential');
              }
            }
          } catch (err: any) {
            this.logger.error(`Failed to resolve credential reference for param [${key}]: ${err.message}`);
            throw new BadRequestException(`解析凭证引用失败 [${key}]: ${err.message}`);
          }
        }
      }
    }

    // B. Resolve default bindings if skillId is provided
    if (skillId) {
      const bindings = await this.prisma.userSkillCredentialBinding.findMany({
        where: { userId, skillId },
        include: { credential: true },
      });

      for (const b of bindings) {
        const currentValue = resolved[b.paramName];
        const isEmpty = this.isMissingOrPlaceholder(currentValue);

        if (b.credential) {
          try {
            const payload = await this.vaultService.getDecryptedPayload(userId, b.credentialId);
            let injectedValue = payload[b.paramName];

            // If paramName not directly matched in payload, map intelligently based on category
            if (injectedValue === undefined) {
              if (b.credential.category === 'device_key') {
                injectedValue = payload.deviceKey || payload.key || payload.token;
              } else if (b.credential.category === 'basic_auth') {
                if (
                  b.paramName.toLowerCase().includes('pass') ||
                  b.paramName.toLowerCase().includes('credential') ||
                  b.paramName.toLowerCase().includes('secret')
                ) {
                  injectedValue = payload.password;
                } else if (
                  b.paramName.toLowerCase().includes('user') ||
                  b.paramName.toLowerCase().includes('account')
                ) {
                  injectedValue = payload.username;
                }
              } else if (b.credential.category === 'api_key' || b.credential.category === 'bearer_token') {
                injectedValue = payload.apiKey || payload.token || payload.key;
              }
            }

            if (isEmpty && injectedValue !== undefined) {
              resolved[b.paramName] = injectedValue;
              injectedParamNames.push(b.paramName);
            }

            const usernameVal = payload.username || payload.user || payload.account;
            if (usernameVal !== undefined) {
              if (this.isMissingOrPlaceholder(resolved.username)) {
                resolved.username = usernameVal;
                injectedParamNames.push('username');
              }
              if (this.isMissingOrPlaceholder(resolved.userName)) {
                resolved.userName = usernameVal;
                injectedParamNames.push('userName');
              }
              if (this.isMissingOrPlaceholder(resolved.user)) {
                resolved.user = usernameVal;
                injectedParamNames.push('user');
              }
              if (this.isMissingOrPlaceholder(resolved.account)) {
                resolved.account = usernameVal;
                injectedParamNames.push('account');
              }
            }

            const passwordVal = payload.password || payload.passwd;
            if (passwordVal !== undefined) {
              if (this.isMissingOrPlaceholder(resolved.password)) {
                resolved.password = passwordVal;
                injectedParamNames.push('password');
              }
              if (this.isMissingOrPlaceholder(resolved.loginCredential)) {
                resolved.loginCredential = passwordVal;
                injectedParamNames.push('loginCredential');
              }
            }
          } catch (err: any) {
            this.logger.warn(`Failed to auto-inject bound credential for [${b.paramName}]: ${err.message}`);
          }
        }
      }
    }

    return {
      resolvedInputJson: resolved,
      injectedParamNames,
    };
  }

  private isHeuristicSecretField(paramName: string, prop?: Record<string, any>): boolean {
    const lower = paramName.toLowerCase();
    const matchesName =
      lower.includes('devicekey') ||
      lower.includes('device_key') ||
      lower.includes('password') ||
      lower.includes('passwd') ||
      lower.includes('secret') ||
      lower.includes('apikey') ||
      lower.includes('api_key') ||
      lower.includes('auth_token') ||
      lower.includes('credential') ||
      lower.includes('token');

    if (matchesName) {
      return true;
    }

    const desc = typeof prop?.description === 'string' ? prop.description : '';
    const title = typeof prop?.title === 'string' ? prop.title : '';
    const label = typeof prop?.displayName === 'string' ? prop.displayName : '';
    return /(密码|口令|密钥|凭证|私钥|token|password|secret|credential)/i.test(
      `${desc} ${title} ${label}`
    );
  }

  private isMaskedPlaceholder(value: string): boolean {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return (
      /^[\u2022\u25cf*•]+$/.test(normalized) ||
      normalized === '[redacted]' ||
      normalized === 'redacted' ||
      normalized === '[masked]' ||
      normalized === 'masked'
    );
  }

  private isMissingOrPlaceholder(val: unknown): boolean {
    if (val === undefined || val === null) {
      return true;
    }
    if (typeof val === 'string') {
      const trimmed = val.trim();
      return (
        trimmed === '' ||
        this.isMaskedPlaceholder(trimmed) ||
        /^\$\{[^}]+\}$/.test(trimmed) ||
        /^\{\{[^}]+\}\}$/.test(trimmed)
      );
    }
    return false;
  }

  private inferCredentialCategory(paramName: string, prop: Record<string, any>): CredentialCategoryType {
    if (prop.credentialCategory) {
      return prop.credentialCategory;
    }
    const lower = paramName.toLowerCase();
    const desc = typeof prop.description === 'string' ? prop.description : '';
    if (
      lower.includes('devicekey') ||
      lower.includes('device_key') ||
      /设备密钥|device\s*key/i.test(desc)
    ) {
      return 'device_key';
    }
    if (
      lower.includes('pass') ||
      lower.includes('username') ||
      lower.includes('credential') ||
      /(密码|口令|账户|用户名)/i.test(desc)
    ) {
      return 'basic_auth';
    }
    if (
      lower.includes('token') ||
      lower.includes('apikey') ||
      lower.includes('api_key') ||
      /(密钥|token|api\s*key)/i.test(desc)
    ) {
      return 'api_key';
    }
    return 'custom';
  }
}
