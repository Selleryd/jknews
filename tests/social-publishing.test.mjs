import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {beginXOAuth,completeXOAuth,composeXText,disconnectX,exportBriefHtml,publishBriefToX,resolveXDelivery,saveDistributionSettings,saveXClient,socialStatus,validateDistributionSettings} from '../lib/social-publishing.ts';

function fixture(fetcher){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE cache(key TEXT PRIMARY KEY,data TEXT,updated_at INTEGER);');
 const db={prepare(sql){let args=[];return {
  bind(...values){args=values;return this},
  async first(){return sqlite.prepare(sql).get(...args)||null},
  async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}
 };}};
 return {sqlite,ctx:{db,env:{SOCIAL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64url')},siteOrigin:'https://jew-knows.example',fetch:fetcher}};
}
const brief={id:'edition-1',date:'2026-10-05',refreshedAt:'2026-10-05T14:00:00Z',sourceCount:1,summary:'Source-reported ceasefire talks.',shareText:'Jew Knows OSINT · Source-reported ceasefire talks.',items:[{title:'Ceasefire talks reported',sourceUrl:'https://publisher.example/ceasefire',publisher:'Original Publisher'}]};
async function connect(ctx){await saveXClient(ctx,{clientId:'client-12345',clientSecret:'confidential-secret'});const auth=await beginXOAuth(ctx),u=new URL(auth.url);return completeXOAuth(ctx,{state:u.searchParams.get('state'),code:'authorization-code'})}
function xMock(extra){return async(url,init)=>{if(url.endsWith('/oauth2/token'))return Response.json({access_token:'access-secret',refresh_token:'refresh-secret',expires_in:7200,scope:'tweet.read tweet.write users.read offline.access'});if(url.endsWith('/users/me'))return Response.json({data:{id:'42',username:'verified_account'}});if(extra)return extra(url,init);throw new Error('Unexpected request '+url)}}

test('client credentials and account tokens are encrypted and never returned in status',async()=>{
 const {ctx,sqlite}=fixture(xMock());try{await connect(ctx);const values=sqlite.prepare('SELECT value FROM settings').all().map(r=>r.value).join(' ');assert.doesNotMatch(values,/access-secret|refresh-secret|confidential-secret|client-12345/);const status=await socialStatus(ctx);assert.equal(status.x.connected,true);assert.equal(status.x.username,'verified_account');assert.doesNotMatch(JSON.stringify(status),/access-secret|refresh-secret|confidential-secret/);assert.equal(status.settings.enabledX,false)}finally{sqlite.close()}
});
test('OAuth uses S256 PKCE and short-lived single-use state',async()=>{
 const {ctx,sqlite}=fixture(xMock());try{await saveXClient(ctx,{clientId:'client-12345'});const {url}=await beginXOAuth(ctx),u=new URL(url);assert.equal(u.hostname,'x.com');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('redirect_uri'),'https://jew-knows.example/api/admin/distribution/callback');const state=u.searchParams.get('state');await completeXOAuth(ctx,{state,code:'code'});await assert.rejects(completeXOAuth(ctx,{state,code:'code'}),/expired or was already used/);const second=new URL((await beginXOAuth(ctx)).url),state2=second.searchParams.get('state');sqlite.prepare('UPDATE cache SET updated_at=? WHERE key=?').run(Date.now()-700000,'social-oauth:'+state2);await assert.rejects(completeXOAuth(ctx,{state:state2,code:'code'}),/expired/)}finally{sqlite.close()}
});
test('posting requires enabled authorized connection and real source reporting; successful editions publish once',async()=>{
 let posted=0,payload;const {ctx,sqlite}=fixture(xMock(async(url,init)=>{assert.equal(url,'https://api.x.com/2/tweets');posted++;payload=JSON.parse(init.body);return Response.json({data:{id:'post-123'}})}));
 try{assert.equal((await publishBriefToX(ctx,brief)).status,'disabled');await saveDistributionSettings(ctx,{enabledX:true});assert.equal((await publishBriefToX(ctx,brief)).status,'not-connected');await connect(ctx);await saveDistributionSettings(ctx,{enabledX:true});assert.equal((await publishBriefToX(ctx,{...brief,sourceCount:0})).status,'no-reporting');assert.equal((await publishBriefToX(ctx,brief)).status,'posted');assert.equal((await publishBriefToX(ctx,brief)).status,'already-posted');assert.equal((await publishBriefToX(ctx,{...brief,id:'edition-2'})).status,'already-posted');assert.equal(posted,1);assert.match(payload.text,/publisher\.example/);assert.doesNotMatch(payload.text,/jew-knows\.example/)}finally{sqlite.close()}
});
test('unconfirmed network outcomes hold the edition instead of risking duplicate public posts',async()=>{
 let attempts=0;const {ctx,sqlite}=fixture(xMock(async()=>{attempts++;throw new Error('Secret provider detail should not leak')}));try{await connect(ctx);await saveDistributionSettings(ctx,{enabledX:true});const first=await publishBriefToX(ctx,brief);assert.equal(first.status,'needs-review');assert.doesNotMatch(first.error,/Secret provider/);assert.equal((await publishBriefToX(ctx,brief)).status,'needs-review');assert.equal(attempts,1);assert.equal((await socialStatus(ctx)).x.lastPost.status,'uncertain')}finally{sqlite.close()}
});
test('X rejection is reported safely and rate limits back off',async()=>{
 let attempts=0;const {ctx,sqlite}=fixture(xMock(async()=>{attempts++;return Response.json({error:'sensitive provider payload'},{status:429,headers:{'x-rate-limit-reset':String(Math.ceil(Date.now()/1000)+3600)}})}));try{await connect(ctx);await saveDistributionSettings(ctx,{enabledX:true});assert.equal((await publishBriefToX(ctx,brief)).status,'failed');assert.equal((await publishBriefToX(ctx,brief)).status,'retry-later');assert.equal(attempts,1);assert.doesNotMatch(JSON.stringify(await socialStatus(ctx)),/sensitive provider payload/)}finally{sqlite.close()}
});
test('disconnect pauses publishing and settings reject unsafe publication addresses',async()=>{
 const {ctx,sqlite}=fixture(xMock());try{await connect(ctx);await saveDistributionSettings(ctx,{enabledX:true});const result=await disconnectX(ctx);assert.equal(result.x.connected,false);assert.equal(result.settings.enabledX,false);for(const url of ['javascript:alert(1)','https://substack.com.evil.example','https://user:secret@name.substack.com'])assert.throws(()=>validateDistributionSettings({substackUrl:url}));assert.equal(validateDistributionSettings({substackUrl:'https://publication.substack.com/p/test'}).substackUrl,'https://publication.substack.com')}finally{sqlite.close()}
});
test('public dispatch is bounded, source-linked and HTML export escapes untrusted article text',()=>{
 const text=composeXText({...brief,shareText:'A'.repeat(1000)+' https://jew-knows.example/private'},{enabledX:true,includeSiteLink:false,substackUrl:''},'https://jew-knows.example');const weighted=text.replace(/https?:\/\/\S+/g,'x'.repeat(23));assert.ok(Array.from(weighted).length<=280);assert.doesNotMatch(text,/jew-knows\.example/);const html=exportBriefHtml({...brief,summary:'<script>alert(1)</script>',items:[{title:'<img onerror=x>',sourceUrl:'javascript:alert(1)',publisher:'Publisher'}]});assert.doesNotMatch(html,/<script>|<img|javascript:/);assert.match(html,/&lt;script&gt;/)
});
test('non-Latin dispatches respect X weighted length and keep title, publisher and link from the same source',()=>{
 const nonLatin={...brief,shareText:'A misleading differently selected headline',items:[{title:'世界'.repeat(200),publisher:'日本新聞',sourceUrl:'https://publisher.example/original'}]};const text=composeXText(nonLatin,{enabledX:true,includeSiteLink:false,substackUrl:''},'https://jew-knows.example');const withoutUrl=text.replace(/https?:\/\/\S+/g,'x'.repeat(23));const weighted=Array.from(withoutUrl).reduce((n,c)=>n+(c.codePointAt(0)>4351?2:1),0);assert.ok(weighted<=280);assert.match(text,/日本新聞/);assert.match(text,/世界/);assert.doesNotMatch(text,/misleading/);assert.match(text,/publisher\.example\/original/);
});
test('an uncertain dispatch also holds later editions until an explicit owner review releases it',async()=>{
 let attempts=0;const {ctx,sqlite}=fixture(xMock(async()=>{attempts++;if(attempts===1)throw new Error('Timeout');return Response.json({data:{id:'10000000'}})}));try{await connect(ctx);await saveDistributionSettings(ctx,{enabledX:true});assert.equal((await publishBriefToX(ctx,brief)).status,'needs-review');assert.equal((await publishBriefToX(ctx,{...brief,id:'next'})).status,'needs-review');assert.equal(attempts,1);await assert.rejects(resolveXDelivery(ctx,{}),/explicitly/);await resolveXDelivery(ctx,{allowRetry:true});assert.equal(attempts,1);assert.equal((await publishBriefToX(ctx,brief)).status,'posted');assert.equal(attempts,2)}finally{sqlite.close()}
});
