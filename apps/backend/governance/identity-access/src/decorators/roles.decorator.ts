import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../metadata/authz.constants';

export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
