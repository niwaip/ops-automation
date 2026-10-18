import fs from 'node:fs';
import crypto from 'node:crypto';
export const digest = value => crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export function save(file,value){fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2));}
export async function login(){
  const r=await fetch(`${process.env.CRW_PLATFORM_URL||'http://127.0.0.1:3001'}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:process.env.CRW_USERNAME||'test',password:process.env.CRW_PASSWORD||'test123'}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error(`Login HTTP ${r.status}`);
  const d=await r.json(); if(!d.accessToken)throw Error('Login missing accessToken'); return d.accessToken;
}
export async function get(token,path){
  const r=await fetch(`${process.env.CRW_CONTROL_URL||'http://127.0.0.1:3003'}${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
  const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={text}}return{status:r.status,data};
}
export async function upload(token,buffer,fileName,mimeType){
  const form=new FormData();form.append('file',new Blob([buffer],{type:mimeType}),fileName);
  const r=await fetch(`${process.env.CRW_CHAT_URL||'http://127.0.0.1:3007'}/ai/chat/upload`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form,signal:AbortSignal.timeout(60000)});
  const data=await r.json();if(!r.ok)throw Error(`Upload HTTP ${r.status}: ${data.message}`);return data;
}
export async function stream(token,payload,dir){
  save(`${dir}/request.json`,payload);
  const start=Date.now();const events=[];let pending='',raw='',firstEventMs=null,firstContentMs=null,error=null,status=null;
  function parse(line){if(!line.startsWith('data:'))return;const s=line.slice(5).trim();if(s==='[DONE]')return;
    try{const event=JSON.parse(s);const elapsedMs=Date.now()-start;events.push({elapsedMs,event});firstEventMs??=elapsedMs;if(event.type==='content'&&event.content)firstContentMs??=elapsedMs;save(`${dir}/events.json`,events);}catch{}}
  try{
    const r=await fetch(`${process.env.CRW_CHAT_URL||'http://127.0.0.1:3007'}/ai/chat/stream`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(Number(process.env.CRW_TIMEOUT_MS||600000))});status=r.status;
    const decoder=new TextDecoder();for await(const bytes of r.body){const chunk=decoder.decode(bytes,{stream:true});raw+=chunk;pending+=chunk;const lines=pending.split('\n');pending=lines.pop();for(const line of lines)parse(line);fs.appendFileSync(`${dir}/stream.sse`,chunk);}pending+=decoder.decode();if(pending)parse(pending);
  }catch(e){error=e.message;}
  const values=events.map(x=>x.event);
  const executionId=values.map(e=>e.data?.executionId||e.executionId).find(Boolean)||raw.match(/执行单 ID:?\s*`?([0-9a-f-]{36})/)?.[1]||null;
  const traceIds=[...new Set(values.flatMap(e=>[e.traceId,e.data?.traceId]).filter(Boolean))];
  return{httpStatus:status,executionId,traceIds,firstEventMs,firstContentMs,totalMs:Date.now()-start,error,events};
}
export function findOutput(value){
  if(!value||typeof value!=='object')return null;
  if(Array.isArray(value.clauses)&&value.metrics)return value;
  for(const [k,v]of Object.entries(value)){if(['htmlReport','__promptDebug'].includes(k))continue;const found=findOutput(v);if(found)return found;}return null;
}
export function assertion(name,passed,actual,category='CONTRACT'){return{name,passed:Boolean(passed),actual:actual??null,category};}
