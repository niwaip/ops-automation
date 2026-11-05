const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'../../../apps/backend/governance/workbench/dist/integrations/mcp');
const {mcpCapabilitySummary,mcpCatalogEntry}=require(path.join(root,'mcp-skill-metadata.js'));
const {McpSkillCatalogService}=require(path.join(root,'mcp-skill-catalog.service.js'));

test('summaries preserve capabilities separated by parenthetical examples without schemas',()=>{
  const text=mcpCapabilitySummary([{remoteName:'trip',description:'根据用户起终点经纬度坐标规划综合各类公共（火车、公交、地铁）交通方式的通勤方案',inputSchema:{secret:'NO_SCHEMA'}}]);
  assert.ok(text.includes('公共交通'));assert.ok(!text.includes('NO_SCHEMA'));
});
test('summaries have a fixed budget despite very large or duplicated external descriptions',()=>{
  const tools=Array.from({length:100},(_,i)=>({remoteName:'t'+i,description:'能力'+i+'很长'.repeat(2000)}));
  assert.ok(mcpCapabilitySummary(tools).length<=512);
  assert.ok(!mcpCapabilitySummary(tools).includes('能力8'));
  assert.equal(mcpCapabilitySummary([tools[0],tools[0]]).split('；').length,1);
});
test('catalog derives only from visible current tools and retains independent effect policy',async()=>{
  const connections={list:async()=>[{id:'one',name:'Opaque service',status:'active',scope:'personal',configured:true}],
    tools:async()=>[{id:'a',connectionId:'one',description:'查询公共交通路线',remoteName:'trip',effect:'unknown'},
      {id:'b',connectionId:'another',description:'PRIVATE_TOOL_DESCRIPTION',remoteName:'other',effect:'read'}]};
  const [skill]=await new McpSkillCatalogService(connections,{}).list({},'personal');
  assert.ok(skill.description.includes('公共交通'));assert.ok(!skill.description.includes('PRIVATE_TOOL'));
  assert.equal(skill.read_only,false);assert.ok(!JSON.stringify(skill).includes('inputSchema'));
});

test('catalog preview matches the sandbox prompt builder including unicode and truncation',()=>{
  const {spawnSync}=require('node:child_process');
  const skills=[{id:'mcp-one',name:'Service\nName',description:'功能😀'.repeat(80),source:'mcp'},
    {id:'mcp-two',name:'😀'.repeat(90),description:' short\nsummary ',source:'mcp'}];
  const probe=spawnSync('python3',['-c','import sys,json; from dsh_modules.prompt_builder import build_skills_catalog; print(json.dumps(build_skills_catalog(json.load(sys.stdin)),ensure_ascii=False))'],{
    input:JSON.stringify(skills),encoding:'utf8',env:{...process.env,PYTHONPATH:path.resolve(__dirname,'../../../apps/backend/runtimes/personal-sandbox-runner/src')},
  });
  assert.equal(probe.status,0,probe.stderr);
  assert.equal(JSON.parse(probe.stdout).split('\n').slice(1,-1).join('\n'),skills.map(mcpCatalogEntry).join('\n'));
});

function fixture() {
  const id='00000000-0000-4000-8000-000000000001';
  const tools=[{id:'binding',connectionId:id,description:'Full external description',remoteName:'published',effect:'read',inputSchema:{type:'object',properties:{place:{type:'string'}}}}];
  let issues=0;
  const connections={list:async()=>[{id,name:'Dynamic service',status:'active',scope:'personal',configured:true}],tools:async()=>tools};
  const service=new McpSkillCatalogService(connections,{issue:()=>{issues++;return 'opaque-receipt';}});
  return {service,id,tools,get issues(){return issues;}};
}

test('overview has platform instructions and tool index without schemas or invocation receipt',async()=>{
  const f=fixture();const value=await f.service.detail({},'personal','mcp-'+f.id);
  assert.ok(value.instructions.includes('外部 MCP Skill'));assert.ok(value.catalogEntry.includes('Dynamic service'));
  assert.equal(value.tools.length,1);assert.ok(!JSON.stringify(value).includes('inputSchema'));assert.equal(f.issues,0);
});
test('single tool preview is read only and checks current visibility',async()=>{
  const f=fixture();const value=await f.service.previewTool({},'personal','mcp-'+f.id,'published');
  assert.equal(value.description,'Full external description');assert.equal(value.inputSchema.type,'object');
  assert.ok(!('contractToken' in value));assert.equal(f.issues,0);
  await assert.rejects(()=>f.service.previewTool({},'work','mcp-'+f.id,'published'));
  await assert.rejects(()=>f.service.previewTool({},'personal','mcp-'+f.id,'unpublished'));
  f.tools.length=0;
  await assert.rejects(()=>f.service.previewTool({},'personal','mcp-'+f.id,'published'));
});
