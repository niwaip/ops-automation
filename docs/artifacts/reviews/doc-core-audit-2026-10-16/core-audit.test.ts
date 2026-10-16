// Audit-only behavioral probes. Outside normal CI discovery; failures identify remaining gaps.
import * as ZipLib from 'jszip';
import { WorkspaceService } from '@ops/workbench/workspace/workspace.service';
import { WorkspaceController } from '@ops/workbench/workspace/workspace.controller';
import { WorkspaceContentIndexerService } from '@ops/workbench/workspace/workspace-content-indexer.service';
import { buildQueryTokenProfile, evaluateDocumentRelevance } from '@ops/workbench/workspace/workspace-search-relevance.helper';

const JSZip: any = (ZipLib as any).default || ZipLib;
const uid = '10000000-0000-4000-8000-000000000001';
const wid = '20000000-0000-4000-8000-000000000001';
function service() {
  const s: any = Object.create(WorkspaceService.prototype);
  s.logger = { log: jest.fn(), warn: jest.fn() };
  s.toNodeDto = (n: any) => n;
  s.prisma = {
    workspace: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    orgMembership: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    department: { findMany: jest.fn().mockResolvedValue([]) },
    workspaceNode: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  };
  return s;
}

describe('Core audit: isolation', () => {
  it('ignores a client-supplied department header', () => {
    const c: any = new WorkspaceController({} as any);
    expect(c.extractAuth({ user: { id: uid, role: 'employee' }, headers: { 'x-department-id': 'other-dept' } }).departmentId).toBeUndefined();
  });
  it.each(['read', 'write', 'delete'])('rejects forged department context for %s', async action => {
    const s = service();
    s.prisma.workspace.findUnique.mockResolvedValue({ id: wid, type: 'department', departmentId: 'other-dept' });
    await expect(s.assertAccess(wid, uid, 'other-dept', action, [])).rejects.toMatchObject({ status: 403 });
  });
  it('allows an actual department member', async () => {
    const s = service();
    s.prisma.workspace.findUnique.mockResolvedValue({ id: wid, type: 'department', departmentId: 'own-dept' });
    s.prisma.orgMembership.count.mockResolvedValue(1);
    await expect(s.assertAccess(wid, uid, undefined, 'read', [])).resolves.toMatchObject({ id: wid });
  });
  it('rejects access to another personal space', async () => {
    const s = service();
    s.prisma.workspace.findUnique.mockResolvedValue({ id: wid, type: 'personal', ownerUserId: 'someone-else' });
    await expect(s.assertAccess(wid, uid, undefined, 'read', [])).rejects.toMatchObject({ status: 403 });
  });
  it('does not assign a department to a member without memberships', async () => {
    const s = service();
    s.prisma.workspace.findFirst.mockImplementation(async ({where}: any) => ({ id: wid, type: where.type }));
    s.prisma.workspace.findUnique.mockResolvedValue({ id: wid, type: 'personal' });
    s.syncUserSandboxKnowledge = jest.fn();
    s.toWorkspaceSummary = (w: any) => w;
    const spaces = await s.getMyWorkspaces(uid, 'forged-dept', []);
    expect(spaces.department).toBeNull();
    expect(spaces.departments).toEqual([]);
  });
  it('rejects explicit search in a non-visible workspace', async () => {
    const s = service();
    s.getMyWorkspaces = jest.fn().mockResolvedValue({ personal: {id:wid}, company: {id:wid}, department:null, process:null });
    await expect(s.searchContent(uid, undefined, '预算', '30000000-0000-4000-8000-000000000001', [])).rejects.toMatchObject({ status:403 });
  });
});

