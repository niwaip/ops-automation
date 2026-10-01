const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = process.cwd();
const wb = path.join(root, 'apps/backend/governance/workbench');
const ts = require(require.resolve('typescript', {paths:[wb]}));
const JSZip = require(require.resolve('jszip', {paths:[wb]}));
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,esModuleInterop:true}}).outputText,f);
const builder = require(path.join(root,'apps/backend/capabilities/document-domain/runtime-facade/contract-review/contract-review-html-client-script.builder.ts'));
const html = builder.buildContractReviewClientScript({findings:[],comments:[]});
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
try { new vm.Script(code); console.log('CLIENT_SYNTAX: PASS'); } catch(e) { console.log('CLIENT_SYNTAX: FAIL', e.message); console.log(e.stack.split('\n').slice(0,6).join('\n')); }
const {DocxCommentInjectorService} = require(path.join(wb,'src/coordination/docx-comment-injector.service.ts'));
const svc = new DocxCommentInjectorService();
const c = {id:1,author:'审计',text:'审计批注'};
async function inspect(label, text, item) {
 const src=await svc.createMinimalDocxFromText('审计合同',text);
 const out=await svc.injectCommentsIntoDocxBuffer(src,[{...c,...item}]);
 const z=await JSZip.loadAsync(out); const xml=await z.file('word/document.xml').async('string');
 const tagged=[...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].filter(m=>m[0].includes('commentRangeStart')).map(m=>m[0].replace(/<[^>]+>/g,'').trim());
 console.log(label, JSON.stringify(tagged));
}
(async()=>{
 await inspect('ZERO_BASED index=1 SHOULD 第二条','第一条 付款约定\n第二条 交付要求',{clauseId:'1'});
 await inspect('HEADING index=2 SHOULD 知识产权','1.1 子项说明\n付款约定：\n知识产权：',{clauseId:'2'});
 await inspect('DUPLICATE_ANCHOR SHOULD 第三条','第一条 提交材料并办理手续，适用付款流程\n第二条 交付义务\n第三条 提交材料并办理手续，适用知识产权流程',{anchorText:'提交材料并办理手续',clauseId:'3',clauseTitle:'第三条'});
 await inspect('MISSING_ANCHOR SHOULD unresolved','第一条 付款约定及流程说明\n第二条 交付要求及流程说明',{clauseId:'99',clauseTitle:'不存在条款',anchorText:'原文不存在的引用'});
 await inspect('XML_ENTITY SHOULD 第二条','第一条 其他无关正文内容说明\n第二条 R&D成果归属知识产权',{anchorText:'R&D成果归属知识产权'});
 const invalid=await svc.injectCommentsIntoDocxBuffer(Buffer.from('not a docx'),[c]);
 const z=await JSZip.loadAsync(invalid); console.log('INVALID_INPUT_BECOMES_SUCCESS', (await z.file('word/document.xml').async('string')).replace(/<[^>]+>/g,'').trim());
 const src=await svc.createMinimalDocxFromText('测试','第一条 付款约定与相关说明'); const once=await svc.injectCommentsIntoDocxBuffer(src,[c]); const twice=await svc.injectCommentsIntoDocxBuffer(once,[c]);
 const zz=await JSZip.loadAsync(twice);console.log('RETRY_COMMENT_COUNT', [...(await zz.file('word/comments.xml').async('string')).matchAll(/<w:comment\s/g)].length);
 console.log('APPROVAL_OPINIONS_EXTRACTION',svc.extractCommentsFromAction({parameters:{reviewDraft:{approvalOpinions:[{findingId:'f1',opinion:'修改付款期限',status:'accepted'}]}}}).length);
})().catch(e=>{console.error(e);process.exitCode=1});
