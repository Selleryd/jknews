import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';

const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const source = ts.transpileModule(fs.readFileSync(new URL('../lib/' + name + '.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports:{}}; cache.set(name,module.exports);
  new Function('module','exports','require',source)(module,module.exports,path => load(path.replace(/^\.\//,'')));
  return module.exports;
}
const {defaultStreamingSettings,validatedStreamingSettings,publicStreamingSettings,readStreamingSettings,saveStreamingSettings,transcribeChunk,TRANSCRIPTION_MAX_BYTES} = load('streaming');
const channel = (changes = {}) => ({id:'one',name:'A verified newsroom',url:'https://www.youtube.com/watch?v=abcdefghI_1',sourceUrl:'https://newsroom.example/live',category:'World',description:'Official source.',enabled:true,...changes});
const webm = () => new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,0x42,0x86,0x81,0x01])],{type:'audio/webm;codecs=opus'});

test('default channel directory includes official major newsrooms and preserves fallback source links',() => {
  const settings = defaultStreamingSettings();
  assert.ok(settings.channels.some(row => row.name === 'NBC News NOW'));
  assert.ok(settings.channels.some(row => row.name === 'ABC News Live'));
  assert.ok(settings.channels.some(row => row.name === 'CBS News 24/7'));
  assert.ok(settings.channels.some(row => row.name === 'Bloomberg Television'));
  assert.ok(settings.channels.every(row => row.sourceUrl.startsWith('https://') && row.verifiedAt === '2026-10-05'));
  assert.ok(settings.channels.filter(row => row.provider === 'youtube').every(row => row.embedUrl.startsWith('https://www.youtube-nocookie.com/embed/')));
  assert.equal(settings.channels.find(row => row.id === 'cnn').provider,'source');
  assert.equal(settings.channels.find(row => row.id === 'alexjoneslive').sourceUrl,'https://www.alexjoneslive.com/show/');
  assert.equal(settings.channels.find(row => row.id === 'alexjoneslive').provider,'source');
  assert.equal(publicStreamingSettings(settings).transcriptionReady,false);
  settings.channels[0].enabled = false;
  assert.equal(defaultStreamingSettings().channels[0].enabled,true);
});

test('channel validation derives trusted player addresses and rejects private or malformed URLs',() => {
  const settings = validatedStreamingSettings({channels:[channel({embedUrl:'https://attacker.example/embed',provider:'drive'})],featuredId:'one',transcriptionEnabled:true});
  assert.equal(settings.channels[0].provider,'youtube');
  assert.equal(settings.channels[0].embedUrl,'https://www.youtube-nocookie.com/embed/abcdefghI_1?rel=0');
  for (const patch of [{url:'https://localhost/movie.mp4'},{sourceUrl:'https://127.1/live'},{url:'javascript:alert(1)'},{url:'https://user:secret@example.com/video.mp4'},{category:'Invented'},{verifiedAt:'not-a-date'}]) assert.throws(() => validatedStreamingSettings({channels:[channel(patch)]}));
  assert.throws(() => validatedStreamingSettings({channels:[channel(),channel()]}),/unique ID/);
  assert.throws(() => validatedStreamingSettings({channels:[channel()],featuredId:'missing'}),/featured channel/);
  const original = validatedStreamingSettings({channels:[channel({provider:'source',url:'https://newsroom.example/live'})]});
  assert.equal(original.channels[0].provider,'source'); assert.equal(original.channels[0].embedUrl,undefined);
});

test('public directory filters disabled channels and gates transcription on both owner toggle and private connection',() => {
  const settings = validatedStreamingSettings({channels:[channel({id:'hidden',enabled:false}),channel({id:'visible'})],featuredId:'hidden',transcriptionEnabled:true});
  assert.deepEqual(publicStreamingSettings(settings,true).channels.map(row => row.id),['visible']);
  assert.equal(publicStreamingSettings(settings,true).featuredId,'visible');
  assert.equal(publicStreamingSettings(settings,true).transcriptionReady,true);
  assert.equal(publicStreamingSettings({...settings,transcriptionEnabled:false},true).transcriptionReady,false);
  assert.equal(publicStreamingSettings(settings,false).transcriptionReady,false);
});

test('owner channel edits persist and an intentionally empty list never restores default channels',async () => {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE settings (key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  const db = {prepare(sql) {let values = []; return {bind(...args) {values = args; return this;},async first() {return sqlite.prepare(sql).get(...values) || null;},async run() {return sqlite.prepare(sql).run(...values);}};}};
  assert.equal((await readStreamingSettings(db)).channels.length,11);
  const result = await saveStreamingSettings(db,{channels:[channel()],featuredId:'one',transcriptionEnabled:false});
  assert.deepEqual(await readStreamingSettings(db),result);
  await saveStreamingSettings(db,{channels:[],transcriptionEnabled:false});
  assert.deepEqual(await readStreamingSettings(db),{channels:[],transcriptionEnabled:false});
  sqlite.close();
});

test('transcription sends only a finalized bounded audio file to the actual provider and returns its text',async () => {
  const result = await transcribeChunk('private-test-key',webm(),async (url,request) => {
    assert.equal(url,'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(request.headers.Authorization,'Bearer private-test-key');
    assert.equal(request.headers['Content-Type'],undefined);
    assert.equal(request.body.get('model'),'gpt-4o-mini-transcribe');
    assert.equal(request.body.get('response_format'),'json');
    assert.equal(request.body.get('file').name,'broadcast-segment.webm');
    assert.equal(request.body.get('file').size,8);
    return Response.json({text:'  The original words from the broadcast.  '});
  });
  assert.deepEqual(result,{text:'The original words from the broadcast.'});
});

test('disconnected, oversized, spoofed, unsupported or failed caption requests never produce a fabricated transcript',async () => {
  let called = 0;
  const send = async () => {called++; return Response.json({text:'must not run'});};
  await assert.rejects(() => transcribeChunk(undefined,webm(),send),/not connected/);
  await assert.rejects(() => transcribeChunk('key',new Blob([], {type:'audio/webm'}),send),/1 byte/);
  await assert.rejects(() => transcribeChunk('key',new Blob([new Uint8Array(TRANSCRIPTION_MAX_BYTES + 1)],{type:'audio/webm'}),send),/2 MB/);
  await assert.rejects(() => transcribeChunk('key',new Blob(['a webpage'],{type:'text/html'}),send),/Unsupported/);
  await assert.rejects(() => transcribeChunk('key',new Blob(['a webpage'],{type:'audio/webm'}),send),/valid container/);
  assert.equal(called,0);
  await assert.rejects(() => transcribeChunk('key',webm(),async () => new Response('secret provider internals',{status:500})),error => /could not transcribe/.test(error.message) && !error.message.includes('secret'));
  await assert.rejects(() => transcribeChunk('key',webm(),async () => new Response('',{status:429})),/busy/);
  await assert.rejects(() => transcribeChunk('key',webm(),async () => Response.json({other:'field'})),/no transcript/);
});
