import React, { useEffect, useRef, useState } from '/Users/chain/Documents/MyProject/ops-automation/node_modules/react';
import { createRoot } from '/Users/chain/Documents/MyProject/ops-automation/node_modules/react-dom/client';
import MessageContentRenderer from '/Users/chain/Documents/MyProject/ops-automation/apps/frontend/shared/chat-web/components/MessageContentRenderer';
import { ChatDeliveryPanel } from '/Users/chain/Documents/MyProject/ops-automation/apps/frontend/user-web/src/features/chat/components/ChatDeliveryPanel';
import { reduceChatStreamEvent } from '/Users/chain/Documents/MyProject/ops-automation/packages/user-core/dist/domain/chat/streamEvent.js';
const body = '已完成核验。\n\n| 部门 | 金额（K） |\n|---|---:|\n| 示例部门 | 12.34 |\n\n有一项旧预测保留，请核对。';
function App() {
 const [message,setMessage]=useState<any>({role:'assistant',content:body,isStreaming:false,metadata:{mode:'chat'}});
 const [proof,setProof]=useState<any>(null);
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  let changes=0;const originalNode=host.current!.firstElementChild;
  const before=host.current!.getBoundingClientRect();
  const observer=new MutationObserver(()=>{changes++});observer.observe(host.current!,{subtree:true,childList:true,characterData:true});
  const apply=(event:any)=>setMessage((previous:any)=>{
   const reduced=reduceChatStreamEvent({event,accumulatedContent:previous.content,mode:'chat'});
   return {...previous,...reduced.messagePatch,metadata:{...previous.metadata,...reduced.messagePatch.metadata}};
  });
  const a=setTimeout(()=>apply({type:'result',content:'',data:{artifactsOnly:true,artifacts:[{name:'示例结果.xlsx',downloadUrl:'/api/ai/chat/workspace-files/me/example.xlsx'}]}}),100);
  const b=setTimeout(()=>apply({type:'observation',content:'附件元数据已完成',data:{progressOnly:true}}),200);
  const c=setTimeout(()=>{const after=host.current!.getBoundingClientRect();observer.disconnect();setProof({bodyMutationCount:changes,bodyNodePreserved:host.current!.firstElementChild===originalNode,bodyTopUnchanged:after.top===before.top,bodyHeightUnchanged:after.height===before.height,readableBody:host.current!.textContent});},400);
  return()=>{observer.disconnect();clearTimeout(a);clearTimeout(b);clearTimeout(c)};
 },[]);
 return <main style={{maxWidth:900,margin:'40px auto',fontFamily:'system-ui',lineHeight:1.7}}>
 <h1>正文与附件独立交付验证</h1><div id="answer-body" ref={host}><MessageContentRenderer content={message.content} mode="markdown" isStreaming={false}/></div>
 <ChatDeliveryPanel message={message}/><h2>自动验证结果</h2><pre id="proof">{JSON.stringify(proof,null,2)}</pre></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
