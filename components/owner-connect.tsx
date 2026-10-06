'use client';
import {useEffect,useState} from 'react';
import {BRIDGE_PROTOCOL,MAX_RESPONSE_BYTES,SESSION_MS,allowedRequest,validNonce} from '@/lib/owner-bridge-protocol';
export function OwnerConnect({localOrigin}:{localOrigin:string}) {
  const [status,setStatus] = useState('Connecting to your local desk…');
  useEffect(() => {
    const parent = window.opener;
    if (!parent) {setStatus('Sign-in is complete. Close this window, then choose Connect again in your local desk.'); return;}
    let nonce='', expires=0, pending=0, initializing=false;
    const seen=new Set<string>(); const controllers=new Set<AbortController>();
    const send=(value:object)=>parent.postMessage({protocol:BRIDGE_PROTOCOL,...value},localOrigin);
    const ready=()=>{if(!nonce)send({type:'ready'});}; ready();
    const timer=setInterval(ready,2000);
    async function receive(event:MessageEvent) {
      if (event.origin!==localOrigin || event.source!==parent || event.data?.protocol!==BRIDGE_PROTOCOL) return;
      const message=event.data;
      if (message.type==='init' && !nonce && !initializing && validNonce(message.nonce)) {
        initializing=true;
        try {const response=await fetch('/api/admin',{credentials:'same-origin',cache:'no-store',redirect:'manual'});if(!response.ok)throw Error();nonce=message.nonce;expires=Date.now()+SESSION_MS;setStatus('Connected. Keep this window open while you use your local desk.');send({type:'connected',nonce});}
        catch {setStatus('The owner session could not be verified. Reconnect from your local desk.');send({type:'rejected'});}
        finally {initializing=false;} return;
      }
      if (message.type!=='request' || !nonce || message.nonce!==nonce || Date.now()>expires || !/^[a-f0-9]{32}$/.test(message.id) || seen.has(message.id) || pending>=8 || !allowedRequest(message.path,message.method,message.body)) return;
      seen.add(message.id);pending++;
      const controller=new AbortController();controllers.add(controller);
      const timeout=setTimeout(()=>controller.abort(),600000);
      try {
        const response=await fetch(message.path,{method:message.method,body:message.body,headers:message.method==='POST'?{'Content-Type':'application/json'}:{},credentials:'same-origin',cache:'no-store',redirect:'manual',signal:controller.signal});
        if(response.status>=300&&response.status<400 || response.type==='opaqueredirect')throw Error('The owner session needs reconnecting.');
        const reader=response.body?.getReader();let count=0,text='';const decoder=new TextDecoder();
        if(reader)try {while(true){const part=await reader.read();if(part.done)break;count+=part.value.byteLength;if(count>MAX_RESPONSE_BYTES){await reader.cancel();throw Error('This response is too large to transfer.');}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
        send({type:'response',nonce,id:message.id,status:response.status,contentType:response.headers.get('content-type')||'application/json',text});
      } catch {send({type:'response',nonce,id:message.id,status:503,contentType:'application/json',text:JSON.stringify({error:'The request could not complete. Check the connection and retry.'})});}
      finally {clearTimeout(timeout);controllers.delete(controller);pending--;}
    }
    window.addEventListener('message',receive);
    return()=>{clearInterval(timer);window.removeEventListener('message',receive);controllers.forEach(c=>c.abort());};
  },[localOrigin]);
  return <main className="owner-connection"><span>JEW KNOWS</span><h1>Your private connection.</h1><p role="status">{status}</p><p>Your account stays in this window. No service credentials are sent to the local desk.</p></main>;
}
