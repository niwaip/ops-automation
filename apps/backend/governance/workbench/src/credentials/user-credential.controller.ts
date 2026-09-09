import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Public } from '@ops/identity-access';
import { UserCredentialVaultService } from './user-credential-vault.service';
import { UserSkillCredentialBindingService } from './user-skill-credential-binding.service';
import {
  BindSkillCredentialDto,
  CreateUserCredentialDto,
  ResolveRuntimeInputRequestDto,
  UpdateUserCredentialDto,
} from './user-credential.dto';

@Controller(['credentials', 'api/credentials'])
export class UserCredentialController {
  constructor(
    private readonly vaultService: UserCredentialVaultService,
    private readonly bindingService: UserSkillCredentialBindingService
  ) {}

  @Get()
  async listCredentials(@Request() req: any, @Query('category') category?: string) {
    const userId = req.user?.id || req.user?.userId;
    return this.vaultService.listUserCredentials(userId, category);
  }

  @Post()
  async createCredential(@Request() req: any, @Body() dto: CreateUserCredentialDto) {
    const userId = req.user?.id || req.user?.userId;
    const orgId = req.user?.activeOrgId || req.user?.orgId;
    return this.vaultService.createUserCredential(userId, orgId, dto);
  }

  @Get(':id')
  async getCredential(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id || req.user?.userId;
    return this.vaultService.getUserCredential(userId, id);
  }

  @Put(':id')
  async updateCredential(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserCredentialDto
  ) {
    const userId = req.user?.id || req.user?.userId;
    return this.vaultService.updateUserCredential(userId, id, dto);
  }

  @Delete(':id')
  async deleteCredential(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id || req.user?.userId;
    return this.vaultService.deleteUserCredential(userId, id);
  }

  @Get('skills/:skillId/status')
  async getSkillStatus(@Request() req: any, @Param('skillId') skillId: string) {
    const userId = req.user?.id || req.user?.userId;
    return this.bindingService.getSkillCredentialStatus(userId, skillId);
  }

  @Post('skills/:skillId/bind')
  async bindSkillCredential(
    @Request() req: any,
    @Param('skillId') skillId: string,
    @Body() dto: BindSkillCredentialDto
  ) {
    const userId = req.user?.id || req.user?.userId;
    return this.bindingService.bindSkillCredential(userId, skillId, dto.paramName, dto.credentialId);
  }

  @Delete('skills/:skillId/bind/:paramName')
  async unbindSkillCredential(
    @Request() req: any,
    @Param('skillId') skillId: string,
    @Param('paramName') paramName: string
  ) {
    const userId = req.user?.id || req.user?.userId;
    return this.bindingService.unbindSkillCredential(userId, skillId, paramName);
  }
}

@Public()
@Controller(['internal/credentials', 'api/internal/credentials'])
export class InternalUserCredentialController {
  constructor(private readonly bindingService: UserSkillCredentialBindingService) {}

  @Post('resolve-runtime-input')
  async resolveRuntimeInput(@Body() dto: ResolveRuntimeInputRequestDto) {
    return this.bindingService.resolveRuntimeInput(dto.userId, dto.skillId, dto.inputJson);
  }
}
