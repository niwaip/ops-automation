import { StudioControllerBase } from './studio.controller.base';

class TestStudioControllerBase extends StudioControllerBase {
  constructor() {
    super(
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any
    );
  }

  normalize(data: Record<string, any>): Record<string, any> {
    return this.normalizeRenderData(data);
  }
}

describe('StudioControllerBase.normalizeRenderData', () => {
  it('keeps dotted keys as exact variables instead of forcing nested objects', () => {
    const controller = new TestStudioControllerBase();

    expect(
      controller.normalize({
        'contract.partyA': '委托方：',
        'contract.partyA.name': '甲 方',
      })
    ).toEqual({
      'contract.partyA': '委托方：',
      'contract.partyA.name': '甲 方',
    });
  });

  it('builds loop rows without collapsing dotted child keys into parent objects', () => {
    const controller = new TestStudioControllerBase();

    expect(
      controller.normalize({
        'items[].partyA': ['委托方：'],
        'items[].partyA.name': ['甲 方'],
      })
    ).toEqual({
      items: [
        {
          partyA: '委托方：',
          'partyA.name': '甲 方',
        },
      ],
    });
  });
});
