import axios from 'axios';
import {Logger} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {executeContractCompareOrchestration} from '../src/modules/execution/adapters/contract/contract-compare-orchestrator';
jest.mock('axios');
const post=axios.post as jest.Mock;
const dir=path.resolve(process.cwd(),'../../../../docs/artifacts/reviews/contract-compare-reaudit2/run-2026-10-18T07-26-52.918Z/isolated');
const selected='d13e0d30-87b9-4e87-b96a-d8b1b3cf78af';
let calls:any[]=[];
const pairs=()=>[{id:'pair-pay',status:'MODIFIED',sourceClause:{content:'30日内付款'},targetClause:{content:'180日内付款'},similarity:0.8,aiInsight:{summary:'账期延长',riskLevel:'MEDIUM'}}];
async function invoke(id:string,input:any,model:any){
 calls=[];post.mockImplementation(async(url:string,body:any)=>{
  if(url.endsWith('/diff'))return{data:{output:{fileNameA:'A.txt',fileNameB:'B.txt',alignedClauses:pairs(),metrics:{totalClauses:1,modifiedCount:1}}}};
  if(url.endsWith('/ai/model/call')){calls.push(body);if(model instanceof Error)throw model;return{data:{result:JSON.stringify(model)}};}
  if(url.endsWith('/render-report'))return{data:{output:{summary:'比对完成',artifact:{url:'synthetic'},artifacts:[]}}};
  throw Error('unexpected URL '+url);
 });
 const request:any={executionId:'compare-isolated-'+id,stepId:'n1',skillId:'platform.document.contract-comparator',publishedSkillId:'platform.document.contract-comparator',modelId:selected,metadata:{definitionVersion:'1.0.3',modelId:selected},input};
 const result:any=await executeContractCompareOrchestration(request,'compare-isolated',new Logger('CompareAudit'));
 fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify({isolated:true,id,request,result,modelRequests:calls},null,2));return result;
}
beforeEach(()=>jest.resetAllMocks());
test('C01 valid semantic response enriches the matching clause',async()=>{
 const r=await invoke('C01',{},[{clauseId:'pair-pay',riskLevel:'HIGH',summary:'账期延长增加买方资金安排风险',legalAdvice:'协商调整账期',keyChange:'30→180日'}]);
 expect(r.output.alignedClauses[0].aiInsight.keyChange).toBe('30→180日');
});
test('F01 enableRiskAnalysis=false must skip semantic model calls',async()=>{
 await invoke('F01',{enableRiskAnalysis:false},[{clauseId:'pair-pay',riskLevel:'HIGH',summary:'风险',keyChange:'风险'}]);expect(calls).toHaveLength(0);
});
test('F02 model transport failure must disclose incomplete semantic audit',async()=>{
 const r=await invoke('F02',{},new Error('synthetic ECONNRESET'));
 const disclosed=r.success===false||r.output.reviewStatus==='incomplete'||r.output.metrics?.isDegraded===true||Boolean(r.output.metrics?.warnings?.length);
 expect(disclosed).toBe(true);
});
test('F03 foreign clause IDs must not be silently assigned by array index',async()=>{
 const r=await invoke('F03',{},[{clauseId:'foreign-clause',riskLevel:'HIGH',summary:'外国条款的不相关判断',keyChange:'foreign-insight'}]);
 expect(r.output.alignedClauses[0].aiInsight.keyChange).not.toBe('foreign-insight');
});
test('F04 semantic model request must preserve caller selected model',async()=>{
 await invoke('F04',{},[{clauseId:'pair-pay',riskLevel:'HIGH',summary:'风险',keyChange:'风险'}]);expect(calls[0].modelId).toBe(selected);
});
test('F05 documented Chinese party input must not silently become neutral position',async()=>{
 await invoke('F05',{myPosition:'甲方'},[{clauseId:'pair-pay',riskLevel:'HIGH',summary:'风险',keyChange:'风险'}]);
 expect(calls[0].prompt).not.toContain('【我方立场】: 中立客观商事法务专家');
});

test('F06 duplicate semantic IDs must disclose incomplete review',async()=>{
 const r=await invoke('F06',{},[{clauseId:'pair-pay',riskLevel:'LOW',summary:'无重大变化',keyChange:'低风险'},{clauseId:'pair-pay',riskLevel:'HIGH',summary:'严重风险',keyChange:'高风险'}]);
 expect(r.output.metrics?.isDegraded===true||r.output.reviewStatus==='incomplete').toBe(true);
});
test('F07 missing semantic fields must disclose incomplete review',async()=>{
 const r=await invoke('F07',{},[{clauseId:'pair-pay'}]);expect(r.output.metrics?.isDegraded===true||r.output.reviewStatus==='incomplete').toBe(true);
});
test('F08 empty semantic result must disclose incomplete review',async()=>{
 const r=await invoke('F08',{},[]);expect(r.output.metrics?.isDegraded===true||r.output.reviewStatus==='incomplete').toBe(true);
});
test('F09 unmatched semantic clause must not report complete review',async()=>{
 const r=await invoke('F09',{},[{clauseId:'foreign-clause',riskLevel:'HIGH',summary:'风险',keyChange:'风险'}]);expect(r.output.metrics?.isDegraded===true||r.output.reviewStatus==='incomplete').toBe(true);
});
