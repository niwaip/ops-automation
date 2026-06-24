import { RecorderSnapshotService } from './recorder-snapshot.service';

describe('RecorderSnapshotService', () => {
  const service = new RecorderSnapshotService();

  it('parses chrome-devtools uid snapshot lines into observable buttons', () => {
    const nodes = service.parseSnapshotNodes(
      `
uid=2_33 StaticText "PRJ-2026-001"
uid=2_37 StaticText "25.5%"
uid=2_38 StaticText "保留中"
uid=2_39 button "詳細"
uid=2_40 StaticText "PRJ-2026-002"
uid=2_46 button "詳細"
    `.trim()
    );

    const observation = service.buildObservationFromSnapshotState({
      path: '/tmp/snapshot.txt',
      nodes,
    });

    expect(observation.buttons).toEqual([
      expect.objectContaining({
        ref: '2_39',
        text: '詳細',
        role: 'button',
      }),
      expect.objectContaining({
        ref: '2_46',
        text: '詳細',
        role: 'button',
      }),
    ]);
  });

  it('rewrites repeated text click into the first matched uid target from snapshot', () => {
    const rewritten = service.rewriteCommandWithSnapshotRefs(
      {
        tool: 'click',
        params: { text: '詳細' },
        description: '点击第一条保留中案件（PRJ-2026-001）的详情按钮',
      },
      {
        nodes: service.parseSnapshotNodes(
          `
uid=2_33 StaticText "PRJ-2026-001"
uid=2_38 StaticText "保留中"
uid=2_39 button "詳細"
uid=2_40 StaticText "PRJ-2026-002"
uid=2_45 StaticText "保留中"
uid=2_46 button "詳細"
        `.trim()
        ),
      }
    );

    expect(rewritten).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({
          text: '詳細',
          target: '2_39',
        }),
      })
    );
  });
});
