import { Body, Controller, Delete, Get, Param, Post, Put, Request } from '@nestjs/common';
import { RequireAdmin } from '@ops/identity-access';
import {
  AddOrganizationMemberDto,
  CreateDepartmentDto,
  CreateOrganizationDto,
  CreateTeamDto,
  UpdateDepartmentDto,
} from '../contracts';
import { OrganizationService } from './organization.service';

@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @RequireAdmin()
  @Post()
  async createOrganization(
    @Body() dto: CreateOrganizationDto,
    @Request() req: { user?: { id: string } }
  ) {
    return this.organizationService.createOrganization(dto, req.user?.id || '');
  }

  @RequireAdmin()
  @Get()
  async listAllOrganizations(@Request() req: { user?: { id: string } }) {
    return this.organizationService.listAllOrganizations(req.user?.id);
  }

  @Get('mine')
  async listMyOrganizations(@Request() req: { user?: { id: string } }) {
    return this.organizationService.listMyOrganizations(req.user?.id || '');
  }

  @Get(':orgId')
  async getOrganizationStructure(@Param('orgId') orgId: string) {
    return this.organizationService.getOrganizationStructure(orgId);
  }

  @RequireAdmin()
  @Post(':orgId/departments')
  async createDepartment(@Param('orgId') orgId: string, @Body() dto: CreateDepartmentDto) {
    return this.organizationService.createDepartment(orgId, dto);
  }

  @RequireAdmin()
  @Put(':orgId/departments/:deptId')
  async updateDepartment(
    @Param('orgId') orgId: string,
    @Param('deptId') deptId: string,
    @Body() dto: UpdateDepartmentDto
  ) {
    return this.organizationService.updateDepartment(orgId, deptId, dto);
  }

  @RequireAdmin()
  @Delete(':orgId/departments/:deptId')
  async deleteDepartment(
    @Param('orgId') orgId: string,
    @Param('deptId') deptId: string
  ) {
    return this.organizationService.deleteDepartment(orgId, deptId);
  }

  @RequireAdmin()
  @Post(':orgId/teams')
  async createTeam(@Param('orgId') orgId: string, @Body() dto: CreateTeamDto) {
    return this.organizationService.createTeam(orgId, dto);
  }

  @RequireAdmin()
  @Post(':orgId/members')
  async addMember(
    @Param('orgId') orgId: string,
    @Body() dto: AddOrganizationMemberDto,
    @Request() req: { user: { id: string } }
  ) {
    return this.organizationService.addMember(orgId, dto, req.user.id);
  }

  @RequireAdmin()
  @Delete(':orgId/members/:userId')
  async removeMember(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string
  ) {
    return this.organizationService.removeMember(orgId, userId);
  }
}

