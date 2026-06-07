export interface UserDto {
  id: string;
  username: string;
  email?: string | null;
  role: "employee" | "admin" | "agent";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
