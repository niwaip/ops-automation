import { Body, Controller, Post, Request } from '@nestjs/common';
import { PersonalKnowledgeService } from './personal-knowledge.service';

@Controller('workspaces/my/knowledge')
export class PersonalKnowledgeController {
  constructor(private readonly knowledge: PersonalKnowledgeService) {}

  @Post('search')
  search(@Request() req: any, @Body() body: { query?: string; browse?: boolean }) {
    return this.knowledge.search(req.user?.id || req.user?.userId, body.query ?? '', body.browse === true);
  }

  @Post('read')
  read(@Request() req: any, @Body() body: { workspaceId: string; documentId: string; startLine?: number; endLine?: number }) {
    return this.knowledge.read(req.user?.id || req.user?.userId, body.workspaceId, body.documentId, body.startLine, body.endLine);
  }
}
