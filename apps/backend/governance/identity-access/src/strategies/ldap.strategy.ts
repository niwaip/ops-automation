import { Injectable } from '@nestjs/common';

export interface LdapAuthResult {
  success: boolean;
  user?: {
    username: string;
    email?: string;
    ldapDn: string;
    adSid?: string;
    externalId?: string;
  };
  error?: string;
}

export interface LdapAuthStrategy {
  authenticate(username: string, password: string): Promise<LdapAuthResult>;
  isAvailable(): boolean;
  getName(): string;
}

@Injectable()
export class MockLdapStrategy implements LdapAuthStrategy {
  getName(): string {
    return 'mock-ldap';
  }

  isAvailable(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  async authenticate(username: string, password: string): Promise<LdapAuthResult> {
    if (this.isAvailable() && password === 'ldap-mock-password') {
      return {
        success: true,
        user: {
          username,
          ldapDn: `cn=${username},ou=users,dc=example,dc=com`,
        },
      };
    }

    return {
      success: false,
      error: 'LDAP authentication not available',
    };
  }
}
