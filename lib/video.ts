export type VideoProvider = 'youtube' | 'drive' | 'direct';
export type NewsroomVideo = {
  id: string;
  title: string;
  url: string;
  provider: VideoProvider;
  embedUrl?: string;
  poster?: string;
  description?: string;
  enabled: boolean;
};
export type VideoSettings = {videos: NewsroomVideo[]; featuredId?: string};
type VideoDatabase = Pick<D1Database, 'prepare'>;

const SETTING_KEY = 'videoSettings';
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const youtubePrivacyHosts = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);
const text = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';

function privateHost(host: string): boolean {
  const name = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!name || name === 'localhost' || !name.includes('.') && !name.includes(':') || /\.(?:localhost|local|internal|lan|home|test|invalid)$/.test(name)) return true;
  if (name.includes(':')) {
    // Literal IPv6 URLs are unnecessary for hosted playback and are excluded,
    // including IPv4-mapped addresses and link-local/unique-local variants.
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) {
    const [a, b] = name.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19);
  }
  return false;
}

/** URL playback never downloads or proxies media through the Site's server. */
export function publicVideoUrl(value: unknown): URL {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) throw new Error('Enter a public HTTPS video address.');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a valid video address.'); }
  if (url.protocol !== 'https:' || url.username || url.password || privateHost(url.hostname) || url.port && url.port !== '443') throw new Error('Use a public HTTPS address without credentials or a private network host.');
  return url;
}

export function normalizeVideoUrl(value: unknown): {url: string; provider: VideoProvider; embedUrl?: string} {
  const url = publicVideoUrl(value);
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  let videoId = '';
  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] || '';
  } else if (youtubeHosts.has(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    videoId = parts[0] === 'watch' ? url.searchParams.get('v') || '' : ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] || '' : '';
  } else if (youtubePrivacyHosts.has(host)) {
    videoId = /^\/embed\/([^/]+)\/?$/.exec(url.pathname)?.[1] || '';
  }
  if (host === 'youtu.be' || youtubeHosts.has(host) || youtubePrivacyHosts.has(host)) {
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error('Use a YouTube video link with a valid video ID.');
    return {url: 'https://www.youtube.com/watch?v=' + videoId, provider: 'youtube', embedUrl: 'https://www.youtube-nocookie.com/embed/' + videoId + '?rel=0'};
  }
  if (host === 'drive.google.com') {
    const driveId = /^\/file\/d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/.exec(url.pathname)?.[1] || ['/open', '/uc'].includes(url.pathname) && url.searchParams.get('id') || '';
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(driveId)) throw new Error('Use a Google Drive file sharing link.');
    return {url: 'https://drive.google.com/file/d/' + driveId + '/view', provider: 'drive', embedUrl: 'https://drive.google.com/file/d/' + driveId + '/preview'};
  }
  // Similar-looking provider domains are not treated as trusted embed services.
  // A direct URL is loaded only by the browser's native video element.
  url.hash = '';
  return {url: url.toString(), provider: 'direct'};
}

export function validatedVideoSettings(value: unknown): VideoSettings {
  if (!value || typeof value !== 'object' || !Array.isArray((value as {videos?: unknown}).videos)) throw new Error('Provide a video playlist.');
  const input = value as {videos: unknown[]; featuredId?: unknown};
  if (input.videos.length > 200) throw new Error('Use up to 200 playlist entries.');
  const ids = new Set<string>();
  const videos: NewsroomVideo[] = input.videos.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid video playlist entry.');
    const row = entry as Record<string, unknown>;
    const id = text(row.id, 100), title = text(row.title, 160);
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || ids.has(id)) throw new Error('Each video needs a unique ID.');
    ids.add(id);
    if (!title) throw new Error('Give video ' + (index + 1) + ' a title.');
    const normalized = normalizeVideoUrl(row.url);
    const posterText = text(row.poster, 4096);
    const poster = posterText ? publicVideoUrl(posterText).toString() : '';
    const description = text(row.description, 1000);
    return {id, title, ...normalized, ...(poster ? {poster} : {}), ...(description ? {description} : {}), enabled: row.enabled === true};
  });
  const featuredId = text(input.featuredId, 100);
  if (featuredId && !videos.some(video => video.id === featuredId)) throw new Error('Choose a featured video from your playlist.');
  return {videos, ...(featuredId ? {featuredId} : {})};
}

export function publicVideoSettings(settings: VideoSettings): VideoSettings {
  const videos = settings.videos.filter(video => video.enabled);
  const featuredId = videos.some(video => video.id === settings.featuredId) ? settings.featuredId : videos[0]?.id;
  return {videos, ...(featuredId ? {featuredId} : {})};
}

export async function readVideoSettings(db: VideoDatabase): Promise<VideoSettings> {
  const row = await db.prepare('SELECT value FROM settings WHERE key=?').bind(SETTING_KEY).first<{value: string}>();
  return row ? validatedVideoSettings(JSON.parse(row.value)) : {videos: []};
}

export async function saveVideoSettings(db: VideoDatabase, body: unknown): Promise<VideoSettings> {
  const settings = validatedVideoSettings(body);
  await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .bind(SETTING_KEY, JSON.stringify(settings)).run();
  return settings;
}
