import test, {beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

// Exercise the actual route, owner guard and helpers. Only Cloudflare's D1
// binding and provider HTTP transport are replaced with local fixtures.
const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://jew-knows.example';
const owner = 'publisher@example.com';
const ownerId = '594336d6-dc2d-44dc-8b7c-be2aa7391c7c';
const secrets = /ACCESS_TOKEN_SENTINEL|REFRESH_TOKEN_SENTINEL|CLIENT_SECRET_SENTINEL|MODEL_KEY_SENTINEL/;
const originalTransport = globalThis.fetch;
beforeEach(() => {globalThis.fetch = async () => {throw new Error('Unexpected provider request in route access test.');};});
afterEach(() => {globalThis.fetch = originalTransport;});

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.join(root, 'drizzle/0000_optimal_celestials.sql'), 'utf8'));
  sqlite.exec(fs.readFileSync(path.join(root, 'drizzle/0001_advertising_share.sql'), 'utf8'));
  sqlite.exec(fs.readFileSync(path.join(root, 'drizzle/0002_low_dexter_bennett.sql'), 'utf8'));
  const statements = [];
  const db = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) {args = values; return this;},
        async first() {statements.push(sql); return sqlite.prepare(sql).get(...args) ?? null;},
        async all() {statements.push(sql); return {results: sqlite.prepare(sql).all(...args)};},
        async run() {statements.push(sql); return {meta: {changes: Number(sqlite.prepare(sql).run(...args).changes)}};},
      };
    },
    async batch(queries) {return Promise.all(queries.map(query => query.run()));},
  };
  const environment = {
    DB: db,
    ADMIN_EMAIL: ' Publisher@Example.Com ',
    SITE_ORIGIN: origin,
    SOCIAL_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString('base64url'),
    OPENAI_API_KEY: 'MODEL_KEY_SENTINEL',
  };
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = {exports: {}};
    cache.set(filename, module);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
    }).outputText;
    const require = name => {
      if (name === 'cloudflare:workers') return {env: environment};
      const target = name.startsWith('@/') ? path.join(root, name.slice(2))
        : name.startsWith('./') || name.startsWith('../') ? path.resolve(path.dirname(filename), name) : null;
      if (!target) throw new Error('Unexpected route dependency: ' + name);
      return load(target.endsWith('.ts') ? target : target + '.ts');
    };
    new Function('require', 'module', 'exports', 'console', output)(require, module, module.exports, {...console, error() {}});
    return module.exports;
  }
  const route = load(path.join(root, 'app/api/[...path]/route.ts'));
  const write = (key, value) => sqlite.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  async function call(method, endpoint, {email, userId, body = {}, requestOrigin} = {}) {
    const headers = {};
    if (email) headers['oai-authenticated-user-email'] = email;
    if (userId !== undefined ? userId : email?.trim().toLowerCase() === owner) headers['oai-authenticated-user-id'] = userId ?? ownerId;
    if (requestOrigin) headers.origin = requestOrigin;
    if (method === 'POST') headers['Content-Type'] = 'application/json';
    return route[method](new Request(origin + '/api/' + endpoint, {
      method, headers, ...(method === 'POST' ? {body: JSON.stringify(body)} : {}),
    }));
  }
  return {sqlite, environment, statements, write, call, route};
}

const protectedGets = ['admin/brain',
  'admin/deals','admin/streaming','admin/rewards','admin/videos', 'admin/distribution', 'admin/distribution/connect',
  'admin/distribution/callback?state=unknown&code=unknown',
  'admin/distribution/export', 'admin/distribution/export?format=html',
  'admin/distribution/export?format=svg', 'admin/export',
];
const protectedPosts = ['admin/brain','admin/forecast-resolution','brain/refresh',
  'admin/deals','admin/streaming','admin/rewards','admin/videos', 'admin/distribution', 'admin/distribution/client',
  'admin/distribution/disconnect', 'admin/distribution/resolve',
  'admin/deals-preview','admin/distribution/connect', 'admin/distribution/callback', 'admin/distribution/export',
];

