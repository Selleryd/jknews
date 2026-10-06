import {publicVideoUrl} from './video';

export const rewardCategories = ['Coffee gear', 'Apps & software', 'Clothing', 'Restaurants', 'Travel', 'Home & living', 'Books & learning', 'Other'] as const;
export type RewardCampaign = {
  id:string; title:string; advertiser:string; category:string; durationSeconds:number;
  videoUrl:string; posterUrl:string; destinationUrl:string; couponCode:string; enabled:boolean;
};
export type PublicRewardCampaign = Omit<RewardCampaign, 'couponCode' | 'enabled'>;
export type RewardSettings = {campaigns:RewardCampaign[]};
export type RewardContext = {db:Pick<D1Database, 'prepare'>; now?:number|(()=>number)};
export type RewardClaim = {campaignId:string; advertiser:string; couponCode:string; destinationUrl:string; claimedAt:string};
type RewardSession = {
  campaignId:string; revision:string; nonce:string; startedAt:number; expiresAt:number;
  lastHeartbeatAt:number; playedSeconds:number; claim?:RewardClaim;
};
const SETTINGS_KEY = 'rewardAdsSettings';
const PREFIX = 'reward-ad-session:';
const SESSION_LIFETIME = 30 * 60 * 1_000;
const PLAYBACK_TOLERANCE = .25;
const COMPLETION_TOLERANCE = .1;
const MAX_PLAYBACK_INCREMENT = 4;
const text = (value:unknown, limit:number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const clock = (context:RewardContext) => typeof context.now === 'function' ? context.now() : context.now ?? Date.now();
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
const digest = async (value:string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, '0')).join('');
const publicUrl = (value:unknown) => publicVideoUrl(value).toString();

export function validateRewardSettings(value:unknown):RewardSettings {
  if (!value || typeof value !== 'object' || !Array.isArray((value as RewardSettings).campaigns)) throw new Error('Provide a reward campaign list.');
  const input = (value as RewardSettings).campaigns;
  if (input.length > 100) throw new Error('Use up to 100 reward campaigns.');
  const ids = new Set<string>();
  const campaigns = input.map((entry:unknown):RewardCampaign => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid reward campaign.');
    const row = entry as Record<string,unknown>, id = text(row.id, 80);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || ids.has(id)) throw new Error('Each reward campaign needs a unique ID.');
    ids.add(id);
    const title = text(row.title, 160), advertiser = text(row.advertiser, 120), couponCode = typeof row.couponCode === 'string' ? row.couponCode.trim() : '';
    if (!title || !advertiser || !couponCode) throw new Error('Add a title, advertiser, and real coupon code to every campaign.');
    if (couponCode.length > 100) throw new Error('Coupon codes can contain up to 100 characters.');
    const durationSeconds = Number(row.durationSeconds);
    if (!Number.isInteger(durationSeconds) || durationSeconds < 15 || durationSeconds > 60) throw new Error('Reward videos require 15 to 60 seconds of playback.');
    const videoUrl = publicUrl(row.videoUrl), video = new URL(videoUrl);
    if (!/\.(?:mp4|webm|ogv)$/i.test(video.pathname)) throw new Error('Use a direct MP4, WebM, or Ogg video file, rather than a video sharing page.');
    const posterUrl = row.posterUrl ? publicUrl(row.posterUrl) : '';
    const destinationUrl = publicUrl(row.destinationUrl);
    const category = rewardCategories.includes(row.category as typeof rewardCategories[number]) ? String(row.category) : 'Other';
    if (typeof row.enabled !== 'boolean') throw new Error('Campaign enabled must be true or false.');
    return {id,title,advertiser,category,durationSeconds,videoUrl,posterUrl,destinationUrl,couponCode,enabled:row.enabled};
  });
  return {campaigns};
}

export async function readRewardSettings(context:RewardContext):Promise<RewardSettings> {
  const row = await context.db.prepare('SELECT value FROM settings WHERE key=?').bind(SETTINGS_KEY).first<{value:string}>();
  return row ? validateRewardSettings(JSON.parse(row.value)) : {campaigns:[]};
}
export async function saveRewardSettings(context:RewardContext, value:unknown):Promise<RewardSettings> {
  const settings = validateRewardSettings(value);
  await context.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(SETTINGS_KEY,JSON.stringify(settings)).run();
  return settings;
}
export function publicRewardCampaigns(settings:RewardSettings):PublicRewardCampaign[] {
  return settings.campaigns.filter(campaign => campaign.enabled).map(({couponCode:_,enabled:__,...campaign}) => campaign);
}
export function publicRewardSettings(settings:RewardSettings) {
  return {campaigns:publicRewardCampaigns(settings), optional:true, disclosure:'Watching is optional. Coupons are supplied by each advertiser and are subject to their terms.'};
}
async function campaignFor(context:RewardContext, id:unknown) {
  const campaign = (await readRewardSettings(context)).campaigns.find(row => row.id === id && row.enabled);
  if (!campaign) throw new Error('This reward campaign is no longer available.');
  return campaign;
}
async function revision(campaign:RewardCampaign) {return digest(JSON.stringify(campaign));}
async function sessionFor(context:RewardContext, token:unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid reward session.');
  const key = PREFIX + token;
  const row = await context.db.prepare('SELECT data FROM cache WHERE key=?').bind(key).first<{data:string}>();
  if (!row) throw new Error('The reward session expired. Start a new view.');
  const session = JSON.parse(row.data) as RewardSession;
  if (!session.claim && clock(context) > session.expiresAt) throw new Error('The reward session expired. Start a new view.');
  return {key, original:row.data, session};
}
async function commitSession(context:RewardContext, key:string, original:string, session:RewardSession) {
  const result = await context.db.prepare('UPDATE cache SET data=?,updated_at=? WHERE key=? AND data=? RETURNING key').bind(JSON.stringify(session),clock(context),key,original).first();
  if (!result) throw new Error('This playback update was already used. Start a new view if needed.');
}

