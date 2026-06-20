import { RecorderObservationService } from './recorder-observation.service';

describe('RecorderObservationService', () => {
  it('builds row-scoped nth-match locator for repeated row actions without binding business values', () => {
    const service = new RecorderObservationService();

    const { candidates } = service.buildCandidatesAndTrace({
      inputs: [],
      buttons: [],
      rows: [
        {
          rowIndex: 0,
          rowKey: 'PRJ-2026-001',
          rowText: 'PRJ-2026-001 保留中 詳細',
          region: 'approval-list',
          rowButtons: [
            {
              text: '詳細',
              role: 'button',
              action: 'detail',
              stableName: 'open-project-detail',
            },
          ],
        },
        {
          rowIndex: 1,
          rowKey: 'PRJ-2026-002',
          rowText: 'PRJ-2026-002 保留中 詳細',
          region: 'approval-list',
          rowButtons: [
            {
              text: '詳細',
              role: 'button',
              action: 'detail',
              stableName: 'open-project-detail',
            },
          ],
        },
      ],
      regions: [],
      pageSemantics: undefined,
    });

    const firstRowAction = candidates.find(
      (candidate) => candidate.kind === 'action' && candidate.row?.index === 1
    );
    const secondRowAction = candidates.find(
      (candidate) => candidate.kind === 'action' && candidate.row?.index === 2
    );

    expect(firstRowAction).toEqual(
      expect.objectContaining({
        preferredLocator: {
          type: 'css',
          value:
            ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 1)',
        },
      })
    );
    expect(secondRowAction).toEqual(
      expect.objectContaining({
        preferredLocator: {
          type: 'css',
          value:
            ':nth-match([data-ai-region="approval-list"] [data-ai-stable-name="open-project-detail"], 2)',
        },
      })
    );
    expect(firstRowAction?.preferredLocator?.value).not.toContain('PRJ-2026-001');
    expect(secondRowAction?.preferredLocator?.value).not.toContain('PRJ-2026-002');
  });
});
