import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';

const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name).exports;
  const module = {exports:{}};modules.set(name,module);
  const code = ts.transpileModule(fs.readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  new Function('require','module','exports',code)(dependency=>load(dependency.replace(/^\.\//,'')),module,module.exports);
  return module.exports;
}
const {validateRewardSettings,readRewardSettings,saveRewardSettings,publicRewardSettings,startRewardSession,heartbeatRewardSession,claimReward} = load('reward-ads');
const campaign = {id:'coffee',title:'A considered cup',advertiser:'Test Advertiser',category:'Coffee gear',durationSeconds:15,videoUrl:'https://cdn.example.com/ad.mp4',posterUrl:'',destinationUrl:'https://shop.example.com',couponCode:'REAL-TEST-CODE',enabled:true};
function fixture() {
  const sqlite = new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE cache(key TEXT PRIMARY KEY,data TEXT,updated_at INTEGER);');
  let now = 100_000;
  const db = {prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return sqlite.prepare(sql).get(...args)??null;},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}};}};
  return {sqlite,ctx:{db,now:()=>now},advance(seconds){now+=seconds*1_000;}};
}
async function ready(f) {
  await saveRewardSettings(f.ctx,{campaigns:[campaign]});
  const session = await startRewardSession(f.ctx,{campaignId:campaign.id});
  for (let played=2;played<=14;played+=2) {
    f.advance(2);const result=await heartbeatRewardSession(f.ctx,{sessionToken:session.sessionToken,nonce:session.nonce,playedSeconds:played,positionSeconds:played});session.nonce=result.nonce;
  }
  f.advance(1);session.nonce=(await heartbeatRewardSession(f.ctx,{sessionToken:session.sessionToken,nonce:session.nonce,playedSeconds:15,positionSeconds:15})).nonce;
  return session;
}

