import test from 'node:test';
import assert from 'node:assert/strict';
import {previewDeal, publicDealUrl, publicDeals, validatedDeals, readDeals, saveDeals} from '../lib/deals.ts';

const draft = {id: 'coffee', url: 'https://shop.example.com/coffee?affiliate=123', title: 'Coffee gear', description: 'A morning upgrade.', merchant: 'Example Shop', category: 'Coffee gear', enabled: true};

function fetcher(pages, addresses = ['8.8.8.8']) {
  const calls = [];
  const fn = async (input, init) => {
    const url = String(input);
    calls.push({url, init});
    if (url.startsWith('https://cloudflare-dns.com/dns-query?')) {
      const dnsUrl = new URL(url), type = dnsUrl.searchParams.get('type');
      return new Response(JSON.stringify({Status: 0, Answer: type === 'A' ? addresses.map(data => ({type: 1, data})) : []}), {headers: {'Content-Type': 'application/json'}});
    }
    const page = pages[url];
    assert.ok(page, 'Unexpected request: ' + url);
    return typeof page === 'function' ? page(init) : page;
  };
  return {fn, calls};
}
const html = body => new Response(body, {headers: {'Content-Type': 'text/html; charset=utf-8'}});

test('previews bounded HTML metadata without running scripts or inventing a price', async () => {
  const {fn, calls} = fetcher({'https://shop.example.com/coffee?affiliate=123': html(`
    <html><head><script><meta property="og:title" content="Script must never be parsed"></script>
    <!-- <meta property="og:title" content="Comment must never be parsed"> -->
    <meta content='Ceramic &amp; Steel Coffee Set' property='og:title'>
    <meta name="description" content="A &lt;b&gt;better&lt;/b&gt; morning. &#36; stays text.">
    <meta property="og:site_name" content="Example Shop">
    <meta content="/image.jpg?ref=preview" property="og:image">
    <meta property="product:price:amount" content="1.00">
    </head><body>Nothing to extract from the full page.</body></html>`)});
  const result = await previewDeal(draft.url, fn);
  assert.equal(result.title, 'Ceramic & Steel Coffee Set');
  assert.equal(result.description, 'A better morning. $ stays text.');
  assert.equal(result.image, 'https://shop.example.com/image.jpg?ref=preview');
  assert.equal(result.url, draft.url);
  assert.equal(result.merchant, 'Example Shop');
  assert.equal(result.metadataStatus, 'complete');
  assert.equal('price' in result, false);
  assert.equal(calls.at(-1).init.redirect, 'manual');
  assert.equal(calls.at(-1).init.credentials, 'omit');
  assert.equal(calls.at(-1).init.headers.Authorization, undefined);
});

test('redirects are bounded, checked again through DNS, and preserve the affiliate entry link', async () => {
  const original = 'https://merchant.example.com/deal?affiliate=123';
  const {fn, calls} = fetcher({[original]: new Response(null, {status: 302, headers: {Location: 'https://shop.example.com/item'}}), 'https://shop.example.com/item': html('<title>Product page</title>')});
  const result = await previewDeal(original, fn);
  assert.equal(result.url, original);
  assert.equal(result.title, 'Product page');
  assert.equal(result.merchant, 'shop.example.com');
  assert.equal(result.metadataStatus, 'partial');
  assert.equal(calls.filter(call => call.url.startsWith('https://cloudflare-dns.com')).length, 4);
  const endless = fetcher({'https://shop.example.com/item': new Response(null, {status: 302, headers: {Location: '/item'}})});
  await assert.rejects(() => previewDeal('https://shop.example.com/item', endless.fn), /too many redirects/);
  assert.equal(endless.calls.filter(call => call.url === 'https://shop.example.com/item').length, 4);
});

test('public links, redirects, DNS answers, and fetched images reject private-network bypasses', async () => {
  for (const url of ['javascript:alert(1)', 'http://shop.example.com/a', 'https://user:password@shop.example.com/a', 'https://localhost/a', 'https://127.1/a', 'https://2130706433/a', 'https://[::1]/a', 'https://[::ffff:127.0.0.1]/a', 'https://10.1.2.3/a', 'https://192.168.1.1/a', 'https://intranet.local/a', 'https://127.0.0.1.nip.io/a', 'https://shop.example.com:8080/a']) assert.throws(() => publicDealUrl(url));
  const privateRedirect = fetcher({[draft.url]: new Response(null, {status: 302, headers: {Location: 'https://169.254.169.254/latest/meta-data'}})});
  await assert.rejects(() => previewDeal(draft.url, privateRedirect.fn), /public HTTPS/);
  assert.equal(privateRedirect.calls.some(call => call.url.includes('169.254')), false);
  const privateDns = fetcher({[draft.url]: html('<title>Not fetched</title>')}, ['10.0.0.12']);
  await assert.rejects(() => previewDeal(draft.url, privateDns.fn), /private network/);
  assert.equal(privateDns.calls.some(call => call.url === draft.url), false);
  const unsafeImage = fetcher({[draft.url]: html('<title>Safe title</title><meta property="og:image" content="https://localhost/image.png">')});
  assert.equal((await previewDeal(draft.url, unsafeImage.fn)).image, undefined);
});

test('oversized, blocked, and non-HTML responses stop rather than bypassing access restrictions', async () => {
  for (const [response, error] of [
    [html('x'.repeat(512 * 1024 + 1)), /too large/],
    [new Response('blocked', {status: 403}), /HTTP 403/],
    [new Response('PDF', {headers: {'Content-Type': 'application/pdf'}}), /not an HTML/],
    [new Response('', {headers: {'Content-Type': 'text/html', 'Content-Length': '900000'}}), /too large/],
  ]) {
    const {fn} = fetcher({[draft.url]: response});
    await assert.rejects(() => previewDeal(draft.url, fn), error);
  }
});

test('validated deals keep explicit offer text and only publish enabled picks', () => {
  const settings = validatedDeals({deals: [{...draft, price: 'Partner offer: $45'}, {...draft, id: 'hidden', enabled: false}]});
  assert.equal(settings.deals[0].price, 'Partner offer: $45');
  assert.deepEqual(publicDeals(settings).deals.map(row => row.id), ['coffee']);
  assert.deepEqual(publicDeals({deals: []}), {deals: []});
  assert.throws(() => validatedDeals({deals: [draft, draft]}), /unique ID/);
  assert.throws(() => validatedDeals({deals: [{...draft, image: 'http://shop.example.com/a.jpg'}]}), /public HTTPS/);
  assert.throws(() => validatedDeals({deals: [{...draft, title: ''}]}), /title/);
  assert.equal(validatedDeals({deals: [{...draft, category: '', merchant: ''}]}).deals[0].merchant, 'shop.example.com');
});

test('product collection persists in one settings row and absent state stays empty', async () => {
  const rows = new Map();
  const db = {prepare(sql) {let params; return {bind(...values) {params = values; return this;}, async first() {return rows.has(params[0]) ? {value: rows.get(params[0])} : null;}, async run() {assert.match(sql, /ON CONFLICT/); rows.set(params[0], params[1]); return {};}};}};
  assert.deepEqual(await readDeals(db), {deals: []});
  assert.deepEqual(await saveDeals(db, {deals: [draft]}), {deals: [draft]});
  assert.deepEqual(await readDeals(db), {deals: [draft]});
  assert.equal(rows.size, 1);
});
