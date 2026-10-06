import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
// The Worker module is tested with only its platform binding replaced; publishing code is unmodified.
const calls=[];
const environment = {
 DB: {
  prepare(sql) {
   return {
    bind(...args) {
     return {
      async run() {
       calls.push({sql,args});
       return {meta:{changes:1}};
      }
     };
    }
   };
  }
 }
};
const source=fs.readFileSync(new URL('../lib/news-server.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const supportingModules={};
function supporting(name){
 if(supportingModules[name])return supportingModules[name].exports;
 const module={exports:{}};supportingModules[name]=module;
 const filename=new URL('../lib/'+name.replace('./','')+'.ts',import.meta.url);
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','module','exports',code)(supporting,module,module.exports);return module.exports;
}
const server={exports:{}};
new Function('require','module','exports',compiled)((name)=>name==='cloudflare:workers'?{env:environment}:name==='./news-data'?{articles:[],defaultAds:[],defaultPoll:{},sourceCandidates:[],categories:[]}:name==='./feed-parser'?{}:['./intelligence','./social-publishing','./market-widgets','./forecast','./owner-access'].includes(name)?supporting(name):(()=>{throw Error('Unexpected import '+name)})(),server,server.exports);
const {generateStory,sourceRightsConfirmed,safeUrl}=server.exports;
const donor={id:'owned',name:'Publisher',category:'World',mode:'fulltext',fullTextConfirmed:true,rightsConfirmed:true,rightsNote:'Publisher gave written republication permission.'};
const entry={queuedId:'a4547842-42ee-4f20-ae93-fdba7faf1022',title:'Original headline',url:'https://publisher.example/article',author:'Original Author',publishedAt:'2026-10-05T10:00:00Z',fullBody:['Complete first paragraph.','Original second paragraph.'],fullContentStatus:'available'};
test('confirmed full article publishes the complete supplied body without an AI key and preserves attribution',async()=>{
 calls.length=0;const article=await generateStory(donor,entry);
 assert.equal(article.title,'Original headline');assert.deepEqual(article.paragraphs,entry.fullBody);assert.equal(article.author,'Original Author');assert.equal(article.publisher,'Publisher');assert.equal(article.sourceUrl,entry.url);assert.equal(article.kind,'Full article');assert.equal(article.contentComplete,true);assert.match(article.imageLabel,/reused/);
 const insert=calls.find(c=>c.sql.startsWith('INSERT INTO stories'));assert.equal(insert.args[5],'published');assert.equal(JSON.parse(insert.args[3]).sourceId,'owned');
});
test('a missing byline is explicitly unknown instead of attributed to a fabricated author',async()=>{
 const article=await generateStory(donor,{...entry,author:''});assert.equal(article.author,'Byline not provided');
});
test('full and licensed publication require affirmative rights plus a usable reference',async()=>{
 assert.equal(sourceRightsConfirmed({...donor,rightsConfirmed:false}),false);assert.equal(sourceRightsConfirmed({...donor,rightsNote:'',rightsUrl:'ftp://example.com'}),false);assert.equal(sourceRightsConfirmed({...donor,rightsNote:'',rightsUrl:'https://publisher.example/permission'}),true);
 await assert.rejects(generateStory({...donor,rightsConfirmed:false},entry),/republication rights/);
 await assert.rejects(generateStory({...donor,fullTextConfirmed:false},entry),/complete article bodies/);
 await assert.rejects(generateStory({...donor,mode:'licensed',rightsNote:''},entry),/republication rights/);
});
test('unavailable, incomplete and oversized full articles are held without substituting the excerpt',async()=>{
 for(const status of ['missing','incomplete','oversized'])await assert.rejects(generateStory(donor,{...entry,fullContentStatus:status,description:'Excerpt',fullContentReason:'Needs review'}),/Hold: Needs review/);
 await assert.rejects(generateStory(donor,{...entry,fullBody:['X'.repeat(100_001)]}),/not truncated/);
});
test('feed URLs reject normalized private-address aliases, credentials and non-web protocols',()=>{
 for(const value of ['http://2130706433/feed','http://0x7f000001/feed','http://127.1/feed','http://[::1]/feed','http://192.168.1.1/feed','http://100.64.2.1/feed','http://198.18.1.2/feed','https://localhost/feed','https://home.internal/feed','https://user:secret@example.com/feed','ftp://example.com/feed'])assert.throws(()=>safeUrl(value),/public/);
 assert.equal(safeUrl('https://publisher.example/feed'),'https://publisher.example/feed');
});

// SQLite executes the exact SQL used by the updater, including its fairness query.
const {DatabaseSync}=await import('node:sqlite');
const {parseFeed}=await import('../lib/feed-parser.ts');
const maintenanceModule={exports:{}};
new Function('require','module','exports',compiled)((name)=>name==='cloudflare:workers'?{env:environment}:name==='./news-data'?{articles:[],defaultAds:[],defaultPoll:{},sourceCandidates:[],categories:[]}:name==='./feed-parser'?{parseFeed}:['./intelligence','./social-publishing','./market-widgets','./forecast','./owner-access'].includes(name)?supporting(name):(()=>{throw Error('Unexpected import '+name)})(),maintenanceModule,maintenanceModule.exports);
function fixture(sources){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE cache(key TEXT PRIMARY KEY,data TEXT,updated_at INTEGER);CREATE TABLE stories(id TEXT PRIMARY KEY,slug TEXT,source_url TEXT UNIQUE,data TEXT,published_at TEXT,status TEXT);CREATE TABLE logs(id TEXT PRIMARY KEY,message TEXT,created_at TEXT);CREATE TABLE polls(id TEXT PRIMARY KEY,data TEXT,created_at TEXT);CREATE TABLE rate_limits(key TEXT PRIMARY KEY,count INTEGER,expires_at INTEGER);`);
 sqlite.exec(fs.readFileSync(new URL('../drizzle/0002_low_dexter_bennett.sql',import.meta.url),'utf8'));
 const insert=sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)');insert.run('sources',JSON.stringify(sources));insert.run('marqueeOverride',JSON.stringify('Manually verified headline'));
 sqlite.prepare('INSERT INTO cache(key,data,updated_at) VALUES(?,?,?)').run('market-quotes-v2','[]',Date.now());
 environment.DB={prepare(sql){let parameters=[];return {bind(...values){parameters=values;return this;},async first(){return sqlite.prepare(sql).get(...parameters)??null;},async all(){return {results:sqlite.prepare(sql).all(...parameters)};},async run(){const r=sqlite.prepare(sql).run(...parameters);return {meta:{changes:Number(r.changes)}}}}},async batch(statements){const results=[];for(const statement of statements)results.push(await statement.run());return results;}};
 return sqlite;
}
const body='Full original paragraph with substantial publisher-supplied details and complete context. '.repeat(10);
const liveFeed=(count)=>`<rss xmlns:content="urn:content"><channel>${Array.from({length:count},(_,i)=>`<item><title>Story ${i}</title><link>https://publisher.example/story-${i}</link><pubDate>2026-10-05T${String(10+i).padStart(2,'0')}:00:00Z</pubDate><description>Excerpt ${i}</description><content:encoded><![CDATA[<p>${body}</p>]]></content:encoded></item>`).join('')}</channel></rss>`;
test('a source-only pass with no AI connection queues all excerpts, saves health and stops instead of looping',async()=>{
 const sqlite=fixture([{...donor,approved:true,mode:'summary',feedUrl:'https://publisher.example/feed'}]);const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(liveFeed(3));
 try{const result=await maintenanceModule.exports.maintenance();assert.equal(result.progress.queued,3);assert.equal(result.progress.draftsPrepared,0);assert.equal(result.pending,3);assert.equal(result.canContinue,false);const health=JSON.parse(sqlite.prepare("SELECT value FROM settings WHERE key='sourceHealth'").get().value);assert.equal(health.owned.itemCount,3);assert.equal(health.owned.status,'ok');assert.equal(health.owned.fullBodyCount,3);}finally{globalThis.fetch=originalFetch;sqlite.close();}
});
test('full-body queue continuations publish every entry and finish when drained without repolling sources',async()=>{
 const sqlite=fixture([{...donor,approved:true,feedUrl:'https://publisher.example/feed'}]);const originalFetch=globalThis.fetch;let fetches=0;globalThis.fetch=async()=>{fetches++;return new Response(liveFeed(3));};
 try{const first=await maintenanceModule.exports.maintenance();assert.equal(first.progress.published,2);assert.equal(first.pending,1);assert.equal(first.canContinue,true);const second=await maintenanceModule.exports.maintenance();assert.equal(second.progress.sourcesChecked,0);assert.equal(second.progress.published,1);assert.equal(second.pending,0);assert.equal(second.canContinue,false);assert.equal(fetches,1);assert.equal(sqlite.prepare("SELECT count(*) AS n FROM stories WHERE status='published'").get().n,3);}finally{globalThis.fetch=originalFetch;sqlite.close();}
});
test('feed failures are persisted and continuation stops on error',async()=>{
 const sqlite=fixture([{...donor,approved:true,feedUrl:'https://publisher.example/feed'}]);const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response('Forbidden',{status:403});
 try{const result=await maintenanceModule.exports.maintenance();assert.equal(result.canContinue,false);assert.equal(result.progress.queued,0);assert.equal(result.errors[0].stage,'rss');const health=JSON.parse(sqlite.prepare("SELECT value FROM settings WHERE key='sourceHealth'").get().value);assert.equal(health.owned.status,'error');assert.match(health.owned.lastError,/403/);}finally{globalThis.fetch=originalFetch;sqlite.close();}
});
test('one prolific recent donor cannot starve an older story from another approved publisher',async()=>{
 const donors=[{...donor,approved:true},{...donor,id:'other',name:'Second Publisher',approved:true}];const sqlite=fixture(donors);sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('maintenanceCycle',JSON.stringify({remaining:[],startedAt:new Date().toISOString()}));
 const insert=sqlite.prepare('INSERT INTO stories(id,slug,source_url,data,published_at,status) VALUES(?,?,?,?,?,?)');
 for(let i=0;i<210;i++){const id='row-'+i,item={...entry,queuedId:id,url:'https://publisher.example/new-'+i,fullBody:[body]};insert.run(id,id,item.url,JSON.stringify({source:donors[0],item}),'2026-10-05T10:00:00Z','feed_pending');}
 const other={...entry,queuedId:'other-row',url:'https://other.example/older',fullBody:[body]};insert.run('other-row','older',other.url,JSON.stringify({source:donors[1],item:other}),'2026-10-01T10:00:00Z','feed_pending');
 try{const result=await maintenanceModule.exports.maintenance();assert.equal(result.progress.published,2);assert.equal(sqlite.prepare("SELECT status FROM stories WHERE id='other-row'").get().status,'published');assert.equal(result.canContinue,true);}finally{sqlite.close();}
});
