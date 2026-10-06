export type Deal = {
  id: string;
  url: string;
  title: string;
  description: string;
  merchant: string;
  category: string;
  image?: string;
  price?: string;
  enabled: boolean;
};
export type DealsSettings = {deals: Deal[]};
export type DealPreview = Omit<Deal, 'id' | 'enabled' | 'price'> & {metadataStatus: 'complete' | 'partial'};
type DealsDatabase = Pick<D1Database, 'prepare'>;

const SETTING_KEY = 'dealsSettings';
const MAX_HTML_BYTES = 512 * 1024;
const plainText = (value: unknown, limit: number) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : '';

function unsafeHostname(host: string): boolean {
  const name = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  // IP literals are not needed for product links, and excluding all of them also
  // covers integer/octal IPv4 spellings normalized by the URL parser.
  if (!name.includes('.') || name.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(name)) return true;
  return /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(name)
    || /(?:^|\.)(?:nip\.io|sslip\.io|xip\.io)$/.test(name)
    || !/^[a-z0-9.-]+$/.test(name);
}

/** Product and image links stay on public HTTPS origins. Images are not proxied. */
export function publicDealUrl(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) throw new Error('Enter a public HTTPS product link.');
  let url: URL;
  try {url = new URL(value.trim());} catch {throw new Error('Enter a valid product link.');}
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || unsafeHostname(url.hostname)) throw new Error('Use a public HTTPS link without credentials, IP addresses, or a private network host.');
  url.hash = '';
  return url;
}

function publicAddress(address: string): boolean {
  if (address.includes(':')) {
    // Restrict resolved IPv6 records to global unicast. Exclude special-purpose
    // 2001 ranges and documentation space rather than guessing their reachability.
    return /^[23][0-9a-f]{3}:/i.test(address)
      && !/^2001:(?:db8|0|10|20):/i.test(address);
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return false;
  const [a, b, c, d] = address.split('.').map(Number);
  if ([a, b, c, d].some(part => part < 0 || part > 255)) return false;
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168
    || a === 192 && b === 0 && (c === 0 || c === 2)
    || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)
    || a === 203 && b === 0 && c === 113);
}

async function assertPublicDns(hostname: string, fetchImpl: typeof fetch, signal: AbortSignal) {
  // Resolve both address families before every redirect hop. Fail closed when
  // resolution cannot be checked; Workers also enforce their network boundary.
  const records = await Promise.all(['A', 'AAAA'].map(async type => {
    const response = await fetchImpl('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(hostname) + '&type=' + type, {
      headers: {Accept: 'application/dns-json'}, redirect: 'error', credentials: 'omit', signal,
    });
    if (!response.ok) throw new Error('The product host could not be verified. You can enter its details manually.');
    const data = await response.json() as {Status?: number; Answer?: {type?: number; data?: string}[]};
    if (data.Status !== 0) throw new Error('The product host could not be verified. You can enter its details manually.');
    return (data.Answer || []).filter(row => row.type === 1 || row.type === 28).map(row => row.data || '');
  }));
  const addresses = records.flat();
  if (!addresses.length || addresses.some(address => !publicAddress(address))) throw new Error('This product host resolves to an unavailable or private network address.');
}

async function limitedHtml(response: Response): Promise<string> {
  if (Number(response.headers.get('content-length') || 0) > MAX_HTML_BYTES) throw new Error('This page is too large to preview. Enter its details manually.');
  if (!response.body) throw new Error('This page has no readable preview. Enter its details manually.');
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_HTML_BYTES) throw new Error('This page is too large to preview. Enter its details manually.');
      chunks.push(value);
    }
  } finally {await reader.cancel().catch(() => {});}
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {joined.set(chunk, offset); offset += chunk.byteLength;}
  return new TextDecoder().decode(joined);
}

function entities(value: string): string {
  const known: Record<string, string> = {amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', euro: '€', pound: '£', yen: '¥'};
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith('#')) {
      const number = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '';
    }
    return known[code.toLowerCase()] ?? match;
  });
}