export async function startRewardSession(context:RewardContext, input:{campaignId?:unknown}) {
  const campaign = await campaignFor(context,input.campaignId), startedAt = clock(context);
  const sessionToken = random(), nonce = random();
  const session:RewardSession = {campaignId:campaign.id,revision:await revision(campaign),nonce,startedAt,expiresAt:startedAt+SESSION_LIFETIME,lastHeartbeatAt:startedAt,playedSeconds:0};
  await context.db.prepare("DELETE FROM cache WHERE key LIKE 'reward-ad-session:%' AND updated_at<? AND json_extract(data,'$.claim') IS NULL").bind(startedAt-SESSION_LIFETIME).run();
  await context.db.prepare('INSERT INTO cache(key,data,updated_at) VALUES(?,?,?)').bind(PREFIX+sessionToken,JSON.stringify(session),startedAt).run();
  const {couponCode:_,enabled:__,...publicCampaign} = campaign;
  return {sessionToken,nonce,campaign:publicCampaign,playedSeconds:0,expiresAt:new Date(session.expiresAt).toISOString()};
}

export async function heartbeatRewardSession(context:RewardContext, input:{sessionToken?:unknown;nonce?:unknown;playedSeconds?:unknown;positionSeconds?:unknown}) {
  const {key,original,session} = await sessionFor(context,input.sessionToken);
  if (session.claim) return {nonce:session.nonce,playedSeconds:session.playedSeconds,ready:true,claimed:true};
  if (input.nonce !== session.nonce) throw new Error('The playback update is stale. Start a new view.');
  const campaign = await campaignFor(context,session.campaignId);
  if (await revision(campaign) !== session.revision) throw new Error('This campaign changed. Start a new view for the current offer.');
  const at = clock(context), playedSeconds = input.playedSeconds, positionSeconds = input.positionSeconds;
  if (typeof playedSeconds !== 'number' || !Number.isFinite(playedSeconds) || typeof positionSeconds !== 'number' || !Number.isFinite(positionSeconds)) throw new Error('Provide a valid native-video playback report.');
  if (at < session.lastHeartbeatAt || playedSeconds < session.playedSeconds || playedSeconds > campaign.durationSeconds+COMPLETION_TOLERANCE || positionSeconds < 0 || positionSeconds > playedSeconds+PLAYBACK_TOLERANCE) throw new Error('Playback cannot move forward by seeking or backwards in recorded time.');
  const delta = playedSeconds-session.playedSeconds, elapsed = (at-session.lastHeartbeatAt)/1_000;
  if (delta > MAX_PLAYBACK_INCREMENT || delta > elapsed+PLAYBACK_TOLERANCE || playedSeconds > (at-session.startedAt)/1_000+PLAYBACK_TOLERANCE) throw new Error('The playback report exceeds elapsed time or missed its regular confirmations. Watch the video at normal speed.');
  session.playedSeconds = Math.min(campaign.durationSeconds,Math.round(playedSeconds*100)/100);
  session.lastHeartbeatAt = at;
  session.nonce = random();
  await commitSession(context,key,original,session);
  return {nonce:session.nonce,playedSeconds:session.playedSeconds,ready:session.playedSeconds>=campaign.durationSeconds-COMPLETION_TOLERANCE,claimed:false};
}

export async function claimReward(context:RewardContext, input:{sessionToken?:unknown;nonce?:unknown}):Promise<RewardClaim> {
  const {key,original,session} = await sessionFor(context,input.sessionToken);
  // An earned code is durable and repeat claims return the same historical offer.
  if (session.claim) return session.claim;
  if (input.nonce !== session.nonce) throw new Error('Use the latest playback confirmation before claiming.');
  const campaign = await campaignFor(context,session.campaignId);
  if (await revision(campaign) !== session.revision) throw new Error('This campaign changed. Start a new view for the current offer.');
  const at = clock(context);
  if (session.playedSeconds < campaign.durationSeconds-COMPLETION_TOLERANCE || (at-session.startedAt)/1_000 < campaign.durationSeconds-COMPLETION_TOLERANCE) throw new Error('Finish the required video playback before revealing this reward.');
  session.claim = {campaignId:campaign.id,advertiser:campaign.advertiser,couponCode:campaign.couponCode,destinationUrl:campaign.destinationUrl,claimedAt:new Date(at).toISOString()};
  try {await commitSession(context,key,original,session);} catch (error) {
    const latest = await sessionFor(context,input.sessionToken);
    if (latest.session.claim) return latest.session.claim;
    throw error;
  }
  return session.claim;
}
