import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { WorkspaceArtifactService } from './workspace-artifact.service';
import type { Response } from 'express';

describe('WorkspaceArtifactService', () => {
  let service: WorkspaceArtifactService;
  let mockRes: Partial<Response>;
  let headers: Record<string, string>;

  beforeEach(() => {
    service = new WorkspaceArtifactService();
    headers = {};
    mockRes = {
      setHeader: jest.fn((key: string, val: string) => {
        headers[key.toLowerCase()] = val;
        return mockRes as Response;
      }),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('Path validation and traversal defenses', () => {
    it('throws BadRequestException if userId or fileName contains directory traversal', async () => {
      await expect(
        service.serveWorkspaceFile({
          targetUserId: '../etc',
          fileName: 'passwd',
          requestingUser: { id: 'u1', role: 'employee' },
          res: mockRes as Response,
        })
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.serveWorkspaceFile({
          targetUserId: 'u1',
          fileName: '../../etc/passwd',
          requestingUser: { id: 'u1', role: 'employee' },
          res: mockRes as Response,
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Authentication & Authorization', () => {
    it('throws UnauthorizedException if requestingUser is absent', async () => {
      await expect(
        service.serveWorkspaceFile({
          targetUserId: 'u1',
          fileName: 'report.pdf',
          requestingUser: undefined,
          res: mockRes as Response,
        })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException if non-privileged user attempts cross-user access', async () => {
      await expect(
        service.serveWorkspaceFile({
          targetUserId: 'victim-user',
          fileName: 'secret.docx',
          requestingUser: { id: 'attacker-user', role: 'employee' },
          res: mockRes as Response,
        })
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows admin to access another user file', async () => {
      jest.spyOn(service, 'resolveUserFilePath').mockReturnValue('/mock/victim-user/workspace/secret.docx');
      jest.spyOn(service, 'fileExists').mockReturnValue(true);
      const mockStream = { pipe: jest.fn() };
      jest.spyOn(service, 'createFileStream').mockReturnValue(mockStream as any);

      await service.serveWorkspaceFile({
        targetUserId: 'victim-user',
        fileName: 'secret.docx',
        requestingUser: { id: 'admin-user', role: 'admin' },
        res: mockRes as Response,
      });

      expect(mockRes.setHeader).toHaveBeenCalled();
      expect(mockStream.pipe).toHaveBeenCalledWith(mockRes);
    });

    it('allows internal_service to access user file', async () => {
      jest.spyOn(service, 'resolveUserFilePath').mockReturnValue('/mock/victim-user/workspace/secret.docx');
      jest.spyOn(service, 'fileExists').mockReturnValue(true);
      const mockStream = { pipe: jest.fn() };
      jest.spyOn(service, 'createFileStream').mockReturnValue(mockStream as any);

      await service.serveWorkspaceFile({
        targetUserId: 'victim-user',
        fileName: 'secret.docx',
        requestingUser: { id: 'service-account', role: 'internal_service', isInternalService: true },
        res: mockRes as Response,
      });

      expect(mockStream.pipe).toHaveBeenCalledWith(mockRes);
    });

    it('maps "me" and "default" to requesting user ID', async () => {
      const resolveSpy = jest
        .spyOn(service, 'resolveUserFilePath')
        .mockReturnValue('/mock/u1/workspace/chart.png');
      jest.spyOn(service, 'fileExists').mockReturnValue(true);
      const mockStream = { pipe: jest.fn() };
      jest.spyOn(service, 'createFileStream').mockReturnValue(mockStream as any);

      await service.serveWorkspaceFile({
        targetUserId: 'me',
        fileName: 'chart.png',
        requestingUser: { id: 'u1', role: 'employee' },
        res: mockRes as Response,
      });

      expect(resolveSpy).toHaveBeenCalledWith('u1', 'chart.png');

      await service.serveWorkspaceFile({
        targetUserId: 'default',
        fileName: 'chart.png',
        requestingUser: { id: 'u1', role: 'employee' },
        res: mockRes as Response,
      });

      expect(resolveSpy).toHaveBeenCalledWith('u1', 'chart.png');
    });
  });

  describe('Security Headers & Stored XSS Mitigation', () => {
    beforeEach(() => {
      jest.spyOn(service, 'fileExists').mockReturnValue(true);
      const mockStream = { pipe: jest.fn() };
      jest.spyOn(service, 'createFileStream').mockReturnValue(mockStream as any);
    });

    it('forces attachment disposition for HTML to prevent stored XSS', async () => {
      jest.spyOn(service, 'resolveUserFilePath').mockReturnValue('/mock/u1/workspace/exploit.html');

      await service.serveWorkspaceFile({
        targetUserId: 'u1',
        fileName: 'exploit.html',
        requestingUser: { id: 'u1', role: 'employee' },
        res: mockRes as Response,
      });

      expect(headers['content-disposition']).toContain('attachment');
      expect(headers['content-disposition']).not.toContain('inline');
      expect(headers['content-security-policy']).toBe("default-src 'none'; sandbox");
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['cache-control']).toBe('private, no-cache, no-store, must-revalidate');
    });

    it('forces attachment disposition for SVG to prevent stored XSS', async () => {
      jest.spyOn(service, 'resolveUserFilePath').mockReturnValue('/mock/u1/workspace/badge.svg');

      await service.serveWorkspaceFile({
        targetUserId: 'u1',
        fileName: 'badge.svg',
        requestingUser: { id: 'u1', role: 'employee' },
        res: mockRes as Response,
      });

      expect(headers['content-disposition']).toContain('attachment');
      expect(headers['content-security-policy']).toBe("default-src 'none'; sandbox");
      expect(headers['x-content-type-options']).toBe('nosniff');
    });

    it('allows inline disposition for safe images and PDF', async () => {
      jest.spyOn(service, 'resolveUserFilePath').mockReturnValue('/mock/u1/workspace/image.png');
      jest.spyOn(service, 'sniffMimeType').mockReturnValue('image/png');

      await service.serveWorkspaceFile({
        targetUserId: 'u1',
        fileName: 'image.png',
        requestingUser: { id: 'u1', role: 'employee' },
        res: mockRes as Response,
      });

      expect(headers['content-disposition']).toContain('inline');
      expect(headers['content-type']).toBe('image/png');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['cache-control']).toBe('private, no-cache, no-store, must-revalidate');
    });

    it('throws NotFoundException if file does not exist', async () => {
      jest.spyOn(service, 'resolveUserFilePath').mockReturnValue(null);

      await expect(
        service.serveWorkspaceFile({
          targetUserId: 'u1',
          fileName: 'missing.png',
          requestingUser: { id: 'u1', role: 'employee' },
          res: mockRes as Response,
        })
      ).rejects.toThrow(NotFoundException);
    });
  });
});