const cleanMetadata = (value: string, limit: number) => plainText(entities(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '), limit);

function metadata(html: string, base: URL): {title: string; description: string; image?: string; merchant: string} {
  const safeHtml = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const fields = new Map<string, string>();
  for (const tag of safeHtml.match(/<meta\b[^>]*>/gi) || []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([a-z][a-z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
    const key = (attributes.get('property') || attributes.get('name') || '').toLowerCase();
    if (key && !fields.has(key)) fields.set(key, attributes.get('content') || '');
  }
  const title = cleanMetadata(fields.get('og:title') || fields.get('twitter:title') || /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(safeHtml)?.[1] || '', 180);
  const description = cleanMetadata(fields.get('og:description') || fields.get('description') || fields.get('twitter:description') || '', 700);
  const merchant = cleanMetadata(fields.get('og:site_name') || base.hostname.replace(/^www\./, ''), 100);
  let image: string | undefined;
  const candidate = entities(fields.get('og:image:secure_url') || fields.get('og:image') || fields.get('twitter:image') || '');
  if (candidate) {try {image = publicDealUrl(new URL(candidate, base).toString()).toString();} catch { /* Unsafe images are omitted; owner can replace them. */ }}
  return {title, description, merchant, ...(image ? {image} : {})};
}

/** Fetches only bounded public HTML metadata. Never runs scripts or extracts a price. */
export async function previewDeal(value: unknown, fetchImpl: typeof fetch = fetch): Promise<DealPreview> {
  const original = publicDealUrl(value), controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let current = original;
  try {
    for (let hop = 0; hop <= 3; hop++) {
      await assertPublicDns(current.hostname, fetchImpl, controller.signal);
      const response = await fetchImpl(current.toString(), {headers: {Accept: 'text/html, application/xhtml+xml', 'User-Agent': 'JewKnows-LinkPreview/1.0'}, redirect: 'manual', credentials: 'omit', signal: controller.signal});
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => {});
        if (!location || hop === 3) throw new Error('This link has too many redirects or no public destination. Enter its details manually.');
        current = publicDealUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) {await response.body?.cancel().catch(() => {}); throw new Error('The product page does not allow a preview (HTTP ' + response.status + '). Enter its details manually.');}
      if (!/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.headers.get('content-type') || '')) {await response.body?.cancel().catch(() => {}); throw new Error('This link is not an HTML product page. Enter its details manually.');}
      const data = metadata(await limitedHtml(response), current);
      return {url: original.toString(), title: data.title || current.hostname.replace(/^www\./, ''), description: data.description, merchant: data.merchant, ...(data.image ? {image: data.image} : {}), category: 'General', metadataStatus: data.title && data.description && data.image ? 'complete' : 'partial'};
    }
    throw new Error('The product preview could not be loaded.');
  } catch (reason) {
    if (controller.signal.aborted) throw new Error('The product preview timed out. Enter its details manually.');
    throw reason;
  } finally {clearTimeout(timeout);}
}

export function validatedDeals(value: unknown): DealsSettings {
  if (!value || typeof value !== 'object' || !Array.isArray((value as {deals?: unknown}).deals)) throw new Error('Provide your product picks.');
  const entries = (value as {deals: unknown[]}).deals;
  if (entries.length > 200) throw new Error('Use up to 200 product picks.');
  const ids = new Set<string>();
  return {deals: entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid product pick.');
    const row = entry as Record<string, unknown>, id = plainText(row.id, 100), title = plainText(row.title, 180);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || ids.has(id)) throw new Error('Each product pick needs a unique ID.');
    ids.add(id);
    if (!title) throw new Error('Give product ' + (index + 1) + ' a title.');
    const url = publicDealUrl(row.url).toString(), description = plainText(row.description, 700);
    const category = plainText(row.category, 50) || 'General';
    const merchant = plainText(row.merchant, 100) || new URL(url).hostname.replace(/^www\./, '');
    const imageValue = plainText(row.image, 4096), price = plainText(row.price, 60);
    const image = imageValue ? publicDealUrl(imageValue).toString() : '';
    return {id, title, url, description, category, merchant, ...(image ? {image} : {}), ...(price ? {price} : {}), enabled: row.enabled === true};
  })};
}

export function publicDeals(settings: DealsSettings): DealsSettings {return {deals: settings.deals.filter(deal => deal.enabled)};}

export async function readDeals(db: DealsDatabase): Promise<DealsSettings> {
  const row = await db.prepare('SELECT value FROM settings WHERE key=?').bind(SETTING_KEY).first<{value: string}>();
  return row ? validatedDeals(JSON.parse(row.value)) : {deals: []};
}

export async function saveDeals(db: DealsDatabase, input: unknown): Promise<DealsSettings> {
  const settings = validatedDeals(input);
  await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(SETTING_KEY, JSON.stringify(settings)).run();
  return settings;
}
