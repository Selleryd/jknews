/** Owner-only distribution. OAuth tokens never leave the server or enter exports. */
export type SocialEnv = {SOCIAL_ENCRYPTION_KEY?:string;X_CLIENT_ID?:string;X_CLIENT_SECRET?:string};
export type SocialContext = {db:D1Database;env:SocialEnv;siteOrigin:string;fetch?:typeof fetch};
export type DistributionSettings = {enabledX:boolean;includeSiteLink:boolean;substackUrl:string};
export type SocialBrief = {id:string;date?:string;day?:string;localDate?:string;refreshedAt?:string;sourceCount:number;summary?:string|string[];shareText?:string;items?:Array<{title:string;url?:string;sourceUrl?:string;publisher?:string;sourceName?:string}>};
type XClient = {clientId:string;clientSecret:string};
type XTokens = {accessToken:string;refreshToken:string;expiresAt:number;username:string;userId:string};
type Envelope = {v:1;iv:string;ciphertext:string};
type Delivery = {briefId:string;digest:string;status:'sending'|'sent'|'failed'|'uncertain';attemptedAt:string;postId?:string;username?:string;error?:string;retryAfter?:number};
const defaults:DistributionSettings={enabledX:false,includeSiteLink:false,substackUrl:''};
const b64=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=(text:string)=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));
const encode=(s:string)=>new TextEncoder().encode(s);
const sha=async(s:string)=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encode(s))));
const request=(ctx:SocialContext)=>ctx.fetch||fetch;
async function value<T>(ctx:SocialContext,key:string,fallback:T):Promise<T>{const row=await ctx.db.prepare('SELECT value FROM settings WHERE key=?').bind(key).first<{value:string}>();if(!row)return fallback;try{return JSON.parse(row.value)}catch{return fallback}}
async function save(ctx:SocialContext,key:string,data:unknown){await ctx.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(data)).run()}
async function encryptionKey(ctx:SocialContext){try{const raw=unb64(ctx.env.SOCIAL_ENCRYPTION_KEY||'');if(raw.byteLength!==32)throw 0;return await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt'])}catch{throw new Error('Secure account storage needs the Site’s SOCIAL_ENCRYPTION_KEY connection.')}}
async function seal(ctx:SocialContext,data:unknown):Promise<Envelope>{const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(ctx),encode(JSON.stringify(data)));return {v:1,iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))}}
async function open<T>(ctx:SocialContext,envelope:Envelope|null):Promise<T|null>{if(!envelope)return null;try{const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(envelope.iv)},await encryptionKey(ctx),unb64(envelope.ciphertext));return JSON.parse(new TextDecoder().decode(data))}catch{throw new Error('The saved X connection cannot be read. Reconnect it in the Publisher’s Console.')}}
async function client(ctx:SocialContext):Promise<XClient|null>{if(ctx.env.X_CLIENT_ID?.trim())return {clientId:ctx.env.X_CLIENT_ID.trim(),clientSecret:ctx.env.X_CLIENT_SECRET||''};return open<XClient>(ctx,await value<Envelope|null>(ctx,'socialXClient',null))}
async function tokens(ctx:SocialContext){return open<XTokens>(ctx,await value<Envelope|null>(ctx,'socialXTokens',null))}
function origin(ctx:SocialContext){const u=new URL(ctx.siteOrigin);if(u.protocol!=='https:'||u.username||u.password)throw new Error('X connection requires the Site’s HTTPS origin.');return u.origin}
export function xCallbackUrl(ctx:SocialContext){return origin(ctx)+'/api/admin/distribution/callback'}
export function validateDistributionSettings(input:unknown):DistributionSettings{
 const d=input as Partial<DistributionSettings>;let substackUrl=String(d?.substackUrl||'').trim();
 if(substackUrl){const u=new URL(substackUrl);if(u.protocol!=='https:'||u.username||u.password||!(u.hostname==='substack.com'||u.hostname.endsWith('.substack.com')))throw new Error('Use your publication’s https://name.substack.com address.');substackUrl=u.origin}
 return {enabledX:d?.enabledX===true,includeSiteLink:d?.includeSiteLink===true,substackUrl};
}
export async function saveDistributionSettings(ctx:SocialContext,input:unknown){const settings=validateDistributionSettings(input);await save(ctx,'distribution',settings);return socialStatus(ctx)}
export async function saveXClient(ctx:SocialContext,input:{clientId?:unknown;clientSecret?:unknown}){
 const clientId=String(input.clientId||'').trim(),clientSecret=String(input.clientSecret||'').trim();if(clientId.length<8||clientId.length>500||clientSecret.length>2000)throw new Error('Add the OAuth 2.0 Client ID from your X developer app.');
 if(ctx.env.X_CLIENT_ID)throw new Error('This Site uses the X client configured in its environment. Update that connection in Site settings.');
 await save(ctx,'socialXClient',await seal(ctx,{clientId,clientSecret}));await save(ctx,'socialXTokens',null);await save(ctx,'distribution',{...await value(ctx,'distribution',defaults),enabledX:false});return socialStatus(ctx);
}
export async function socialStatus(ctx:SocialContext){
 const settings=await value(ctx,'distribution',defaults),clientEnvelope=await value<Envelope|null>(ctx,'socialXClient',null),tokenEnvelope=await value<Envelope|null>(ctx,'socialXTokens',null);
 let account:XTokens|null=null,connectionError='';if(tokenEnvelope)try{account=await open<XTokens>(ctx,tokenEnvelope)}catch(e){connectionError=(e as Error).message}
 const lastPost=await value<Delivery|null>(ctx,'socialLastXPost',null);
 return {settings:{...defaults,...settings},x:{storageReady:!!ctx.env.SOCIAL_ENCRYPTION_KEY,clientConfigured:!!ctx.env.X_CLIENT_ID||!!clientEnvelope,clientFromEnvironment:!!ctx.env.X_CLIENT_ID,connected:!!account,username:account?.username||'',callbackUrl:xCallbackUrl(ctx),connectionError,lastPost:lastPost?{status:lastPost.status,briefId:lastPost.briefId,attemptedAt:lastPost.attemptedAt,postId:lastPost.postId,url:lastPost.postId?'https://x.com/'+(lastPost.username||'i')+'/status/'+lastPost.postId:'',error:lastPost.error||''}:null},substack:{mode:'export',publishingApi:false}};
}
export async function beginXOAuth(ctx:SocialContext){
 await encryptionKey(ctx);const config=await client(ctx);if(!config)throw new Error('Add your X OAuth Client ID before connecting an account.');
 const state=b64(crypto.getRandomValues(new Uint8Array(32))),verifier=b64(crypto.getRandomValues(new Uint8Array(64))),challenge=await sha(verifier),createdAt=Date.now();
 await ctx.db.prepare("DELETE FROM cache WHERE key LIKE 'social-oauth:%' AND updated_at < ?").bind(createdAt-600000).run();
 await ctx.db.prepare('INSERT INTO cache(key,data,updated_at) VALUES(?,?,?)').bind('social-oauth:'+state,JSON.stringify(await seal(ctx,{verifier,createdAt})),createdAt).run();
 const u=new URL('https://x.com/i/oauth2/authorize');u.search=new URLSearchParams({response_type:'code',client_id:config.clientId,redirect_uri:xCallbackUrl(ctx),scope:'tweet.read tweet.write users.read offline.access',state,code_challenge:challenge,code_challenge_method:'S256'}).toString();return {url:u.href};
}
async function tokenRequest(ctx:SocialContext,config:XClient,body:URLSearchParams){
 const headers:Record<string,string>={'Content-Type':'application/x-www-form-urlencoded'};if(config.clientSecret)headers.Authorization='Basic '+btoa(encodeURIComponent(config.clientId)+':'+encodeURIComponent(config.clientSecret));else body.set('client_id',config.clientId);
 let response:Response;try{response=await request(ctx)('https://api.x.com/2/oauth2/token',{method:'POST',headers,body:body.toString(),redirect:'error',signal:AbortSignal.timeout(20000)})}catch{throw new Error('X authorization is temporarily unavailable. Try connecting again.');}
 if(!response.ok)throw new Error(response.status===429?'X authorization is rate limited. Try again later.':'X rejected authorization. Check the OAuth client, exact callback URL, and granted permissions.');
 let data:any;try{data=await response.json()}catch{throw new Error('X authorization returned an unreadable response.');}if(typeof data.access_token!=='string'||!data.access_token)throw new Error('X did not return a usable account token.');
 if(typeof data.scope==='string'&&!data.scope.split(' ').includes('tweet.write'))throw new Error('X posting permission was not granted. Reconnect with tweet.write access.');return data;
}
export async function completeXOAuth(ctx:SocialContext,input:{state:string;code?:string;error?:string}){
 if(!/^[A-Za-z0-9_-]{43}$/.test(input.state||''))throw new Error('The X connection request is invalid. Start again from your console.');
 const record=await ctx.db.prepare('DELETE FROM cache WHERE key=? RETURNING data,updated_at').bind('social-oauth:'+input.state).first<{data:string;updated_at:number}>();
 if(!record||Date.now()-record.updated_at>600000)throw new Error('The X connection request expired or was already used. Start again.');
 if(input.error)throw new Error('X account authorization was cancelled.');if(!input.code||input.code.length>4096)throw new Error('X did not supply an authorization code.');
 const state=await open<{verifier:string;createdAt:number}>(ctx,JSON.parse(record.data)),config=await client(ctx);if(!state||!config)throw new Error('X client configuration changed. Start the connection again.');
 const data=await tokenRequest(ctx,config,new URLSearchParams({grant_type:'authorization_code',code:input.code,redirect_uri:xCallbackUrl(ctx),code_verifier:state.verifier}));
 let response:Response;try{response=await request(ctx)('https://api.x.com/2/users/me',{headers:{Authorization:'Bearer '+data.access_token},redirect:'error',signal:AbortSignal.timeout(15000)})}catch{throw new Error('X could not verify the connected account. Try connecting again.');}
 if(!response.ok)throw new Error('X could not verify the account. Check users.read permission and your developer plan.');let account:any;try{account=await response.json()}catch{throw new Error('X account verification returned an unreadable response.');}
 if(!account.data?.id||!account.data?.username)throw new Error('X returned no account identity.');
 await save(ctx,'socialXTokens',await seal(ctx,{accessToken:data.access_token,refreshToken:data.refresh_token||'',expiresAt:Date.now()+Number(data.expires_in||7200)*1000,userId:String(account.data.id),username:String(account.data.username)}));
 return {connected:true,username:String(account.data.username)};
}
export async function disconnectX(ctx:SocialContext){await save(ctx,'socialXTokens',null);await save(ctx,'distribution',{...await value(ctx,'distribution',defaults),enabledX:false});return socialStatus(ctx)}
async function usableTokens(ctx:SocialContext){let account=await tokens(ctx);if(!account)return null;if(account.expiresAt>Date.now()+60000)return account;
 const config=await client(ctx);if(!config||!account.refreshToken)throw new Error('X authorization expired. Reconnect the account in your console.');
 const data=await tokenRequest(ctx,config,new URLSearchParams({grant_type:'refresh_token',refresh_token:account.refreshToken}));account={...account,accessToken:data.access_token,refreshToken:data.refresh_token||account.refreshToken,expiresAt:Date.now()+Number(data.expires_in||7200)*1000};await save(ctx,'socialXTokens',await seal(ctx,account));return account;
}
function publicUrl(raw:unknown){try{const u=new URL(String(raw));if(u.protocol!=='https:'&&u.protocol!=='http:'||u.username||u.password)return '';return u.href}catch{return ''}}
function weight(c:string){const cp=c.codePointAt(0)!;return cp<=4351||cp>=8192&&cp<=8205||cp>=8208&&cp<=8223||cp>=8242&&cp<=8247?1:2}
function weightedLength(s:string){return Array.from(s).reduce((n,c)=>n+weight(c),0)}
function truncate(s:string,n:number){let result='',length=0;for(const c of s){const cost=weight(c);if(length+cost>n)break;result+=c;length+=cost;}return result.trim()}
/** Leave space for X's fixed 23-character URL length. Never include a private Site URL by default. */
export function composeXText(brief:SocialBrief,settings:DistributionSettings,siteOrigin:string){
 const item=brief.items?.[0],url=settings.includeSiteLink?publicUrl(siteOrigin):publicUrl(item?.url||item?.sourceUrl);
 const summary=Array.isArray(brief.summary)?brief.summary.join(' '):brief.summary||'';
 const clean=(s:string)=>s.replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();
 const publisher=truncate(clean(item?.publisher||item?.sourceName||'Original source'),48),prefix='Jew Knows OSINT · Source-reported\n'+publisher+': ';
 const title=clean(item?.title||summary),available=(url?256:280)-weightedLength(prefix);
 return prefix+truncate(title,available)+(url?'\n'+url:'');
}
export async function publishBriefToX(ctx:SocialContext,brief:SocialBrief):Promise<{status:string;postId?:string;error?:string}>{
 const settings=await value(ctx,'distribution',defaults);if(!settings.enabledX)return {status:'disabled'};if(!brief.id||brief.sourceCount<=0||!brief.items?.length)return {status:'no-reporting'};
 if(!await value<Envelope|null>(ctx,'socialXTokens',null))return {status:'not-connected'};
 const text=composeXText(brief,settings,origin(ctx)),digest=await sha(text),key='social-x-delivery:'+brief.id;
 const lockId=crypto.randomUUID(),lock=await ctx.db.prepare('INSERT INTO cache(key,data,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at WHERE cache.updated_at < ? RETURNING key').bind('social-x-post-lock',lockId,Date.now(),Date.now()-600000).first();if(!lock)return {status:'busy'};
 try{
  const existing=await value<Delivery|null>(ctx,key,null),last=await value<Delivery|null>(ctx,'socialLastXPost',null);
  if(existing?.status==='sent'||last?.status==='sent'&&last.digest===digest)return {status:'already-posted',postId:existing?.postId||last?.postId};
  if(existing?.status==='uncertain'||existing?.status==='sending'||last?.status==='uncertain'||last?.status==='sending')return {status:'needs-review',error:'X did not confirm a previous posting attempt. Review the account before permitting another attempt in the console.'};
  if(existing?.retryAfter&&existing.retryAfter>Date.now())return {status:'retry-later'};
  const account=await usableTokens(ctx);if(!account)return {status:'not-connected'};
  const delivery:Delivery={briefId:brief.id,digest,status:'sending',attemptedAt:new Date().toISOString(),username:account.username};await save(ctx,key,delivery);await save(ctx,'socialLastXPost',delivery);
  let response:Response;
  try{response=await request(ctx)('https://api.x.com/2/tweets',{method:'POST',headers:{Authorization:'Bearer '+account.accessToken,'Content-Type':'application/json'},body:JSON.stringify({text}),redirect:'error',signal:AbortSignal.timeout(20000)});}catch{
   const failed:Delivery={...delivery,status:'uncertain',error:'X did not confirm receipt. Automatic retries for this edition are held to prevent duplicate posts.'};await save(ctx,key,failed);await save(ctx,'socialLastXPost',failed);return {status:'needs-review',error:failed.error};
  }
  if(response.status>=500){const failed:Delivery={...delivery,status:'uncertain',error:'X returned a server error without confirming delivery. Review the account before retrying to prevent duplicates.'};await save(ctx,key,failed);await save(ctx,'socialLastXPost',failed);return {status:'needs-review',error:failed.error};}
  if(!response.ok){const error=response.status===429?'X rate limit reached. Posting will retry after the provider reset.':response.status===401?'X authorization expired or was revoked. Reconnect the account.':response.status===403?'X denied posting. Check tweet.write permission, account restrictions, and the developer plan.':'X posting failed (HTTP '+response.status+').';
   const reset=Number(response.headers.get('x-rate-limit-reset'))*1000,failed:Delivery={...delivery,status:'failed',error,retryAfter:response.status===429?Math.max(Date.now()+60000,Number.isFinite(reset)?reset:Date.now()+3600000):Date.now()+300000};await save(ctx,key,failed);await save(ctx,'socialLastXPost',failed);return {status:'failed',error};
  }
  let data:any;try{data=await response.json()}catch{data=null}
  if(!data?.data?.id){const failed:Delivery={...delivery,status:'uncertain',error:'X returned no post identifier. Review the account before retrying this edition.'};await save(ctx,key,failed);await save(ctx,'socialLastXPost',failed);return {status:'needs-review',error:failed.error};}
  const sent:Delivery={...delivery,status:'sent',postId:String(data.data.id)};await save(ctx,key,sent);await save(ctx,'socialLastXPost',sent);return {status:'posted',postId:sent.postId};
 }catch(e){return {status:'failed',error:(e as Error).message}}finally{await ctx.db.prepare('DELETE FROM cache WHERE key=? AND data=?').bind('social-x-post-lock',lockId).run()}
}
/** This explicit owner action clears an uncertain-delivery hold without sending a post itself. */
export async function resolveXDelivery(ctx:SocialContext,input:{allowRetry?:unknown}){
 if(input.allowRetry!==true)throw new Error('Review the X account and explicitly permit another attempt.');
 const last=await value<Delivery|null>(ctx,'socialLastXPost',null);if(!last||!['uncertain','sending'].includes(last.status))return socialStatus(ctx);
 const released:Delivery={...last,status:'failed',error:'The owner reviewed the X account and allowed another attempt.',retryAfter:0};await save(ctx,'social-x-delivery:'+last.briefId,released);await save(ctx,'socialLastXPost',released);return socialStatus(ctx);
}
const escape=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function exportBriefText(brief:SocialBrief){const summary=Array.isArray(brief.summary)?brief.summary.join('\n\n'):brief.summary||'No approved source reporting is available yet.';return 'Jew Knows\nOSINT, News, and Important World Announcements.\n\nOSINT brief · '+(brief.localDate||brief.date||brief.day||'')+'\nAs of '+(brief.refreshedAt||'not refreshed')+'\n\n'+summary+'\n\nSource-reported coverage; reporting locations do not establish front lines or independently verified events.\n\nSources\n'+(brief.items||[]).map(i=>(i.publisher||i.sourceName||'Original source')+' — '+i.title+'\n'+(i.url||i.sourceUrl||'')).join('\n\n')}
export function exportBriefHtml(brief:SocialBrief){const summary=Array.isArray(brief.summary)?brief.summary:[brief.summary||'No approved source reporting is available yet.'];return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Jew Knows OSINT brief</title><body><article><h1>Jew Knows</h1><p>OSINT, News, and Important World Announcements.</p><h2>OSINT brief · '+escape(brief.localDate||brief.date||brief.day||'')+'</h2><p>As of '+escape(brief.refreshedAt||'not refreshed')+'</p>'+summary.map(p=>'<p>'+escape(p)+'</p>').join('')+'<p><small>Source-reported coverage. Reporting locations do not establish front lines or independently verified events.</small></p><h3>Original reporting</h3><ul>'+(brief.items||[]).map(i=>'<li><a href="'+escape(publicUrl(i.url||i.sourceUrl))+'">'+escape(i.title)+'</a> — '+escape(i.publisher||i.sourceName||'Original source')+'</li>').join('')+'</ul></article></body></html>'}
