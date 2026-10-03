const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=process.cwd(),wb=path.join(root,'apps/backend/governance/workbench');
const ts=require(require.resolve('typescript',{paths:[wb]})),JSZip=require(require.resolve('jszip',{paths:[wb]}));
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,esModuleInterop:true}}).outputText;
require.extensions['.ts']=(m,f)=>m._compile(compile(fs.readFileSync(f,'utf8')),f);
const {DocxCommentInjectorService}=require(path.join(wb,'src/coordination/docx-comment-injector.service.ts'));
const {escapeXml}=require(path.join(wb,'src/coordination/docx-xml.util.ts'));
const {DocxClauseLocatorService}=require(path.join(wb,'src/coordination/docx-clause-locator.service.ts'));
const svc=new DocxCommentInjectorService();
async function fixture(lines,comments=''){
 const z=new JSZip();z.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');z.file('word/_rels/document.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
 z.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+lines.map((s,i)=>'<w:p><w:r><w:rPr>'+((i===0||/^第.+条/.test(s))?'<w:b/>':'<w:color w:val="336699"/>')+'</w:rPr><w:t>'+escapeXml(s)+'</w:t></w:r></w:p>').join('')+'</w:body></w:document>');
 if(comments)z.file('word/comments.xml',comments);return z.generateAsync({type:'nodebuffer'});
}
async function doc(result){const z=await JSZip.loadAsync(result.buffer);return await z.file('word/document.xml').async('string')}
function structure(xml){const stack=[],bad=[];for(const m of xml.matchAll(/<\/?([\w:]+)\b[^>]*>/g)){const tag=m[1],raw=m[0];if(raw.startsWith('</')){stack.pop();continue}const parent=stack.at(-1);if((tag==='w:r'||tag==='w:commentRangeStart'||tag==='w:commentRangeEnd')&&parent==='w:r')bad.push({tag,parent});if(!raw.endsWith('/>'))stack.push(tag)}return bad}
const item=(id,text,extra={})=>({id,author:'审计',text,...extra});
(async()=>{
 const builder=require(path.join(root,'apps/backend/capabilities/document-domain/runtime-facade/contract-review/contract-review-html-client-script.builder.ts'));
 new vm.Script(builder.buildContractReviewClientScript({findings:[],comments:[]}).match(/<script>([\s\S]*?)<\/script>/)[1]);console.log('CLIENT_SYNTAX PASS');
 const input=await fixture(['标题','第一条 知识产权','本段前文R&D成果归属知识产权及后文']);
 const exact=await svc.injectCommentsDetailed(input,[item('client-a','关于知识产权的修改意见',{anchorText:'R&D成果归属知识产权'})]);
 console.log('ENTITY_ANCHOR',exact.injectedComments);console.log('INVALID_RUN_CHILDREN',JSON.stringify(structure(await doc(exact))));
 try{await svc.injectCommentsDetailed(Buffer.alloc(120,65),[item('x','批注意见')]);console.log('INVALID_DOCX ACCEPTED')}catch(e){console.log('INVALID_DOCX REJECTED')}
 const un=await svc.injectCommentsDetailed(input,[item('x','无法定位的批注意见',{clauseTitle:'不存在的标题',anchorText:'不存在的引用'})]);console.log('UNRESOLVED',un.injectedCount,un.unresolvedCount);
 const dup=await fixture(['标题','第一条 付款','提交材料并办理手续','第二条 交付','提交材料并办理手续']);
 const amb=await svc.injectCommentsDetailed(dup,[item('amb','重复引用的修改意见',{anchorText:'提交材料并办理手续'})]);console.log('AMBIGUOUS_ACCEPTED',amb.injectedCount,amb.unresolvedCount,amb.injectedComments);
 const scoped=await svc.injectCommentsDetailed(dup,[item('s','有标题的修改意见',{clauseTitle:'交付',anchorText:'提交材料并办理手续'})]);console.log('SCOPED_TARGET',scoped.injectedComments);
 const identical=await svc.injectCommentsDetailed(dup,[item('same-a','两个条款均需要明确付款期限',{clauseTitle:'付款'})]);
 const legitimate=await svc.injectCommentsDetailed(identical.buffer,[item('same-b','两个条款均需要明确付款期限',{clauseTitle:'交付',author:'另一位审阅人'})]);console.log('LEGITIMATE_SAME_TEXT_NEW_CLAUSE',legitimate.injectedCount);
 const existingXml='<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="1" w:author="原作者"><w:p><w:r><w:t>原来的批注</w:t></w:r></w:p></w:comment></w:comments>';
 const collision=await svc.injectCommentsDetailed(await fixture(['标题','第一条 付款'],existingXml),[item(1,'全新的一条有效批注意见',{clauseTitle:'付款'})]);console.log('CLIENT_WORD_ID_COLLISION',collision.injectedCount);
 const loc=new DocxClauseLocatorService(),paras=loc.parseParagraphs((await JSZip.loadAsync(await fixture(['标题','第一条 付款','第二条 交付']))).file('word/document.xml')?await (await JSZip.loadAsync(await fixture(['标题','第一条 付款','第二条 交付']))).file('word/document.xml').async('string'):'');
 const bounds=loc.discoverClauseBoundaries(paras);console.log('CHINESE_CLAUSE_NUMBER_ONLY',loc.locateComment(item('cn','条款意见',{clauseNumber:'第二条'}),paras,bounds));
 const twice1=await svc.injectCommentsDetailed(input,[item('client-long','长于五个字的幂等批注意见',{anchorText:'R&D成果归属知识产权'})]);
 const twice2=await svc.injectCommentsDetailed(twice1.buffer,[item('client-long','长于五个字的幂等批注意见',{anchorText:'R&D成果归属知识产权'})]);console.log('SIMPLE_RETRY_NEW_COUNT',twice2.injectedCount);
 const escaped1=await svc.injectCommentsDetailed(input,[item('client-entity','请确认R&D成果属于谁',{anchorText:'R&D成果归属知识产权'})]);
 const escaped2=await svc.injectCommentsDetailed(escaped1.buffer,[item('client-entity','请确认R&D成果属于谁',{anchorText:'R&D成果归属知识产权'})]);console.log('ENTITY_RETRY_NEW_COUNT',escaped2.injectedCount);
 const r=await svc.injectCommentsDetailed(input,[item('p','原始意见长于五个字',{anchorText:'R&D成果归属知识产权'}),item('r','回复意见长于五个字',{parentCommentId:'p',anchorText:'R&D成果归属知识产权'})]);const rz=await JSZip.loadAsync(r.buffer);console.log('REPLY_PACKAGE',Object.keys(rz.files).filter(n=>/comment/i.test(n)),(await rz.file('word/comments.xml').async('string')).includes('w:parentCommentId'));
 const procFile=path.join(wb,'src/coordination/coordination-action.processor.ts'),mod={exports:{}};
 const req=n=>{if(n==='./docx-comment-injector.service')return require(path.join(wb,'src/coordination/docx-comment-injector.service.ts'));if(n.startsWith('.'))return {CoordinationTaskStatus:{pending:'pending',approved:'approved',rejected:'rejected',completed:'completed'},BUILT_IN_WORKFLOW_TEMPLATES:[]};return require(require.resolve(n,{paths:[wb]}))};
 vm.runInThisContext('(function(require,module,exports){'+compile(fs.readFileSync(procFile,'utf8'))+'\n})')(req,mod,mod.exports);
 const Processor=mod.exports.CoordinationActionProcessor,logs={log(){},warn(){},error(){}};
 async function processCase(label,draft,sourceBuffer=input){
 let saved=0;const dto={action:'reject',parameters:{reviewDraft:draft},attachments:[{name:'历史原稿.docx',attachmentId:'att_old',url:'/att_old'}]};
 const payload={workflowId:'wf',currentStage:'legal',attachments:dto.attachments,parameters:{},initiator:{}};
 const processor=new Processor({},logs,async()=>({unifiedPayload:{}}),async()=>({id:'u',username:'审计'}),async()=>({}),{async executeTransition(){throw new Error('AUDIT_STOP_AFTER_INJECTION')}},{getWorkflowById(){return {processDefinition:{stages:[{id:'legal'}]}}}},undefined,{async getAttachment(){return {buffer:sourceBuffer}},async saveAttachment(a){saved++;return {name:a.originalname,url:'/saved.docx'}}},svc);
 try{await processor.executeActionProcess('u','t',dto,{id:'t',unifiedPayload:payload})}catch(e){if(e.message!=='AUDIT_STOP_AFTER_INJECTION')throw e}
 console.log(label,JSON.stringify({saved,hasAnnotatedDocx:dto.parameters.hasAnnotatedDocx,error:dto.parameters.commentInjectionError,stats:dto.parameters.commentInjectionStats}));
 }
 await processCase('MISSING_BOUND_SOURCE_FALLS_BACK',{sourceAttachmentId:'att_missing',sourceDocumentHash:'wrong-hash',stagedComments:[{id:'a',text:'一条有效的修改意见',clauseTitle:'知识产权'}]});
 await processCase('ALL_UNRESOLVED_MARKED_ANNOTATED',{stagedComments:[{id:'a',text:'一条未定位的修改意见',clauseTitle:'完全不存在'}]});
 await processCase('INVALID_SOURCE_ERROR_FLOW_CONTINUES',{stagedComments:[{id:'a',text:'一条有效的修改意见',clauseTitle:'知识产权'}]},Buffer.alloc(120,65));
})().catch(e=>{console.error(e);process.exitCode=1});
