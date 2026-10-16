import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes,ApiOperation,ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
BatchRegenerateDigestDto,
ContentSearchQueryDto,
CreateFolderDto,
MulterUploadedFile,
RegenerateDigestDto,
SaveTextNoteDto,
SearchFilesQueryDto,
} from './dto/workspace.dto';
import { WorkspaceService } from './workspace.service';

@ApiTags('Workspaces')
@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  private extractAuth(req: any) {
    const userId = req.user?.id || req.user?.userId || 'anonymous';
    // 严格从服务端认证上下文中获取，严禁采信未经服务端鉴权的客户端请求头 x-department-id
    const departmentId =
      req.user?.departmentId ||
      req.user?.organizationId ||
      undefined;
    const userRoles: string[] = Array.isArray(req.user?.roles)
      ? req.user.roles
      : req.user?.role
      ? [req.user.role]
      : [];
    return { userId, departmentId, userRoles };
  }

  @Post('my/notes')
  @ApiOperation({ summary: '保存AI对话/文本笔记到个人空间（生成标准 FrontMatter Markdown 与知识候选）' })
  async saveTextNote(@Request() req: any, @Body() body: SaveTextNoteDto) {
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    return await this.workspaceService.saveTextNote(userId, body, departmentId, userRoles);
  }

  @Get('my')
  @ApiOperation({ summary: '获取当前用户可见的工作空间（个人/部门/公司）' })
  async getMyWorkspaces(
    @Request() req: any,
    @Query('departmentId') targetDeptId?: string,
    @Query('userId') targetUserId?: string
  ) {
    const { userId, userRoles } = this.extractAuth(req);
    const isAdmin = userRoles.includes('admin');
    const effectiveUserId = (isAdmin && targetUserId) ? targetUserId : userId;
    return await this.workspaceService.getMyWorkspaces(effectiveUserId, targetDeptId, userRoles);
  }

  @Get('search')
  @ApiOperation({ summary: '跨所有可见工作空间模糊搜索文件（供输入框 @ 选文件使用）' })
  async searchFiles(@Request() req: any, @Query() query: SearchFilesQueryDto) {
    const { userId, departmentId } = this.extractAuth(req);
    return await this.workspaceService.searchFiles(userId, departmentId, query.q);
  }

  @Get('search-content')
  @ApiOperation({ summary: '跨工作空间全文内容检索（Grep / Content Search）' })
  async searchContent(@Request() req: any, @Query() query: ContentSearchQueryDto) {
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    return await this.workspaceService.searchContent(
      userId,
      departmentId,
      query.q,
      query.workspaceId,
      userRoles
    );
  }

  @Get(':workspaceId/nodes/:nodeId/preview')
  @ApiOperation({ summary: '获取文档纯文本预览内容（支持按行裁剪）' })
  async getFilePreview(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string,
    @Query('startLine') startLine?: string,
    @Query('endLine') endLine?: string
  ) {
    const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!UUID_REGEX.test(workspaceId) || !UUID_REGEX.test(nodeId)) {
      throw new BadRequestException('无效的工作空间或文档标识（必须为有效 UUID）');
    }
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    return await this.workspaceService.getFileContent(
      workspaceId,
      nodeId,
      userId,
      userRoles,
      departmentId,
      startLine ? parseInt(startLine, 10) : undefined,
      endLine ? parseInt(endLine, 10) : undefined
    );
  }

  @Post(':workspaceId/nodes/:nodeId/digest')
  @ApiOperation({ summary: '手动重新生成文档结构化摘要卡片（支持AI深度清洗与特定数据提取）' })
  async regenerateDigest(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string,
    @Body() body?: RegenerateDigestDto
  ) {
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    return await this.workspaceService.regenerateDigest(
      workspaceId,
      nodeId,
      userId,
      userRoles,
      departmentId,
      body
    );
  }

  @Post(':workspaceId/batch-digest')
  @ApiOperation({ summary: '批量调用重新生成摘要/AI数据清洗' })
  async batchRegenerateDigest(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() body: BatchRegenerateDigestDto
  ) {
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    return await this.workspaceService.batchRegenerateDigest(
      workspaceId,
      body.nodeIds,
      userId,
      userRoles,
      departmentId,
      body
    );
  }

  @Get(':workspaceId/digest-stats')
  @ApiOperation({ summary: '获取指定工作空间的文档知识提炼与 AI 治理统计指标' })
  async getDigestStats(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string
  ) {
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    return await this.workspaceService.getDigestStats(
      workspaceId,
      userId,
      userRoles,
      departmentId
    );
  }

  @Get(':workspaceId/nodes')
  @ApiOperation({ summary: '获取指定目录下的文件与文件夹列表（支持平铺一览与治理范围过滤）' })
  async getNodes(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Query('parentId') parentId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('order') order?: 'asc' | 'desc',
    @Query('scope') scope?: 'folder' | 'all' | 'ai_cleaned' | 'uncleaned'
  ) {
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    return await this.workspaceService.getNodes(
      workspaceId,
      parentId,
      userId,
      userRoles,
      departmentId,
      sortBy,
      order,
      scope
    );
  }

  @Get(':workspaceId/nodes/:nodeId')
  @ApiOperation({ summary: '获取指定文件或文件夹节点详情（含摘要卡片）' })
  async getNodeDetail(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string
  ) {
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    return await this.workspaceService.getNodeById(
      workspaceId,
      nodeId,
      userId,
      userRoles,
      departmentId
    );
  }

  @Post(':workspaceId/folder')
  @ApiOperation({ summary: '在指定空间/目录下新建文件夹' })
  async createFolder(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateFolderDto
  ) {
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    return await this.workspaceService.createFolder(
      workspaceId,
      body.parentId,
      body.name,
      userId,
      userRoles,
      departmentId
    );
  }

  @Post(':workspaceId/upload')
  @ApiOperation({ summary: '上传文件到指定空间/目录' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @UploadedFile() file: MulterUploadedFile,
    @Body('parentId') parentId?: string
  ) {
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    return await this.workspaceService.uploadFile(
      workspaceId,
      parentId,
      file,
      userId,
      userRoles,
      departmentId
    );
  }

  @Get(':workspaceId/nodes/:nodeId/download')
  @ApiOperation({ summary: '下载指定文件' })
  async downloadFile(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string,
    @Res() res: Response
  ) {
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    const { buffer, fileName, mimeType } = await this.workspaceService.downloadFile(
      workspaceId,
      nodeId,
      userId,
      userRoles,
      departmentId
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Delete(':workspaceId/nodes/:nodeId')
  @ApiOperation({ summary: '删除文件或文件夹（级联清理磁盘文件）' })
  async deleteNode(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string
  ) {
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    return await this.workspaceService.deleteNode(
      workspaceId,
      nodeId,
      userId,
      userRoles,
      departmentId
    );
  }

  @Post(':workspaceId/temp-cleanup')
  @ApiOperation({ summary: '一键清理临时工作区（清理失效幽灵记录与衍生文本缓存）' })
  async cleanupTempWorkspace(
    @Request() req: any,
    @Param('workspaceId') workspaceId: string
  ) {
    const { userId, departmentId, userRoles } = this.extractAuth(req);
    return await this.workspaceService.cleanupTempWorkspace(
      workspaceId,
      userId,
      userRoles,
      departmentId
    );
  }
}
