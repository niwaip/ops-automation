const fs=require('fs'),path=require('path'),vm=require('vm');
const root=process.cwd(),wb=path.join(root,'apps/backend/governance/workbench');
const ts=require(require.resolve('typescript',{paths:[wb]})),JSZip=require(require.resolve('jszip',{paths:[wb]}));
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true,esModuleInterop:true}}).outputText,f);
const b=require(path.join(root,'apps/backend/capabilities/document-domain/runtime-facade/contract-review/contract-review-html-client-script.builder.ts'));
const js=b.buildContractReviewClientScript({findings:[],comments:[]}).match(/<script>([\s\S]*?)<\/script>/)[1];
const fixed=js.replace("return;\n      const clauseHeadingEl", "return;\n      }\n      const clauseHeadingEl");
try{new vm.Script(fixed);console.log('IN_MEMORY_SINGLE_BRACE_CORRECTION: PASS')}catch(e){console.log(e.message)}
const {DocxCommentInjectorService}=require(path.join(wb,'src/coordination/docx-comment-injector.service.ts'));const svc=new DocxCommentInjectorService();
(async()=>{
 const dir=path.join(root,'docs/artifacts/sample-contracts');
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.docx'))){
  const src=await JSZip.loadAsync(fs.readFileSync(path.join(dir,name)));const original=await src.file('word/document.xml').async('string');
  const p=[...original.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(m=>m[0].replace(/<[^>]+>/g,'').trim());
  const target=p.slice(1).find(t=>t.length>=12&&!t.includes('&'));
  const buf=await svc.injectCommentsIntoDocxBuffer(await src.generateAsync({type:'nodebuffer'}),[{id:1,author:'审计',text:'新增审计批注',anchorText:target}]);
  const out=await JSZip.loadAsync(buf);const xml=await out.file('word/document.xml').async('string');
  const strip=s=>s.replace(/<w:commentRangeStart\b[^>]*\/>|<w:commentRangeEnd\b[^>]*\/>/g,'').replace(/<w:r><w:rPr><w:rStyle w:val="CommentReference"\/><\/w:rPr><w:commentReference w:id="\d+"\/><\/w:r>/g,'');
  console.log('SAMPLE',name,'BODY_PRESERVED',strip(xml)===strip(original));
 }
})().catch(e=>{console.error(e);process.exitCode=1});
