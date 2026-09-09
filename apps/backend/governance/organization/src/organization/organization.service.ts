import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ORGANIZATION_REPOSITORY } from '../adapters/tokens';
import type { OrganizationRepository } from '../adapters/organization-repository';
import type {
  AddOrganizationMemberResponse,
  AddOrganizationMemberDto,
  CreateDepartmentResponse,
  CreateDepartmentDto,
  CreateOrganizationResponse,
  CreateOrganizationDto,
  CreateTeamResponse,
  CreateTeamDto,
  GetOrganizationStructureResponse,
  ListMyOrganizationsResponse,
  UpdateDepartmentDto,
} from '../contracts';

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository
  ) {}

  async createOrganization(
    dto: CreateOrganizationDto,
    actorUserId: string
  ): Promise<CreateOrganizationResponse> {
    const created = await this.organizationRepository.createOrganization(dto, actorUserId);
    return { organization: created };
  }

  async listAllOrganizations(actorUserId?: string) {
    const organizations = await this.organizationRepository.listAllOrganizations(actorUserId);
    return { organizations };
  }

  async listMyOrganizations(userId: string): Promise<ListMyOrganizationsResponse> {
    const organizations = await this.organizationRepository.listMyOrganizations(userId);
    return { organizations };
  }

  async getOrganizationStructure(orgId: string): Promise<GetOrganizationStructureResponse> {
    const organization = await this.organizationRepository.getOrganizationStructure(orgId);

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return { organization };
  }

  async createDepartment(
    orgId: string,
    dto: CreateDepartmentDto
  ): Promise<CreateDepartmentResponse> {
    const department = await this.organizationRepository.createDepartment(orgId, dto);
    return { department };
  }

  async updateDepartment(
    orgId: string,
    deptId: string,
    dto: UpdateDepartmentDto
  ) {
    const department = await this.organizationRepository.updateDepartment(orgId, deptId, dto);
    return { department };
  }

  async deleteDepartment(
    orgId: string,
    deptId: string
  ) {
    await this.organizationRepository.deleteDepartment(orgId, deptId);
    return { success: true };
  }

  async createTeam(orgId: string, dto: CreateTeamDto): Promise<CreateTeamResponse> {
    const team = await this.organizationRepository.createTeam(orgId, dto);
    return { team };
  }

  async addMember(
    orgId: string,
    dto: AddOrganizationMemberDto,
    actorUserId: string
  ): Promise<AddOrganizationMemberResponse> {
    const membership = await this.organizationRepository.addMember(orgId, dto, actorUserId);

    return {
      membershipId: membership.id,
      userId: membership.userId,
      orgId: membership.orgId,
      status: membership.status,
    };
  }

  async removeMember(
    orgId: string,
    userId: string
  ) {
    await this.organizationRepository.removeMember(orgId, userId);
    return { success: true };
  }
}

