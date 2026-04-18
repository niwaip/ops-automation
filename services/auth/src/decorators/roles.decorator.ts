/**
 * Roles Decorator
 * 用于指定 API 所需的角色
 */

import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * 指定访问该 API 所需的角色
 * @param roles 角色列表
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);