test('public deal, channel and reward APIs expose enabled content but never unearned coupons', async () => {
  const f=fixture();
  try {
    const campaign={id:'reward-one',title:'Coffee film',advertiser:'Example advertiser',category:'Coffee gear',durationSeconds:15,videoUrl:'https://cdn.example.com/ad.mp4',posterUrl:'',destinationUrl:'https://shop.example.com/',couponCode:'UNEARNED_COUPON_SENTINEL',enabled:true};
    f.write('rewardAdsSettings',{campaigns:[campaign,{...campaign,id:'hidden-reward',title:'HIDDEN_REWARD_SENTINEL',enabled:false}]});
    f.write('dealsSettings',{deals:[{id:'live-pick',url:'https://shop.example.com/product',title:'Live product',description:'Supplier description',merchant:'Example merchant',category:'Coffee gear',enabled:true},{id:'hidden-pick',url:'https://shop.example.com/hidden',title:'HIDDEN_DEAL_SENTINEL',description:'',merchant:'Example merchant',category:'Other',enabled:false}]});
    f.write('streamingSettings',{channels:[{id:'enabled-channel',name:'Enabled newsroom',category:'World',description:'Official broadcaster',url:'https://www.youtube.com/watch?v=xDWQ3LkccY8',sourceUrl:'https://news.sky.com/watch-live',enabled:true},{id:'hidden-channel',name:'HIDDEN_CHANNEL_SENTINEL',category:'World',description:'',url:'https://www.youtube.com/watch?v=xDWQ3LkccY8',sourceUrl:'https://news.sky.com/watch-live',enabled:false}],transcriptionEnabled:false});
    for(const endpoint of ['deals','streaming','rewards']){
      const response=await f.call('GET',endpoint);assert.equal(response.status,200);
      assert.doesNotMatch(await response.text(),/UNEARNED_COUPON_SENTINEL|HIDDEN_REWARD_SENTINEL|HIDDEN_DEAL_SENTINEL|HIDDEN_CHANNEL_SENTINEL|MODEL_KEY_SENTINEL/);
    }
    const started=await f.call('POST','rewards/start',{body:{campaignId:campaign.id}});assert.equal(started.status,200);const session=await started.json();assert.equal('couponCode' in session.campaign,false);
    const early=await f.call('POST','rewards/claim',{body:{sessionToken:session.sessionToken,nonce:session.nonce}});assert.notEqual(early.status,200);assert.doesNotMatch(await early.text(),/UNEARNED_COUPON_SENTINEL/);
    const exported=await f.call('GET','admin/export',{email:owner});assert.match(await exported.text(),/UNEARNED_COUPON_SENTINEL/);
  }finally{f.sqlite.close()}
});

test('transcription requires consent, owner enablement and bounded segments before contacting a provider',async()=>{
  const f=fixture();let requests=0;globalThis.fetch=async()=>{requests++;throw new Error('Provider must not be called.');};
  const send=(headers={})=>f.route.POST(new Request(origin+'/api/streaming/transcribe',{method:'POST',headers:{'Content-Type':'audio/webm',Origin:origin,...headers},body:new Uint8Array([26,69,223,163])}));
  try{
    assert.equal((await send()).status,403);
    assert.equal((await send({'X-Broadcast-Consent':'tab-audio',Origin:'https://other.example'})).status,403);
    f.write('streamingSettings',{channels:[],transcriptionEnabled:false});assert.equal((await send({'X-Broadcast-Consent':'tab-audio'})).status,503);
    f.write('streamingSettings',{channels:[],transcriptionEnabled:true});assert.equal((await send({'X-Broadcast-Consent':'tab-audio','Content-Length':'2000001'})).status,413);
    assert.equal(requests,0);
  }finally{f.sqlite.close()}
});

test('anonymous and other readers cannot read, connect, export, or mutate owner video/distribution controls', async () => {
  const f = fixture();
  try {
    for (const email of [undefined, 'reader@example.com']) {
      for (const endpoint of protectedGets) {
        const response = await f.call('GET', endpoint, {email});
        assert.equal(response.status, 403, `GET ${endpoint}: ${email ?? 'anonymous'}`);
        assert.match((await response.json()).error, /Publisher access/);
      }
      for (const endpoint of protectedPosts) {
        const response = await f.call('POST', endpoint, {email});
        assert.equal(response.status, 403, `POST ${endpoint}: ${email ?? 'anonymous'}`);
      }
    }
    assert.deepEqual(f.statements, [], 'rejected access must not touch settings or OAuth state');
  } finally {f.sqlite.close();}
});

