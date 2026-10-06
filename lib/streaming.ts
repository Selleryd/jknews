import {normalizeVideoUrl, publicVideoUrl, type VideoProvider} from './video';

export const STREAMING_CATEGORIES = ['World', 'US', 'Markets', 'Middle East'] as const;
export type StreamingCategory = typeof STREAMING_CATEGORIES[number];
export type NewsChannel = {
  id: string; name: string; category: StreamingCategory; description: string;
  url: string; sourceUrl: string; provider: VideoProvider | 'source'; embedUrl?: string;
  enabled: boolean; verifiedAt?: string;
};
export type StreamingSettings = {channels: NewsChannel[]; featuredId?: string; transcriptionEnabled: boolean};
export type PublicStreamingSettings = StreamingSettings & {transcriptionReady: boolean};
type StreamingDatabase = Pick<D1Database, 'prepare'>;
export const STREAMING_SETTING_KEY = 'streamingSettings';
export const TRANSCRIPTION_MAX_BYTES = 2_000_000;
const text = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

/* Official broadcaster links checked 5 October 2026. A stream is a broadcaster's
 * own player, never a copied or re-hosted broadcast. Daily stream IDs can change;
 * the permanent original-source link stays available beside every player. */
export const DEFAULT_NEWS_CHANNELS: NewsChannel[] = [
  {id:'sky',name:'Sky News',category:'World',description:'Global headlines and rolling coverage from Sky News.',url:'https://www.youtube.com/watch?v=xDWQ3LkccY8',sourceUrl:'https://news.sky.com/watch-live'},
  {id:'nbc',name:'NBC News NOW',category:'US',description:'NBC News’ rolling coverage. Daily broadcasts may change their video address.',url:'https://www.youtube.com/watch?v=65o-WfaOkvQ',sourceUrl:'https://www.youtube.com/channel/UCeY0bbntWzzVIaj2z3QigXg/live'},
  {id:'abc',name:'ABC News Live',category:'US',description:'ABC News’ live coverage. Daily broadcasts may change their video address.',url:'https://www.youtube.com/watch?v=D5fkCngw8zU',sourceUrl:'https://www.youtube.com/@ABCNews/live'},
  {id:'cbs',name:'CBS News 24/7',category:'US',description:'Breaking news and original reporting from CBS News.',url:'https://www.youtube.com/live/ZlT7vyFF5cY',sourceUrl:'https://www.cbsnews.com/live/'},
  {id:'france24',name:'FRANCE 24 English',category:'World',description:'International reporting from FRANCE 24’s English newsroom.',url:'https://www.youtube.com/watch?v=HvZt-nh9sGg',sourceUrl:'https://www.france24.com/en/live'},
  {id:'dw',name:'DW News',category:'World',description:'World news and analysis from Deutsche Welle.',url:'https://www.youtube.com/watch?v=LuKwFajn37U',sourceUrl:'https://www.dw.com/en/live-tv/channel-english'},
  {id:'aljazeera',name:'Al Jazeera English',category:'Middle East',description:'Global coverage from Al Jazeera English. Availability varies by region.',url:'https://www.youtube.com/watch?v=gCNeDWCI0vo',sourceUrl:'https://www.aljazeera.com/video/live'},
  {id:'bloomberg',name:'Bloomberg Television',category:'Markets',description:'Business, finance, and global market coverage from Bloomberg.',url:'https://www.youtube.com/watch?v=QB5BNdBFujE',sourceUrl:'https://www.bloomberg.com/live/'},
  {id:'livenow',name:'LiveNOW from FOX',category:'US',description:'Continuous event coverage on the broadcaster’s official live page.',url:'https://www.livenowfox.com/live',sourceUrl:'https://www.livenowfox.com/live',provider:'source'},
  {id:'cnn',name:'CNN',category:'World',description:'Open CNN’s official Watch section. A CNN subscription or eligible TV-provider sign-in is required for full live access.',url:'https://www.cnn.com/',sourceUrl:'https://www.cnn.com/',provider:'source'},
  {id:'alexjoneslive',name:'Alex Jones Live',category:'US',description:'The Alex Jones Show and network broadcasts on the official live page. Broadcaster access rules may apply.',url:'https://www.alexjoneslive.com/show/',sourceUrl:'https://www.alexjoneslive.com/show/',provider:'source'},
].map(channel => ({...channel, category: channel.category as StreamingCategory, ...(channel.provider === 'source' ? {provider: 'source' as const} : normalizeVideoUrl(channel.url)), enabled:true, verifiedAt:'2026-10-05'}));

export function defaultStreamingSettings(): StreamingSettings {
  return {channels: DEFAULT_NEWS_CHANNELS.map(channel => ({...channel})), featuredId:'sky', transcriptionEnabled:true};
}

