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
const {injectCommentRangeIntoParagraph}=require(path.join(wb,'src/coordination/docx-xml.util.ts'));
const crypto=require('crypto');
async function rawFixture(paragraph,comments){const z=await JSZip.loadAsync(await fixture(['标题']));let x=await z.file('word/document.xml').async('string');z.file('word/document.xml',x.replace('</w:body>',paragraph+'</w:body>'));if(comments)z.file('word/comments.xml',comments);return z.generateAsync({type:'nodebuffer'})}
(async()=>{
 const input=await fixture(['标题','第一条 知识产权','R&D成果归属知识产权及后文']);
 const two=await svc.injectCommentsDetailed(input,[item('a','第一条独立批注意见',{anchorText:'R&D成果归属知识产权'}),item('b','第二条独立批注意见',{anchorText:'R&D成果归属知识产权'})]);
 const z=await JSZip.loadAsync(two.buffer),xml=await doc(two);console.log('MULTI_COMMENT_RANGES',JSON.stringify([...xml.matchAll(/<w:commentRangeStart w:id="([^"]+)"/g)].map(m=>m[1])),'REPORT_COUNT',two.injectedCount,'COMMENT_REFERENCES',JSON.stringify([...xml.matchAll(/<w:commentReference w:id="([^"]+)"/g)].map(m=>m[1])));
 const p='<w:p><w:bookmarkStart w:id="9" w:name="target"/><w:hyperlink r:id="rIdLink"><w:r><w:rPr><w:color w:val="123456"/></w:rPr><w:t>知识产权划词内容</w:t></w:r></w:hyperlink><w:bookmarkEnd w:id="9"/></w:p>';
 const rewritten=injectCommentRangeIntoParagraph(p,'1','知识产权');console.log('HYPERLINK_PRESERVED',rewritten.includes('w:hyperlink'),'BOOKMARK_PRESERVED',rewritten.includes('w:bookmarkStart'),'COLOR_PRESERVED',rewritten.includes('123456'));
 const padded=injectCommentRangeIntoParagraph('<w:p>\n<w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>知识产权内容</w:t></w:r></w:p>','1','知识产权');console.log('WHITESPACE_PPR_PRESERVED',padded.includes('w:pPr'));
 const p2='<w:p><w:r><w:t>付款、交付与验收</w:t></w:r></w:p>';const normalized=injectCommentRangeIntoParagraph(p2,'1','付款交付与验收');console.log('NORMALIZED_RANGE_XML',normalized);
 const old='<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="9" w:author="原作者"><w:p><w:r><w:t>旧意见</w:t></w:r></w:p></w:comment></w:comments>';
 const appended=await svc.injectCommentsDetailed(await rawFixture('<w:p><w:r><w:t>知识产权条款内容</w:t></w:r></w:p>',old),[item('new','新增有效的独立意见',{anchorText:'知识产权'})]);const az=await JSZip.loadAsync(appended.buffer);const appendedComments=await az.file('word/comments.xml').async('string');fs.writeFileSync('/private/tmp/third-audit-comments.xml',appendedComments);console.log('APPEND_USES_W14',appendedComments.includes('w14:paraId'),'APPEND_DECLARES_W14',appendedComments.includes('xmlns:w14='));
 const longAnchor='这是一个超过二十个字符的完整合同原文选区需要全部覆盖';const lr=await svc.injectCommentsDetailed(await fixture(['标题',longAnchor]),[item('long','长选区批注意见',{anchorText:longAnchor})]);console.log('LONG_SELECTION_LENGTH',longAnchor.length,'WRITTEN_SNIPPET_LENGTH',lr.injectedComments[0]?.targetTextSnippet.length);
 const procFile=path.join(wb,'src/coordination/coordination-action.processor.ts'),mod={exports:{}};
 const req=n=>{if(n==='./docx-comment-injector.service')return require(path.join(wb,'src/coordination/docx-comment-injector.service.ts'));if(n.startsWith('.'))return {CoordinationTaskStatus:{pending:'pending',approved:'approved',rejected:'rejected',completed:'completed'},BUILT_IN_WORKFLOW_TEMPLATES:[]};return require(require.resolve(n,{paths:[wb]}))};
 vm.runInThisContext('(function(require,module,exports){'+compile(fs.readFileSync(procFile,'utf8'))+'\n})')(req,mod,mod.exports);
 const Processor=mod.exports.CoordinationActionProcessor,logs={log(){},warn(){},error(){}};
 async function processCase(label,report,metadata={}){
 let saved=0,transitioned=false;const dto={action:'reject',parameters:{reviewDraft:{stagedComments:[{id:'a',text:'一条有效的独立批注',anchorText:'R&D成果归属知识产权'}]}},attachments:[{name:'源合同.docx',attachmentId:'att_old',url:'/att_old',...metadata}]};
 const payload={workflowId:'wf',currentStage:'legal',attachments:dto.attachments,parameters:{},initiator:{},reviewReport:report};
 const processor=new Processor({},logs,async()=>({unifiedPayload:{}}),async()=>({id:'u',username:'审计'}),async()=>({}),{async executeTransition(){transitioned=true;throw new Error('AUDIT_STOP')}},{getWorkflowById(){return {processDefinition:{stages:[{id:'legal'}]}}}},undefined,{async getAttachment(){return {buffer:input}},async saveAttachment(a){saved++;return {name:a.originalname,url:'/saved.docx'}}},svc);
 try{await processor.executeActionProcess('u','t',dto,{id:'t',unifiedPayload:payload})}catch(e){if(e.message!=='AUDIT_STOP')throw e}
 console.log(label,JSON.stringify({saved,transitioned,error:dto.parameters.commentInjectionError}));
 }
 const textHash=crypto.createHash('sha256').update('R&D成果归属知识产权及后文','utf8').digest('hex');
 await processCase('TEXT_HASH_AS_FILE_HASH',{sourceAttachmentId:'att_old',sourceDocumentHash:textHash});
 await processCase('METADATA_HASH_BYPASS',{sourceAttachmentId:'att_old',sourceDocumentHash:'deadbeef'},{sha256:'deadbeef'});
 await processCase('VERSION_MISMATCH_FALLBACK',{sourceDocumentVersion:'sha256:missing-version'});
})().catch(e=>{console.error(e);process.exitCode=1});
