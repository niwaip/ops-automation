import { Injectable } from '@nestjs/common';

/**
 * LDAP/AD Authentication Strategy Interface
 * Reserved for future LDAP/Active Directory integration
 *
 * This interface defines the contract for LDAP authentication strategies.
 * Implementations can be swapped using the strategy pattern.
 */

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
  /**
   * Authenticate user against LDAP/AD server
   * @param username The username to authenticate
   * @param password The password to verify
   * @returns Authentication result with user info if successful
   */
  authenticate(username: string, password: string): Promise<LdapAuthResult>;

  /**
   * Check if this strategy is available/configured
   */
  isAvailable(): boolean;

  /**
   * Get strategy name for identification
   */
  getName(): string;
}

/**
 * Mock LDAP strategy for development/testing
 * Can be replaced with actual LDAP implementation in production
 */
@Injectable()
export class MockLdapStrategy implements LdapAuthStrategy {
  getName(): string {
    return 'mock-ldap';
  }

  isAvailable(): boolean {
    return process.env.NODE_ENV === 'development';
  }

  async authenticate(username: string, password: string): Promise<LdapAuthResult> {
    // In development, allow mock authentication
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