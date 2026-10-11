const fs=require('fs'),vm=require('vm'),ts=require('/Users/chain/Documents/MyProject/ops-automation/node_modules/typescript');
const {EventEmitter}=require('events');
const root='/Users/chain/Documents/MyProject/ops-automation';
const base=root+'/apps/backend/execution-control/session-broker/src/modules/user-sandbox/';
const noop=()=>()=>{};
const common={Injectable:noop,Optional:noop,Controller:noop,UseGuards:noop,Post:noop,Get:noop,Delete:noop,Body:noop,Query:noop,Param:noop,Res:noop,Logger:class {log(){}warn(){}},BadRequestException:class extends Error{},NotFoundException:class extends Error{},ConflictException:class extends Error{}};
function load(file){
 const source=fs.readFileSync(file,'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021,experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;
 const module={exports:{}};
 const req=n=>n==='@nestjs/common'?common:n==='@nestjs/swagger'?{ApiTags:noop,ApiOperation:noop,ApiResponse:noop}:n.startsWith('.')?{}:require(n);
 vm.runInNewContext(js,{module,exports:module.exports,require:req,Buffer,setTimeout,clearTimeout,console,process},{filename:file});return module.exports;
}
const {UserSandboxHarnessService:H}=load(base+'user-sandbox-harness.service.ts');
const {UserSandboxController:C}=load(base+'user-sandbox.controller.ts');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const result={exitCode:0,stdout:'ok',stderr:'',durationMs:1,containerName:'mock'};
(async()=>{
 const evidence={};
 // Same-session state is overwritten by a queued request before the first execution reads it.
 let history;let attachments;const readGate=deferred(),secondLockGate=deferred();let ordinal=0;let reads=[];
 const storage={sanitizeUserId:u=>u,writeSessionHistory:(u,s,h)=>history=h,writeSessionAttachments:(u,s,f)=>attachments=f};
 const lock={acquireSandboxLock:async()=>{ordinal++;const n=ordinal;if(n===2)await secondLockGate.promise;return {success:true,token:'mock'+n}},releaseSandboxLock:async(u,t)=>{if(t==='mock1')secondLockGate.resolve();return true}};
 const h=new H(storage,{},lock);
 const executor=async(u,cmd)=>{if(cmd[2]==='first')await readGate.promise;reads.push({prompt:cmd[2],history:history[0].content,attachments:[...attachments]});return result};
 const first=h.runHarness('user','first',{sessionId:'same',history:[{role:'user',content:'first-history'}],files:['first.txt']},executor);
 await Promise.resolve();
 const second=h.runHarness('user','second',{sessionId:'same',history:[{role:'user',content:'second-history'}],files:['second.txt']},executor);
 readGate.resolve();await first;await second;evidence.pre_lock_input_overwrite={reads,first_read_second_history:reads.find(x=>x.prompt==='first').history==='second-history'};
 // Response closes while queued; current controller has no cancellation state carried into lock acquisition.
 const queue=deferred();let stopped=0,executed=false;
 const service={runHarness:async(u,p,o)=>{await queue.promise;o.onLockAcquired();executed=true;return {success:true,output:'mock'}},stopSandboxExecution:async()=>{stopped++;return true}};
 const res=new EventEmitter();res.writableEnded=false;res.setHeader=()=>{};res.write=()=>true;res.end=()=>{res.writableEnded=true};
 const running=new C(service).runHarnessStream({userId:'user',prompt:'queued',sessionId:'B'},res);
 res.emit('close');queue.resolve();await running;
 evidence.queued_disconnect={executed_after_disconnect:executed,stop_calls:stopped};
 // Stop releases lock before kill confirmation.
 const events=[];
 const stopH=new H({sanitizeUserId:u=>u},{getContainerName:()=> 'mock',findContainer:async()=>{events.push('find_container');return {exec:async()=>{events.push('create_kill_exec');return {start:async()=>{events.push('start_kill_exec')}}}}}},{forceReleaseSandboxLock:async()=>events.push('release_lock')});
 await stopH.stopSandboxExecution('user','session');evidence.stop_lock_order={events};
 // inspect failure is reported as exit code zero.
 const stream=new EventEmitter();const exec={start:(opts,cb)=>{cb(null,stream);setImmediate(()=>stream.emit('end'))},inspect:async()=>{throw new Error('inspect failed')}};
 const inspectH=new H({sanitizeUserId:u=>u},{getContainerName:()=> 'mock',ensureUserSandbox:async()=>{},findContainer:async()=>({exec:async()=>exec}),getExecutionEnvironment:()=>[],getDockerClient:()=>({}),recordActivity:()=>{}});
 evidence.inspect_failure=await inspectH.executeInSandbox('user',['mock'],{timeoutMs:1000});
 fs.writeFileSync('/tmp/personal-mode-audit-broker-probes.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