test('public intelligence, sources and video playback expose approved public data without private settings or credentials', async () => {
  const f = fixture();
  try {
    f.write('sources', [
      {id: 'approved', name: 'Approved Publisher', category: 'World', approved: true, feedUrl: 'https://publisher.example/feed', rightsNote: 'PRIVATE_PERMISSION_SENTINEL'},
      {id: 'hidden', name: 'Unapproved Publisher', category: 'World', approved: false, feedUrl: 'https://hidden.example/feed'},
    ]);
    f.write('videoSettings', {videos: [
      {id: 'public-video', title: 'Published video', url: 'https://cdn.example.com/public.mp4', enabled: true},
      {id: 'hidden-video', title: 'Unpublished video', url: 'https://cdn.example.com/HIDDEN_VIDEO_SENTINEL.mp4', enabled: false},
    ], featuredId: 'hidden-video'});
    f.write('socialXTokens', {v: 1, iv: 'PRIVATE_TOKEN_ENVELOPE_SENTINEL', ciphertext: 'PRIVATE_TOKEN_CIPHERTEXT_SENTINEL'});
    f.write('distribution', {enabledX: false, includeSiteLink: false, substackUrl: 'https://publication.substack.com'});
    for (const endpoint of ['intelligence', 'videos', 'sources']) {
      const response = await f.call('GET', endpoint);
      assert.equal(response.status, 200, endpoint);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      const text = await response.text();
      assert.doesNotMatch(text, secrets);
      assert.doesNotMatch(text, /PRIVATE_PERMISSION_SENTINEL|PRIVATE_TOKEN_|HIDDEN_VIDEO_SENTINEL|Unapproved Publisher/);
      if (endpoint === 'sources') assert.deepEqual(JSON.parse(text), {sources: [{id: 'approved', name: 'Approved Publisher', category: 'World'}]});
      if (endpoint === 'videos') assert.equal(JSON.parse(text).featuredId, 'public-video');
    }
    assert.ok(f.statements.every(sql => /^SELECT\b/i.test(sql.trim())), 'public reads must not write or start model/provider requests');
  } finally {f.sqlite.close();}
});

test('the normalized owner can save playlists, complete OAuth, and export settings/briefs without account tokens or client secrets', async () => {
  const f = fixture(), originalFetch = globalThis.fetch;
  let providerRequests = 0;
  globalThis.fetch = async url => {
    providerRequests++;
    if (url === 'https://api.x.com/2/oauth2/token') return Response.json({access_token: 'ACCESS_TOKEN_SENTINEL', refresh_token: 'REFRESH_TOKEN_SENTINEL', expires_in: 3600, scope: 'tweet.read tweet.write users.read offline.access'});
    if (url === 'https://api.x.com/2/users/me') return Response.json({data: {id: '42', username: 'publisher_account'}});
    throw new Error('Unexpected external request in route test: ' + url);
  };
  try {
    const email = 'PUBLISHER@EXAMPLE.COM';
    let response = await f.call('POST', 'admin/videos', {email, requestOrigin: origin, body: {videos: [{id: 'owner-video', title: 'Owner edit', url: 'https://youtu.be/abcdefghI_1', enabled: true}], featuredId: 'owner-video'}});
    assert.equal(response.status, 200);
    response = await f.call('GET', 'admin/videos', {email});
    assert.equal((await response.json()).videos[0].embedUrl, 'https://www.youtube-nocookie.com/embed/abcdefghI_1?rel=0');
    response = await f.call('POST', 'admin/distribution', {email, requestOrigin: origin, body: {enabledX: false, includeSiteLink: false, substackUrl: 'https://publication.substack.com'}});
    assert.equal(response.status, 200);
    response = await f.call('POST', 'admin/distribution/client', {email, requestOrigin: origin, body: {clientId: 'client-test-123', clientSecret: 'CLIENT_SECRET_SENTINEL'}});
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), secrets);
    response = await f.call('GET', 'admin/distribution/connect', {email});
    assert.equal(response.status, 302);
    const authorization = new URL(response.headers.get('Location'));
    assert.equal(authorization.origin, 'https://x.com');
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    response = await f.call('GET', 'admin/distribution/callback?state=' + authorization.searchParams.get('state') + '&code=example-code', {email});
    assert.equal(response.status, 200);
    assert.match(await response.text(), /X account connected/);
    assert.equal(providerRequests, 2);
    response = await f.call('GET', 'admin/distribution', {email});
    const status = await response.json();
    assert.equal(status.x.connected, true);
    assert.equal(status.x.username, 'publisher_account');
    assert.doesNotMatch(JSON.stringify(status), secrets);
    for (const endpoint of ['admin/export', 'admin/distribution/export', 'admin/distribution/export?format=html', 'admin/distribution/export?format=svg']) {
      response = await f.call('GET', endpoint, {email});
      assert.equal(response.status, 200, endpoint);
      assert.match(response.headers.get('Content-Disposition'), /^attachment;/);
      assert.doesNotMatch(await response.text(), secrets, endpoint);
    }
    assert.doesNotMatch(f.sqlite.prepare("SELECT value FROM settings WHERE key IN ('socialXClient','socialXTokens')").all().map(row => row.value).join(' '), secrets);
    response = await f.call('POST', 'admin/distribution/resolve', {email, requestOrigin: origin, body: {allowRetry: true}});
    assert.equal(response.status, 200);
    response = await f.call('POST', 'admin/distribution/disconnect', {email, requestOrigin: origin});
    assert.equal(response.status, 200);
    assert.equal((await response.json()).x.connected, false);
    assert.equal(providerRequests, 2, 'saving, resolving, disconnecting and exports must not send a post');
  } finally {globalThis.fetch = originalFetch; f.sqlite.close();}
});

