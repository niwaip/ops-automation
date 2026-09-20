import { DocumentTemplateBackupHandler } from '@ops/system-backup';

describe('DocumentTemplateBackupHandler', () => {
  let handler: DocumentTemplateBackupHandler;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn(),
    };
    handler = new DocumentTemplateBackupHandler(mockPrisma);
  });

  describe('count', () => {
    it('should query templates excluding draft files', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([{ count: 2 }]);

      const count = await handler.count();

      expect(count).toBe(2);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("WHERE type = 'template' \n           AND file_name NOT LIKE 'draft-%' \n           AND file_name NOT ILIKE 'draft-%'")
      );
    });
  });

  describe('export', () => {
    it('should export only non-draft templates and their skills', async () => {
      mockPrisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { id: 'tpl-1', file_name: '正式合同.docx', format: 'docx', type: 'template' },
        ])
        .mockResolvedValueOnce([
          { id: 'skl-1', template_id: 'tpl-1' },
        ]);

      const result = await handler.export();

      expect(result.templates).toHaveLength(1);
      expect(result.templates[0].id).toBe('tpl-1');
      expect(result.skills).toHaveLength(1);

      // Verify SQL contains draft exclusion
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("WHERE type = 'template' \n           AND file_name NOT LIKE 'draft-%'")
      );
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("WHERE t.type = 'template' \n           AND t.file_name NOT LIKE 'draft-%'")
      );
    });
  });

  describe('preview', () => {
    it('should filter out draft items from backup data', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValueOnce([]);

      const preview = await handler.preview({
        templates: [
          { id: 'tpl-1', file_name: '正式合同.docx' },
          { id: 'draft-1', file_name: 'draft-178921.docx' },
          { id: 'draft-2', fileName: 'draft-999.docx' },
        ],
      });

      expect(preview.totalInBackup).toBe(1);
      expect(preview.items).toHaveLength(1);
      expect(preview.items[0].key).toBe('tpl-1');
    });
  });

  describe('import', () => {
    it('should ignore draft templates in import payload', async () => {
      mockPrisma.$executeRawUnsafe.mockResolvedValue(1);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await handler.import(
        {
          templates: [
            { id: 'tpl-1', file_name: '正式合同.docx', format: 'docx' },
            { id: 'draft-1', file_name: 'draft-178921.docx', format: 'docx' },
          ],
        },
        'merge_override'
      );

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(0);
    });
  });
});
