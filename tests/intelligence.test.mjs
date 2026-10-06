import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import * as core from '../lib/intelligence-core.ts';

const at='2026-10-05T14:30:00Z';
const donors=[{id:'one',name:'First Publisher',approved:true,category:'World'},{id:'two',name:'Second Publisher',approved:true,category:'Politics'},{id:'blocked',name:'Unapproved Publisher',approved:false}];
const story=(changes={})=>({id:'report-one',sourceId:'one',publisher:'First Publisher',title:'Ceasefire talks between Israel and Lebanon continue',sourceUrl:'https://first.example/report',author:'Original Author',publishedAt:'2026-10-05T13:00:00Z',description:'The article reports talks in Beirut. The outcome has not been confirmed.',...changes});

test('zero approved sources produces an honest waiting brief, empty map and no fabricated seed content',()=>{
 const edition=core.buildIntelligence({sources:[],articles:[story()],now:at});
 assert.equal(edition.status,'waiting');assert.deepEqual(edition.brief.items,[]);assert.deepEqual(edition.conflicts,{locations:[],edges:[],stories:[]});assert.equal(edition.brief.shareText,'');assert.match(edition.brief.summary,/briefing will appear as reporting arrives/);assert.equal(edition.coverage.omitted.unapproved,1);
});
test('strict source approval gates snapshots, explicit IDs and legacy publisher attribution',()=>{
 const edition=core.buildIntelligence({sources:donors,articles:[story(),story({id:'bad',sourceId:'blocked',publisher:'First Publisher',sourceUrl:'https://blocked.example/bad'}),story({id:'unknown',sourceId:'unknown',sourceUrl:'https://unknown.example/bad'}),story({id:'legacy',sourceId:undefined,sourceUrl:'https://first.example/legacy'})],feedSnapshots:[{sourceId:'blocked',collectedAt:at,items:[story({sourceUrl:'https://blocked.example/snapshot'})]}],now:at});
 assert.equal(edition.brief.items.length,2);assert.ok(edition.brief.items.every(item=>item.sourceId==='one'));assert.equal(edition.coverage.omitted.unapproved,3);
 const ambiguous=core.buildIntelligence({sources:[donors[0],{id:'unapproved-name',name:donors[0].name,approved:false}],articles:[story({sourceId:undefined})],now:at});assert.equal(ambiguous.brief.items.length,0);
});
test('feed and published copies deduplicate even when tracking parameters differ, retaining the site article link',()=>{
 const edition=core.buildIntelligence({sources:donors,articles:[story({slug:'real-published-story',sourceUrl:'https://first.example/report?utm_source=edition'})],feedSnapshots:[{sourceId:'one',collectedAt:at,items:[story({id:undefined,url:'https://first.example/report',sourceUrl:undefined})]}],now:at});
 assert.equal(edition.brief.items.length,1);assert.equal(edition.brief.items[0].articleUrl,'/article/real-published-story');assert.equal(edition.coverage.omitted.duplicates,1);
});
test('stale, future, undated and unsafe reports are omitted without replacing publication dates',()=>{
 const edition=core.buildIntelligence({sources:donors,articles:[story(),story({sourceUrl:'https://first.example/old',publishedAt:'2026-10-03T12:00:00Z'}),story({sourceUrl:'https://first.example/future',publishedAt:'2026-10-06T12:00:00Z'}),story({sourceUrl:'https://first.example/undated',publishedAt:undefined}),story({sourceUrl:'http://127.1/private'})],now:at});
 assert.equal(edition.brief.items.length,1);assert.equal(edition.coverage.omitted.outsideWindow,2);assert.equal(edition.coverage.omitted.undated,1);assert.equal(edition.coverage.omitted.invalidUrl,1);assert.match(edition.coverage.limitations.join(' '),/undated/);
});
test('a stale snapshot cannot revive a future-dated feed entry once that date arrives',()=>{
 const edition=core.buildIntelligence({sources:donors,feedSnapshots:[{sourceId:'one',collectedAt:'2026-10-01T12:00:00Z',items:[story()]}],now:at});
 assert.equal(edition.brief.items.length,0);assert.equal(edition.coverage.omitted.staleSnapshots,1);assert.equal(edition.status,'waiting');
});
test('every represented donor gets a slot and display limits never overshoot',()=>{
 const articles=[...Array.from({length:8},(_,i)=>story({id:'a'+i,sourceUrl:'https://first.example/'+i,publishedAt:'2026-10-05T14:00:00Z'})),story({id:'older-other',sourceId:'two',sourceUrl:'https://second.example/story',publishedAt:'2026-10-05T01:00:00Z'})];
 const edition=core.buildIntelligence({sources:donors,articles,now:at,maxItems:2});
 assert.equal(edition.brief.items.length,2);assert.equal(edition.brief.sourceCount,2);assert.deepEqual(new Set(edition.coverage.sourceIds),new Set(['one','two']));assert.equal(edition.coverage.omitted.olderThanLatestLimit,7);
});
test('two-hour windows and daily reset follow New York midnight, including daylight saving boundaries',()=>{
 const midnight=core.intelligenceWindow('2026-10-06T04:01:00Z');assert.equal(midnight.localDate,'2026-10-06');assert.equal(midnight.refreshBucket,'2026-10-06/00');
 const before=core.buildIntelligence({sources:donors,articles:[story()],now:'2026-10-05T14:01:00Z'});
 assert.equal(core.intelligenceRefreshDue(before,'2026-10-05T15:59:00Z'),false);assert.equal(core.intelligenceRefreshDue(before,'2026-10-05T16:00:00Z'),true);
 assert.equal(core.intelligenceRefreshDue(before,'2026-10-06T04:00:00Z'),true);
 assert.equal(core.intelligenceWindow('2026-11-01T05:30:00Z').nextRefreshAt,'2026-11-01T07:00:00.000Z');
 assert.equal(core.intelligenceWindow('2026-03-08T06:30:00Z').nextRefreshAt,'2026-03-08T07:00:00.000Z');
});
test('conflict mode excludes figurative wars, cybersecurity, military parades and historical memorial stories',()=>{
 for(const headline of ['Culture wars intensify in Israel','AI price war reaches China','Trade warfare threatens the United States','The war on cancer in India','Cyber warfare research in Ukraine','Cyberwarfare conference held in Russia','Star Wars film opens in India','Frontline nurses in Ukraine receive awards','Military parade in China unveils missiles','World War II museum opens in Ukraine','Troops attend a military recruitment fair in Britain','Hostages released after a bank robbery'])assert.equal(core.isArmedConflictReporting(headline),false,headline);
 for(const headline of ['Ceasefire talks between Israel and Lebanon','Ukraine war reporting continues','Missile attacks reported in Kyiv','Hamas hostage talks continue in Gaza','Rebels killed in fighting in Myanmar'])assert.equal(core.isArmedConflictReporting(headline),true,headline);
});
test('map contains only explicitly named reference locations and same-article co-mention edges with original evidence',()=>{
 const edition=core.buildIntelligence({sources:donors,articles:[story(),story({id:'kyiv-report',sourceUrl:'https://first.example/kyiv',title:'Russian shelling reported in Kyiv',description:'The published report gives no casualty figure.'})],now:at});
 const ids=edition.conflicts.locations.map(location=>location.id);
 assert.deepEqual(new Set(ids),new Set(['israel','lebanon','beirut','kyiv']));assert.ok(!ids.includes('russia'));assert.ok(!ids.includes('ukraine'));
 assert.ok(!edition.conflicts.edges.some(edge=>edge.source==='kyiv'||edge.target==='kyiv'));
 for(const location of edition.conflicts.locations){assert.equal(location.label,'Reporting location');assert.ok(Number.isFinite(location.lat)&&Number.isFinite(location.lon));assert.ok(location.evidence.every(evidence=>evidence.url.startsWith('https://first.example/')));}
 assert.ok(edition.conflicts.edges.every(edge=>edge.relationship==='co-mentioned in reporting'&&edge.evidence.every(e=>e.storyId==='report-one')));
 assert.ok(!JSON.stringify(edition).includes('confirmed casualty'));assert.equal(edition.brief.assessment,'source-reported');
});
test('South Sudan does not create a Sudan pin and ambiguous Congo does not imply the DRC',()=>{
 const edition=core.buildIntelligence({sources:donors,articles:[story({title:'Armed clashes reported in South Sudan and Congo',description:''})],now:at});
 assert.deepEqual(edition.conflicts.locations.map(location=>location.id),['south-sudan']);
});
test('AI priorities cannot insert IDs, quotes, facts or claims absent from the approved input',()=>{
 const edition=core.buildIntelligence({sources:donors,articles:[story()],now:at});
 const selected=core.applyIntelligencePriorities(edition,['invented-casualties','report-one','report-one']);
 assert.equal(selected.brief.method,'ai-assisted');assert.ok(selected.brief.summary.includes(story().title));assert.ok(!selected.brief.summary.includes('invented-casualties'));assert.deepEqual(selected.conflicts,edition.conflicts);
 assert.equal(core.applyIntelligencePriorities(edition,['invented']).brief.method,'source-derived');
});
test('share copy credits reporting, keeps the original link intact and never exceeds 280 literal characters',()=>{
 const edition=core.buildIntelligence({sources:donors,articles:[story({title:'A'.repeat(400)})],now:at});
 assert.ok([...edition.brief.shareText].length<=280);assert.match(edition.brief.shareText,/Source-reported/);assert.ok(edition.brief.shareText.endsWith(story().sourceUrl));
 assert.equal(core.makeIntelligenceShareText({...edition.brief.items[0],sourceUrl:'https://first.example/'+'x'.repeat(300)}),'');
});