export function validatedStreamingSettings(value: unknown): StreamingSettings {
  if (!value || typeof value !== 'object' || !Array.isArray((value as {channels?: unknown}).channels)) throw new Error('Provide the news channel list.');
  const body = value as Record<string, unknown> & {channels: unknown[]};
  if (body.channels.length > 100) throw new Error('Use up to 100 news channels.');
  const ids = new Set<string>();
  const channels = body.channels.map((entry, index): NewsChannel => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid news channel.');
    const row = entry as Record<string, unknown>, id = text(row.id,100), name = text(row.name,160);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || ids.has(id)) throw new Error('Every channel needs a unique ID.');
    ids.add(id);
    if (!name) throw new Error('Name channel ' + (index + 1) + '.');
    if (!STREAMING_CATEGORIES.includes(row.category as StreamingCategory)) throw new Error('Choose a news channel category.');
    const sourceUrl = publicVideoUrl(row.sourceUrl || row.url).toString();
    const normalized = row.provider === 'source' ? {url:publicVideoUrl(row.url).toString(),provider:'source' as const} : normalizeVideoUrl(row.url);
    const verifiedAt = text(row.verifiedAt,10);
    if (verifiedAt && !/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt)) throw new Error('Use YYYY-MM-DD for the checked date.');
    return {id,name,category:row.category as StreamingCategory,description:text(row.description,600),sourceUrl,...normalized,enabled:row.enabled === true,...(verifiedAt ? {verifiedAt} : {})};
  });
  const featuredId = text(body.featuredId,100);
  if (featuredId && !channels.some(channel => channel.id === featuredId)) throw new Error('Choose a featured channel from this list.');
  return {channels,...(featuredId ? {featuredId} : {}),transcriptionEnabled:body.transcriptionEnabled === true};
}

export async function readStreamingSettings(db: StreamingDatabase): Promise<StreamingSettings> {
  const row = await db.prepare('SELECT value FROM settings WHERE key=?').bind(STREAMING_SETTING_KEY).first<{value:string}>();
  return row ? validatedStreamingSettings(JSON.parse(row.value)) : defaultStreamingSettings();
}

export async function saveStreamingSettings(db: StreamingDatabase, value: unknown): Promise<StreamingSettings> {
  const settings = validatedStreamingSettings(value);
  await db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(STREAMING_SETTING_KEY,JSON.stringify(settings)).run();
  return settings;
}

export function publicStreamingSettings(settings: StreamingSettings, providerReady = false): PublicStreamingSettings {
  const channels = settings.channels.filter(channel => channel.enabled);
  const featuredId = channels.some(channel => channel.id === settings.featuredId) ? settings.featuredId : channels[0]?.id;
  return {channels,...(featuredId ? {featuredId} : {}),transcriptionEnabled:settings.transcriptionEnabled,transcriptionReady:settings.transcriptionEnabled && providerReady};
}

/** Short, independently finalized browser recordings. No audio or text is saved.
 * The route must enforce same-origin, rate limits, provider readiness and this
 * byte limit before reading the body; never accept a URL to fetch for recording. */
export async function transcribeChunk(apiKey: string | undefined, audio: Blob, send: typeof fetch = fetch): Promise<{text:string}> {
  if (!apiKey) throw new Error('Live transcription is not connected. Use the broadcaster’s CC controls.');
  if (!audio.size || audio.size > TRANSCRIPTION_MAX_BYTES) throw new Error('The audio segment must be between 1 byte and 2 MB.');
  const mime = audio.type.toLowerCase().split(';')[0];
  if (!['audio/webm','video/webm','audio/mp4','video/mp4','audio/wav','audio/mpeg'].includes(mime)) throw new Error('Unsupported audio recording format.');
  const head = new Uint8Array(await audio.slice(0,12).arrayBuffer());
  const isWebm = head.length >= 4 && [0x1a,0x45,0xdf,0xa3].every((byte,index) => head[index] === byte);
  const ascii = (start:number,length:number) => String.fromCharCode(...head.slice(start,start + length));
  const containerValid = mime.includes('webm') ? isWebm : mime.includes('mp4') ? ascii(4,4) === 'ftyp' : mime.includes('wav') ? ascii(0,4) === 'RIFF' && ascii(8,4) === 'WAVE' : ascii(0,3) === 'ID3' || head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
  if (!containerValid) throw new Error('The audio recording does not have a valid container header.');
  const extension = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'mp4' : mime.includes('wav') ? 'wav' : 'mp3';
  const form = new FormData();
  form.append('file',audio,'broadcast-segment.' + extension);
  form.append('model','gpt-4o-mini-transcribe');
  form.append('response_format','json');
  const response = await send('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer ' + apiKey},body:form,signal:AbortSignal.timeout(45_000)});
  if (!response.ok) throw new Error(response.status === 429 ? 'Caption service is busy. Please try again shortly.' : 'The caption service could not transcribe this segment.');
  const result = await response.json() as {text?:unknown};
  if (typeof result.text !== 'string') throw new Error('The caption service returned no transcript.');
  return {text:result.text.trim().slice(0,12_000)};
}
