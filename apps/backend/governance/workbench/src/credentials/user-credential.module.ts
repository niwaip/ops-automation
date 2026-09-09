import { Module } from '@nestjs/common';
import { UserCredentialCrypto } from './user-credential.crypto';
import { UserCredentialVaultService } from './user-credential-vault.service';
import { UserSkillCredentialBindingService } from './user-skill-credential-binding.service';
import {
  InternalUserCredentialController,
  UserCredentialController,
} from './user-credential.controller';

@Module({
  controllers: [UserCredentialController, InternalUserCredentialController],
  providers: [
    UserCredentialCrypto,
    UserCredentialVaultService,
    UserSkillCredentialBindingService,
  ],
  exports: [
    UserCredentialCrypto,
    UserCredentialVaultService,
    UserSkillCredentialBindingService,
  ],
})
export class UserCredentialModule {}
