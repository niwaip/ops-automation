import { WorkspaceService } from '@ops/workbench/workspace/workspace.service';

describe('Body-only historical knowledge coverage boundary', () => {
  it.each([300, 499, 500])('finds a body-only old fact after %i newer files', async count => {
    const s: any = Object.create(WorkspaceService.prototype);
    const workspaceId = '20000000-0000-4000-8000-000000000001';
    const query = 'ARCHIVE-2024-771';
    s.logger = {log:jest.fn(),warn:jest.fn()};
    s.toNodeDto = (n: any) => n;
    s.getMyWorkspaces = jest.fn().mockResolvedValue({personal:{id:workspaceId},company:{id:workspaceId},department:null,process:null});
    const common = {workspaceId,parentId:null,mimeType:'text/markdown',workspace:{type:'personal',name:'我的空间'}};
    const recent = Array.from({length:count}, (_, i) => ({...common,id:`recent-${i}`,name:`日志-${i}.md`,storagePath:`recent-${i}`,digestJson:null}));
    const old = {...common,id:'old-report',name:'交付报告.md',storagePath:'old-report',digestJson:{summary:'本文件描述交付事项与验收流程。'}};
    const inventory = [...recent, old];
    s.prisma = {
      workspaceNode: {findMany:jest.fn().mockImplementation(async ({where,take}:any) => {
        let rows: any[] = inventory;
        if (where.id) rows = rows.filter(n=>where.id.in.includes(n.id));
        if (where.OR) rows = rows.filter(n=>where.OR.some((c:any)=>n.name.toLowerCase().includes(c.name.contains.toLowerCase())));
        return take ? rows.slice(0,take) : rows;
      })},
      $queryRawUnsafe:jest.fn().mockImplementation(async (_sql:string,_ws:string[],...patterns:string[]) => inventory.filter(n=>patterns.some(p=>JSON.stringify(n.digestJson || {}).toLowerCase().includes(p.slice(1,-1).toLowerCase()))).slice(0,100).map(n=>({id:n.id}))),
    };
    s.contentIndexer = {
      grepFile:jest.fn().mockImplementation(async (p:string)=>p==='old-report'?[{line:90,snippet:`验收编号 ${query}`}]:[]),
      getExtractedText:jest.fn().mockResolvedValue(null),
    };
    const results = await s.searchContent('10000000-0000-4000-8000-000000000001',undefined,query,undefined,[]);
    expect(results.some((r:any)=>r.id==='old-report')).toBe(true);
  });
});

describe('Authorized department retrieval', () => {
  it('allows scoped search in a second department already listed as visible to the user', async () => {
    const s: any = Object.create(WorkspaceService.prototype);
    const primary = '20000000-0000-4000-8000-000000000001';
    const secondary = '20000000-0000-4000-8000-000000000002';
    s.logger = {log:jest.fn(),warn:jest.fn()};
    s.getMyWorkspaces = jest.fn().mockResolvedValue({
      personal:{id:'20000000-0000-4000-8000-000000000003'},
      company:{id:'20000000-0000-4000-8000-000000000004'},
      department:{id:primary},process:null,
      departments:[{id:'dept-a',workspaceId:primary},{id:'dept-b',workspaceId:secondary}],
    });
    s.prisma = {
      workspaceNode:{findMany:jest.fn().mockResolvedValue([])},
      orgMembership:{count:jest.fn().mockResolvedValue(1)},
      $queryRawUnsafe:jest.fn().mockResolvedValue([]),
    };
    await expect(s.searchContent('10000000-0000-4000-8000-000000000001',undefined,'TOKEN-123',secondary,[])).resolves.toEqual([]);
  });
});
