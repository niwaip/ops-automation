import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BuiltinSkillRegistryService } from '../registry/builtin-skill-registry.service';

export interface AuthorizeInput {
  userId?: string;
  orgId?: string;
  roleIds?: string[];
  capabilityKey: string;
  action: 'discover' | 'execute' | 'manage';
}

export interface AuthorizeResult {
  authorized: boolean;
  reason?: string;
}

@Injectable()
export class BuiltinSkillPermissionService {
  private readonly logger = new Logger(BuiltinSkillPermissionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registryService: BuiltinSkillRegistryService,
  ) {}

  async authorize(input: AuthorizeInput): Promise<AuthorizeResult> {
    const skill = await this.registryService.findSkillByKey(input.capabilityKey);
    if (!skill) {
      return { authorized: false, reason: 'BUILTIN_SKILL_NOT_FOUND' };
    }

    if (!skill.isEnabled) {
      return { authorized: false, reason: 'BUILTIN_SKILL_DISABLED' };
    }

    // Action check for 'manage': requires admin role or explicit manage permission
    if (input.action === 'manage') {
      const isAdmin = input.roleIds?.some(r => r === 'admin' || r === 'superadmin' || r === 'platform-admin');
      if (!isAdmin) {
        return { authorized: false, reason: 'MANAGE_ACTION_REQUIRES_ADMIN' };
      }
    }

    // Check permission overrides
    const overrides = await this.prisma.builtinSkillPermissionOverride.findMany({
      where: { builtinSkillId: skill.id },
    });

    const now = new Date();
    const activeOverrides = overrides.filter(o => !o.expiresAt || o.expiresAt > now);

    const matchesPrincipal = (o: { principalType: string; principalId: string }) => {
      if (!o.principalType || o.principalType === 'org') return true;
      if (o.principalType === 'user' && input.userId && o.principalId === input.userId) return true;
      if (o.principalType === 'role' && input.roleIds && input.roleIds.includes(o.principalId)) return true;
      return false;
    };

    // 1. Org-level Deny check
    if (input.orgId) {
      const orgDeny = activeOverrides.find(o => o.orgId === input.orgId && o.effect === 'deny' && matchesPrincipal(o));
      if (orgDeny) return { authorized: false, reason: 'ORG_DENIED' };
    }

    // 2. User Deny (global or org-scoped)
    if (input.userId) {
      const userDeny = activeOverrides.find(o => o.principalType === 'user' && o.principalId === input.userId && o.effect === 'deny' && (!o.orgId || o.orgId === input.orgId));
      if (userDeny) return { authorized: false, reason: 'USER_DENIED' };
    }

    // 3. Role Deny (global or org-scoped)
    if (input.roleIds && input.roleIds.length > 0) {
      const roleDeny = activeOverrides.find(o => o.principalType === 'role' && input.roleIds!.includes(o.principalId) && o.effect === 'deny' && (!o.orgId || o.orgId === input.orgId));
      if (roleDeny) return { authorized: false, reason: 'ROLE_DENIED' };
    }

    // 4. User Allow
    if (input.userId) {
      const userAllow = activeOverrides.find(o => o.principalType === 'user' && o.principalId === input.userId && o.effect === 'allow');
      if (userAllow) return { authorized: true, reason: 'USER_ALLOWED' };
    }

    // 5. Role Allow
    if (input.roleIds && input.roleIds.length > 0) {
      const roleAllow = activeOverrides.find(o => o.principalType === 'role' && input.roleIds!.includes(o.principalId) && o.effect === 'allow');
      if (roleAllow) return { authorized: true, reason: 'ROLE_ALLOWED' };
    }

    // 6. Default Access mode resolution (robust against string, JSON string, or object)
    let accessMode = 'authenticated';
    if (typeof skill.defaultAccess === 'string') {
      if (skill.defaultAccess.startsWith('{')) {
        try {
          accessMode = JSON.parse(skill.defaultAccess)?.mode || 'authenticated';
        } catch {
          accessMode = skill.defaultAccess;
        }
      } else {
        accessMode = skill.defaultAccess;
      }
    } else if (typeof skill.defaultAccess === 'object' && skill.defaultAccess) {
      accessMode = (skill.defaultAccess as any).mode || 'authenticated';
    }

    if ((accessMode === 'authenticated' || accessMode === 'public') && (input.userId || input.action === 'discover')) {
      return { authorized: true, reason: 'DEFAULT_AUTHENTICATED_ACCESS' };
    }

    if (accessMode === 'public') {
      return { authorized: true, reason: 'DEFAULT_PUBLIC_ACCESS' };
    }

    return { authorized: false, reason: 'NO_MATCHING_GRANT' };
  }

  async addOverride(overrideData: {
    capabilityKey: string;
    orgId?: string;
    principalType: 'role' | 'user' | 'org';
    principalId: string;
    effect: 'allow' | 'deny';
    reason?: string;
    createdBy?: string;
    expiresAt?: Date;
  }) {
    const skill = await this.registryService.findSkillByKey(overrideData.capabilityKey);
    if (!skill) {
      throw new Error(`Builtin skill '${overrideData.capabilityKey}' not found`);
    }

    return this.prisma.builtinSkillPermissionOverride.create({
      data: {
        builtinSkillId: skill.id,
        orgId: overrideData.orgId || null,
        principalType: overrideData.principalType,
        principalId: overrideData.principalId,
        effect: overrideData.effect,
        reason: overrideData.reason || null,
        createdBy: overrideData.createdBy || null,
        expiresAt: overrideData.expiresAt || null,
      },
    });
  }
}