test('cross-site owner mutations are rejected before accessing storage', async () => {
  const f = fixture();
  try {
    for (const endpoint of protectedPosts) {
      const response = await f.call('POST', endpoint, {email: owner, requestOrigin: 'https://attacker.example'});
      assert.equal(response.status, 403, endpoint);
      assert.equal((await response.json()).error, 'Request origin not allowed');
    }
    assert.deepEqual(f.statements, []);
  } finally {f.sqlite.close();}
});

test('an absent configured owner fails closed even with an authenticated email header', async () => {
  const f = fixture();
  try {
    delete f.environment.ADMIN_EMAIL;
    assert.equal((await f.call('GET', 'admin/videos', {email: owner})).status, 403);
    assert.equal((await f.call('POST', 'admin/distribution', {email: owner})).status, 403);
    assert.deepEqual(f.statements, []);
  } finally {f.sqlite.close();}
});


test('private profiles require platform identity, same-origin writes and isolate different readers',async()=>{const f=fixture();try{assert.equal((await f.call('GET','profile')).status,401);assert.equal((await f.call('POST','profile',{userId:'a',body:{zip:'90210',exposures:['business'],context:'Private A context'}})).status,403);const saved=await f.call('POST','profile',{userId:'a',requestOrigin:origin,body:{zip:'90210',exposures:['business'],context:'Private A context',ownerKey:'forged-b'}});assert.equal(saved.status,200);const a=await(await f.call('GET','profile',{userId:'a'})).json(),b=await(await f.call('GET','profile',{userId:'b'})).json();assert.equal(a.profile.context,'Private A context');assert.equal(b.profile.context,'');for(const endpoint of ['brain','ledger'])assert.doesNotMatch(await(await f.call('GET',endpoint)).text(),/Private A context|90210/);assert.equal((await f.call('POST','profile',{userId:'a',requestOrigin:origin,body:{remove:true}})).status,200);assert.equal((await(await f.call('GET','profile',{userId:'a'})).json()).profile.context,'')}finally{f.sqlite.close()}});

 test('owner email without the pinned platform identity is rejected before storage',async()=>{const f=fixture();try{for(const userId of ['', 'someone-else']){assert.equal((await f.call('GET','admin/videos',{email:owner,userId})).status,403);assert.equal((await f.call('POST','admin/ads',{email:owner,userId,requestOrigin:origin})).status,403)}assert.deepEqual(f.statements,[])}finally{f.sqlite.close()}});
 test('all owner mutations require an explicit same-origin header',async()=>{const f=fixture();try{for(const endpoint of ['admin/ads','admin/sources','admin/headlines','admin/videos','admin/rewards','admin/deals','admin/streaming','admin/distribution','admin/refresh'])assert.equal((await f.call('POST',endpoint,{email:owner})).status,403,endpoint);assert.deepEqual(f.statements,[])}finally{f.sqlite.close()}});
