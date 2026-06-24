"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockLdapStrategy = void 0;
const common_1 = require("@nestjs/common");
let MockLdapStrategy = class MockLdapStrategy {
    getName() {
        return 'mock-ldap';
    }
    isAvailable() {
        return process.env.NODE_ENV === 'development';
    }
    async authenticate(username, password) {
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
};
exports.MockLdapStrategy = MockLdapStrategy;
exports.MockLdapStrategy = MockLdapStrategy = __decorate([
    (0, common_1.Injectable)()
], MockLdapStrategy);
//# sourceMappingURL=ldap.strategy.js.map