const source=fs.readFileSync(new URL('../lib/intelligence.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};new Function('require','module','exports',compiled)((name)=>name==='./intelligence-core'?core:(()=>{throw Error('Unexpected import '+name)})(),module,module.exports);
const {getIntelligence,refreshIntelligence,recordIntelligenceFeedSnapshot,INTELLIGENCE_CACHE_KEY,INTELLIGENCE_FEED_CACHE_PREFIX}=module.exports;
function fixture(sources=donors){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE cache(key TEXT PRIMARY KEY,data TEXT,updated_at INTEGER);CREATE TABLE stories(data TEXT,published_at TEXT,status TEXT);');
 sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('sources',JSON.stringify(sources));
 const writes=[];const db={prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){if(/^(INSERT|UPDATE|DELETE)/.test(sql))writes.push(sql);return sqlite.prepare(sql).get(...values)??null;},async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){writes.push(sql);return {meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};}};}};
 return {sqlite,db,writes};
}
test('approved snapshots populate the source-derived brief without an AI key while disallowed snapshots are never persisted',async()=>{
 const f=fixture();try{
  assert.deepEqual(await recordIntelligenceFeedSnapshot({db:f.db,now:at},'blocked',[story()]),{saved:0});
  await recordIntelligenceFeedSnapshot({db:f.db,now:at},'one',[story()],at);
  assert.ok(f.sqlite.prepare('SELECT key FROM cache WHERE key=?').get(INTELLIGENCE_FEED_CACHE_PREFIX+'one'));
  const edition=await refreshIntelligence({db:f.db,now:at});assert.equal(edition.brief.items.length,1);assert.equal(edition.brief.method,'source-derived');assert.equal(edition.brief.collectedAt,at.replace('Z','.000Z'));
  assert.ok(f.sqlite.prepare('SELECT key FROM cache WHERE key=?').get(INTELLIGENCE_CACHE_KEY));
 }finally{f.sqlite.close();}
});
test('public intelligence reads make no writes or provider requests, and source withdrawal removes cached text and map evidence immediately',async()=>{
 const f=fixture();const oldFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected provider call');};
 try{
  await refreshIntelligence({db:f.db,now:at,articles:[story()]});f.writes.length=0;
  const read=await getIntelligence({db:f.db,now:at,env:{OPENAI_API_KEY:'do-not-use-on-read'}});assert.equal(read.brief.items.length,1);assert.equal(calls,0);assert.deepEqual(f.writes,[]);
  f.sqlite.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(donors.map(donor=>({...donor,approved:false}))),'sources');
  const withdrawn=await getIntelligence({db:f.db,now:at});assert.equal(withdrawn.brief.items.length,0);assert.deepEqual(withdrawn.conflicts.locations,[]);assert.ok(!withdrawn.brief.summary.includes(story().title));assert.deepEqual(f.writes,[]);
 }finally{globalThis.fetch=oldFetch;f.sqlite.close();}
});
test('a refresh lease prevents a concurrent model request and preserves an honest deterministic readback',async()=>{
 const f=fixture();const oldFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected provider call');};
 try{
  f.sqlite.prepare('INSERT INTO cache(key,data,updated_at) VALUES(?,?,?)').run('osint-refresh-lock-v1','other-worker',Date.parse(at));
  const edition=await refreshIntelligence({db:f.db,now:at,articles:[story()],env:{OPENAI_API_KEY:'must-not-send'}});
  assert.equal(edition.brief.items.length,1);assert.equal(edition.brief.method,'source-derived');assert.equal(calls,0);assert.equal(f.sqlite.prepare('SELECT key FROM cache WHERE key=?').get(INTELLIGENCE_CACHE_KEY),undefined);
 }finally{globalThis.fetch=oldFetch;f.sqlite.close();}
});
test('a provider outage retains factual source-derived output and releases the refresh lease',async()=>{
 const f=fixture();const oldFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('Unavailable',{status:503});
 try{
  const edition=await refreshIntelligence({db:f.db,now:at,articles:[story()],env:{OPENAI_API_KEY:'test-provider-key'}});
  assert.equal(edition.brief.method,'source-derived');assert.match(edition.coverage.limitations.join(' '),/503/);assert.equal(f.sqlite.prepare("SELECT key FROM cache WHERE key='osint-refresh-lock-v1'").get(),undefined);
 }finally{globalThis.fetch=oldFetch;f.sqlite.close();}
});
