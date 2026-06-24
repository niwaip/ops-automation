import type { UserDto } from './auth-response.contract';

export interface UserListResponse {
  users: UserDto[];
  total: number;
  page: number;
  pageSize: number;
}