test('campaigns start empty and public lists/start responses do not reveal coupons or disabled campaigns',async()=>{
  const f=fixture();try {
    assert.deepEqual(await readRewardSettings(f.ctx),{campaigns:[]});
    const settings=await saveRewardSettings(f.ctx,{campaigns:[campaign,{...campaign,id:'disabled',enabled:false,couponCode:'HIDDEN-CODE'}]});
    const publicList=publicRewardSettings(settings);assert.equal(publicList.optional,true);assert.equal(publicList.campaigns.length,1);assert.doesNotMatch(JSON.stringify(publicList),/REAL-TEST-CODE|HIDDEN-CODE|couponCode|disabled/);
    const session=await startRewardSession(f.ctx,{campaignId:'coffee'});assert.match(session.sessionToken,/^[a-f0-9]{64}$/);assert.match(session.nonce,/^[a-f0-9]{64}$/);assert.doesNotMatch(JSON.stringify(session),/REAL-TEST-CODE|couponCode/);
    await assert.rejects(startRewardSession(f.ctx,{campaignId:'disabled'}),/no longer available/);
  } finally {f.sqlite.close();}
});
test('waiting alone, jumping to the end, stale challenges, and non-finite playback do not reveal a coupon',async()=>{
  const f=fixture();try {
    await saveRewardSettings(f.ctx,{campaigns:[campaign]});const s=await startRewardSession(f.ctx,{campaignId:'coffee'});
    f.advance(15);await assert.rejects(claimReward(f.ctx,{sessionToken:s.sessionToken,nonce:s.nonce}),/Finish the required/);
    await assert.rejects(heartbeatRewardSession(f.ctx,{sessionToken:s.sessionToken,nonce:s.nonce,playedSeconds:15,positionSeconds:15}),/regular confirmations/);
    await assert.rejects(heartbeatRewardSession(f.ctx,{sessionToken:s.sessionToken,nonce:s.nonce,playedSeconds:2,positionSeconds:15}),/seeking/);
    await assert.rejects(heartbeatRewardSession(f.ctx,{sessionToken:s.sessionToken,nonce:s.nonce,playedSeconds:NaN,positionSeconds:0}),/valid native-video/);
    const first=await heartbeatRewardSession(f.ctx,{sessionToken:s.sessionToken,nonce:s.nonce,playedSeconds:2,positionSeconds:2});
    await assert.rejects(heartbeatRewardSession(f.ctx,{sessionToken:s.sessionToken,nonce:s.nonce,playedSeconds:3,positionSeconds:3}),/stale/);
    await assert.rejects(heartbeatRewardSession(f.ctx,{sessionToken:s.sessionToken,nonce:first.nonce,playedSeconds:4,positionSeconds:4}),/elapsed time/);
  } finally {f.sqlite.close();}
});
test('normal-speed sequential playback earns an idempotent durable historical coupon',async()=>{
  const f=fixture();try {
    const s=await ready(f);const first=await claimReward(f.ctx,s);assert.equal(first.couponCode,campaign.couponCode);assert.equal(first.destinationUrl,campaign.destinationUrl+'/');
    await saveRewardSettings(f.ctx,{campaigns:[{...campaign,couponCode:'NEW-CODE',enabled:false}]});f.advance(3600);
    assert.deepEqual(await claimReward(f.ctx,{sessionToken:s.sessionToken}),first,'a previously earned code remains the same historical claim');
    const stored=f.sqlite.prepare('SELECT data FROM cache WHERE key=?').get('reward-ad-session:'+s.sessionToken);assert.equal(JSON.parse(stored.data).claim.couponCode,campaign.couponCode);
  } finally {f.sqlite.close();}
});
test('campaign edits, disablement, expired sessions and invalid tokens block unearned claims',async()=>{
  const f=fixture();try {
    const s=await ready(f);await saveRewardSettings(f.ctx,{campaigns:[{...campaign,couponCode:'NEW-CODE'}]});await assert.rejects(claimReward(f.ctx,s),/campaign changed/);
    const changed=await startRewardSession(f.ctx,{campaignId:'coffee'});await saveRewardSettings(f.ctx,{campaigns:[{...campaign,enabled:false}]});await assert.rejects(heartbeatRewardSession(f.ctx,{...changed,playedSeconds:1,positionSeconds:1}),/no longer available/);
    await saveRewardSettings(f.ctx,{campaigns:[campaign]});const expired=await startRewardSession(f.ctx,{campaignId:'coffee'});f.advance(1801);await assert.rejects(claimReward(f.ctx,expired),/expired/);
    await assert.rejects(claimReward(f.ctx,{sessionToken:'guessable'}),/Invalid/);
    await assert.rejects(claimReward(f.ctx,{sessionToken:'a'.repeat(64)}),/expired/);
  } finally {f.sqlite.close();}
});
test('an atomic challenge update prevents concurrent progress replay and recorded playback stays monotonic',async()=>{
  const f=fixture();try {
    await saveRewardSettings(f.ctx,{campaigns:[campaign]});const s=await startRewardSession(f.ctx,{campaignId:'coffee'});f.advance(2);
    const payload={sessionToken:s.sessionToken,nonce:s.nonce,playedSeconds:2,positionSeconds:2};const results=await Promise.allSettled([heartbeatRewardSession(f.ctx,payload),heartbeatRewardSession(f.ctx,payload)]);
    assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(results.filter(row=>row.status==='rejected').length,1);
    const accepted=results.find(row=>row.status==='fulfilled').value;f.advance(2);await assert.rejects(heartbeatRewardSession(f.ctx,{sessionToken:s.sessionToken,nonce:accepted.nonce,playedSeconds:1,positionSeconds:1}),/backwards/);
  } finally {f.sqlite.close();}
});
test('campaign validation excludes unsupported lengths, sharing pages and unsafe URLs',()=>{
  for(const durationSeconds of [14,61,15.5,NaN])assert.throws(()=>validateRewardSettings({campaigns:[{...campaign,durationSeconds}]}),/15 to 60/);
  for(const videoUrl of ['https://youtube.com/watch?v=abcdefghI_1','https://drive.google.com/file/d/abc/view','http://cdn.example.com/ad.mp4','https://127.1/ad.mp4','https://user:secret@cdn.example.com/ad.mp4'])assert.throws(()=>validateRewardSettings({campaigns:[{...campaign,videoUrl}]}));
  assert.throws(()=>validateRewardSettings({campaigns:[campaign,{...campaign}]}),/unique/);
  assert.throws(()=>validateRewardSettings({campaigns:[{...campaign,couponCode:''}]}),/real coupon/);
  assert.throws(()=>validateRewardSettings({campaigns:[{...campaign,couponCode:'X'.repeat(101)}]}),/100 characters/);
  assert.throws(()=>validateRewardSettings({campaigns:[{...campaign,destinationUrl:'javascript:alert(1)'}]}));
});
