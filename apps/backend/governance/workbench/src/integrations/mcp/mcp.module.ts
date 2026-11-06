import { McpSkillCatalogService } from './mcp-skill-catalog.service';
import { McpContractService } from './mcp-contract.service';
import { Module } from '@nestjs/common';
import { UserCredentialModule } from '../../credentials/user-credential.module';
import { McpAccessService } from './mcp-access.service';
import { McpAuthorizationService } from './mcp-authorization.service';
import { McpConnectionService } from './mcp-connection.service';
import { McpInvocationService } from './mcp-invocation.service';
import { McpRunnerClient } from './mcp-runner.client';
import { McpIntegrationController } from './mcp.controller';
import { McpPublicationService } from './mcp-publication.service';
import { McpSummaryGeneratorService } from './mcp-summary-generator.service';
import { McpSummaryService } from './mcp-summary.service';

@Module({ imports: [UserCredentialModule], controllers: [McpIntegrationController],
  providers: [McpContractService, McpSkillCatalogService, McpAccessService, McpAuthorizationService, McpConnectionService, McpInvocationService, McpRunnerClient, McpPublicationService, McpSummaryGeneratorService, McpSummaryService] })
export class McpIntegrationModule {}
