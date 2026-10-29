// Uses the running service's own signing secret in memory; never logs credentials.
const crypto = require('crypto');
const fs = require('fs');
async function main() {
  const user = 'e7fce333-a8f4-4097-9a53-f0a4c729da46';
  const exp = String(Math.floor(Date.now()/1000)+120);
  const secret = process.env.INTERNAL_API_SHARED_SECRET || process.env.INTERNAL_API_SECRET;
  if (!secret) throw new Error('Missing internal signing configuration');
  const signature = crypto.createHmac('sha256',secret).update(`${user}:${exp}`).digest('base64url');
  const token = `sandbox-user-token-${user}.${exp}.${signature}`;
  const root = '/workspace/docs/artifacts/reviews/pdf-workflow-resilience-20261029';
  const summary = JSON.parse(fs.readFileSync(`${root}/replay-summary.json`));
  const path = summary[1].previews[2].replace('/out',root);
  const image = fs.readFileSync(path).toString('base64');
  const before = Date.now();
  const response = await fetch('http://127.0.0.1:3007/ai/proxy/v1/chat/completions', {
    method:'POST',signal:AbortSignal.timeout(40000),
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({model:'vision',thinking:false,max_tokens:1200,stream:false,
      messages:[{role:'user',content:[{type:'text',text:'检查此PDF页面有无缺字、重叠、未渲染的Markdown表格。首行仅PASS或REPAIR，最多三条问题。不判断新闻真实性。'},
        {type:'image_url',image_url:{url:`data:image/png;base64,${image}`}}]}]})
  });
  const data = await response.json();
  const result = {status:response.status,elapsed_ms:Date.now()-before,model:data.model,
    finish_reason:data.choices?.[0]?.finish_reason,content:data.choices?.[0]?.message?.content,
    error:data.error?.message || data.message,usage:data.usage};
  fs.writeFileSync(`${root}/live-vision-result.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  if(!response.ok || !result.content) process.exitCode=1;
}
main().catch(error=>{ console.error(error.name, error.message); process.exitCode=1; });
