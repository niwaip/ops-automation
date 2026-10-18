import {MultiNodeParameterBinderService} from './multi-node-parameter-binder.service';
import {NodeOutputBindingResolverService} from './node-output-binding-resolver.service';
import {DeterministicParamResolverService} from '../params/deterministic-param-resolver.service';
import * as fs from 'fs';import * as path from 'path';
const evidenceDir = process.env.EVIDENCE_DIR || (fs.existsSync('/workspace') ? '/workspace/docs/artifacts/reviews/contract-compare-reaudit3/run-2026-10-18T10-34-17.378Z/position-fault' : path.join(process.cwd(), 'docs/artifacts/reviews/contract-compare-reaudit3/run-2026-10-18T10-34-17.378Z/position-fault'));
test.each([['甲方（买方）','buyer'],['乙方（卖方）','seller']])('preserves explicit %s when model recognition has no usable result',async(role,expected)=>{
 const recognizer={recognizeParams:jest.fn().mockResolvedValue({params:{},confidence:0,debug:{notes:['synthetic recognizer timeout or malformed response']}})};
 const binder=new MultiNodeParameterBinderService(new NodeOutputBindingResolverService(),recognizer as any,new DeterministicParamResolverService());
 const card:any={id:'platform.document.contract-comparator',displayName:'合同智能比对',inputs:{myPosition:'string'},outputs:{},_rawInputSchema:{properties:{myPosition:{type:'string'}},required:[]}};
 const result=await binder.bindParameters(`请比对两份合同，我方为${role}。`,[{ref:'n1',capabilityKey:card.id,dependsOn:[]}],new Map([[card.id,card]]));
 fs.mkdirSync(evidenceDir,{recursive:true});fs.writeFileSync(path.join(evidenceDir,expected+'.json'),JSON.stringify({isolated:true,role,expected,result,recognizerCalls:recognizer.recognizeParams.mock.calls.length},null,2));
 expect(result.planInputs.n1.myPosition).toBe(expected);
});