describe('Core audit: ranking and identity improvements', () => {
  it('orders by final body relevance instead of only the initial filename score', async () => {
    const s = service();
    s.getMyWorkspaces = jest.fn().mockResolvedValue({personal:{id:wid},company:{id:wid},department:null,process:null});
    const common = {workspaceId:wid,parentId:null,mimeType:'text/markdown',digestJson:null,workspace:{type:'personal',name:'我的空间'}};
    const a = {...common,id:'a',name:'TOKEN-AB123.md',storagePath:'a'};
    const b = {...common,id:'b',name:'notes.md',storagePath:'b'};
    s.prisma.workspaceNode.findMany.mockResolvedValue([a,b]);
    s.contentIndexer = {
      grepFile:jest.fn().mockImplementation(async(p:string)=>Array.from({length:p==='a'?1:3},(_,i)=>({line:i+1,snippet:'TOKEN-AB123'}))),
      getExtractedText:jest.fn().mockResolvedValue(null),
    };
    const results = await s.searchContent(uid,undefined,'TOKEN-AB123',undefined,[]);
    expect(results.map((r:any)=>r.id)).toEqual(['b','a']);
  });
  it('keeps different documents with the same name in different folders', async () => {
    const s = service();
    s.getMyWorkspaces = jest.fn().mockResolvedValue({personal:{id:wid},company:{id:wid},department:null,process:null});
    const common = {workspaceId:wid,name:'规程.md',mimeType:'text/markdown',digestJson:null,workspace:{type:'personal',name:'我的空间'}};
    s.prisma.workspaceNode.findMany.mockResolvedValue([{...common,id:'a',parentId:'dir-a',storagePath:'a'},{...common,id:'b',parentId:'dir-b',storagePath:'b'}]);
    s.contentIndexer = {grepFile:jest.fn().mockResolvedValue([{line:1,snippet:'TOKEN-AB123'}]),getExtractedText:jest.fn().mockResolvedValue(null)};
    const results = await s.searchContent(uid,undefined,'TOKEN-AB123',undefined,[]);
    expect(new Set(results.map((r:any)=>r.id))).toEqual(new Set(['a','b']));
  });
});

describe('Core audit: unresolved behavioral requirements', () => {
  it('retains a numeric budget from a spreadsheet, rather than only shared text labels', async () => {
    const zip = new JSZip();
    zip.file('xl/sharedStrings.xml', '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>项目预算</t></si></sst>');
    zip.file('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>52931</v></c></row></sheetData></worksheet>');
    const idx = new WorkspaceContentIndexerService({} as any);
    const text = await idx.extractText(await zip.generateAsync({type:'nodebuffer'}), '预算.xlsx');
    expect(text).toContain('52931');
  });
  it('does not mark a requested exact ID as physically proven just because a different query entity is in the body', () => {
    const profile = buildQueryTokenProfile('DeepSeek AD-Q8VN-6173');
    const result = evaluateDocumentRelevance({
      nodeName:'notes.md', profile, baseScore:100,
      digestJson:{cleanedContent:'验收口令 AD-Q8VN-6173。'},
      contentMatches:[{line:1,snippet:'DeepSeek 接口概览',sourceKind:'physical_line'}],
    });
    expect(result.physicalVerified).toBe(false);
  });
  it('finds an old body-only fact when recent files and stored summaries do not contain it', async () => {
    const s = service();
    s.getMyWorkspaces = jest.fn().mockResolvedValue({personal:{id:wid},company:{id:wid},department:null,process:null});
    const recent = Array.from({length:300},(_,i)=>({id:`recent-${i}`,workspaceId:wid,parentId:null,name:`日志-${i}.md`,storagePath:`recent-${i}`,mimeType:'text/markdown',digestJson:null,workspace:{type:'personal',name:'我的空间'}}));
    const old = {id:'old-report',workspaceId:wid,parentId:null,name:'交付报告.md',storagePath:'old-report',mimeType:'text/markdown',digestJson:{summary:'本文件描述交付事项与验收流程。'},workspace:{type:'personal',name:'我的空间'}};
    const inventory = [...recent, old]; // DB order: all recent files precede the old report.
    s.prisma.workspaceNode.findMany.mockImplementation(async ({where,take}:any) => {
      let rows = inventory;
      if (where.id) rows = rows.filter(n=>where.id.in.includes(n.id));
      if (where.OR) rows = rows.filter(n=>where.OR.some((c:any)=>n.name.toLowerCase().includes(c.name.contains.toLowerCase())));
      return take ? rows.slice(0,take) : rows;
    });
    s.prisma.$queryRawUnsafe.mockImplementation(async (_sql:string, _ws:string[], ...patterns:string[]) => inventory.filter(n=>patterns.some(p=>JSON.stringify(n.digestJson || {}).toLowerCase().includes(p.slice(1,-1).toLowerCase()))).slice(0,100).map(n=>({id:n.id})));
    s.contentIndexer = { grepFile:jest.fn().mockImplementation(async (p:string)=>p==='old-report'?[{line:90,snippet:'验收编号 ARCHIVE-2024-771'}]:[]),getExtractedText:jest.fn().mockResolvedValue(null) };
    // Stored DB metadata contains only a generic summary, so the metadata query returns no match.
    // The old document is outside the recent window and its neutral title does not match.
    const result = await s.searchContent(uid, undefined, 'ARCHIVE-2024-771', undefined, []);
    expect(result.some((r:any)=>r.id==='old-report')).toBe(true);
  });
});
