'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Check,Copy,Gift,Loader2,Play,ShieldCheck} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import type {PublicRewardCampaign,RewardClaim} from '@/lib/reward-ads';

async function api<T>(path:string,body?:unknown):Promise<T>{
  const response=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json() as T & {error?:string};if(!response.ok)throw new Error(result.error||'This reward is temporarily unavailable.');return result;
}
type PlaybackSession={sessionToken:string;nonce:string;campaign:PublicRewardCampaign;playedSeconds:number;expiresAt:string};

export function RewardAds({compact=false}:{compact?:boolean}){
  const [campaigns,setCampaigns]=useState<PublicRewardCampaign[]>([]),[loaded,setLoaded]=useState(false),[category,setCategory]=useState('All rewards'),[selected,setSelected]=useState<PublicRewardCampaign|null>(null),[error,setError]=useState('');
  useEffect(()=>{let alive=true;api<{campaigns:PublicRewardCampaign[]}>('rewards').then(result=>{if(alive)setCampaigns(result.campaigns||[])}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoaded(true)});return()=>{alive=false}},[]);
  const categories=['All rewards',...new Set(campaigns.map(campaign=>campaign.category))];
  const visible=campaigns.filter(campaign=>category==='All rewards'||campaign.category===category);
  return <section className={'reward-hub '+(compact?'reward-hub-compact':'')} id="rewards" aria-labelledby="reward-heading">
    <div className="reward-intro"><div><span className="eyebrow">A MOMENT FOR SOMETHING GOOD</span><h2 id="reward-heading">Watch an ad.<br/><em>Get a little back.</em></h2><p>Discover a brand. Enjoy a short film. Reveal an advertiser’s coupon after {campaigns.length?'15–60 seconds of playback':'a short rewarded view'}.</p><span className="reward-optional">Always optional. Your news stays open.</span></div><div className="reward-hero-mark" aria-hidden="true"><span/><Gift size={38} strokeWidth={1}/><span/></div></div>
    {!loaded?<div className="reward-empty"><Loader2 className="spin" size={19}/><p>Looking for a little something.</p></div>:error?<div className="reward-empty"><p>{error}</p></div>:campaigns.length?<>
      <div className="reward-filters" role="group" aria-label="Reward categories">{categories.map(label=><button key={label} className={category===label?'selected':''} aria-pressed={category===label} onClick={()=>setCategory(label)}>{label}</button>)}</div>
      <div className="reward-grid">{visible.map(campaign=><article className="reward-card" key={campaign.id}><div className="reward-card-image">{campaign.posterUrl?<img src={campaign.posterUrl} alt="" loading="lazy"/>:<div className="reward-placeholder"><Gift size={35} strokeWidth={1}/><span>{campaign.category}</span></div>}<span className="reward-duration">{campaign.durationSeconds} seconds</span></div><div className="reward-card-copy"><span className="eyebrow">{campaign.advertiser}</span><h3>{campaign.title}</h3><p>A coupon, revealed after playback.</p><button className="reward-watch-button" onClick={()=>setSelected(campaign)}><Play size={15} fill="currentColor"/>Watch an ad<ArrowUpRight size={17}/></button></div></article>)}</div>
    </>:<div className="reward-empty reward-empty-editorial"><Gift size={23} strokeWidth={1}/><div><h3>A small pleasure is on its way.</h3><p>New reward offers are on their way. Check back for a short film and a little thank-you.</p></div></div>}
    <p className="reward-disclosure">Advertisement · Offers come from participating advertisers and are subject to their terms.</p>
    <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected(null)}}><DialogContent className="reward-dialog"><DialogTitle>{selected?.title||'A rewarded view'}</DialogTitle><DialogDescription>{selected?.advertiser} · Optional rewarded advertisement</DialogDescription>{selected&&<RewardPlayer key={selected.id} campaign={selected} close={()=>setSelected(null)}/>}</DialogContent></Dialog>
  </section>;
}

function RewardPlayer({campaign,close}:{campaign:PublicRewardCampaign;close:()=>void}){
  const [session,setSession]=useState<PlaybackSession|null>(null),[played,setPlayed]=useState(0),[confirmed,setConfirmed]=useState(0),[error,setError]=useState(''),[reporting,setReporting]=useState(false),[claiming,setClaiming]=useState(false),[reward,setReward]=useState<RewardClaim|null>(null),[copied,setCopied]=useState(false);
  const video=useRef<HTMLVideoElement>(null),playedRef=useRef(0),confirmedRef=useRef(0),nonceRef=useRef(''),frontier=useRef(0),failed=useRef(false),observation=useRef<{position:number;at:number}|null>(null),pending=useRef<Promise<unknown>|null>(null);
  const activeCampaign=session?.campaign||campaign;
  useEffect(()=>{let alive=true;api<PlaybackSession>('rewards/start',{campaignId:campaign.id}).then(result=>{if(alive){setSession(result);nonceRef.current=result.nonce}}).catch(e=>{if(alive)setError(e.message)});return()=>{alive=false;video.current?.pause()}},[campaign.id]);
  const report=useCallback(async()=>{
    if(pending.current)return pending.current;
    if(!session||failed.current||playedRef.current<=confirmedRef.current+.02)return;
    setReporting(true);
    const request=api<{nonce:string;playedSeconds:number}>('rewards/progress',{sessionToken:session.sessionToken,nonce:nonceRef.current,playedSeconds:Math.min(activeCampaign.durationSeconds,Math.round(playedRef.current*100)/100),positionSeconds:Math.min(video.current?.currentTime||0,playedRef.current+.2)}).then(result=>{
      nonceRef.current=result.nonce;confirmedRef.current=result.playedSeconds;setConfirmed(result.playedSeconds);
    }).catch(e=>{failed.current=true;video.current?.pause();setError(e.message)}).finally(()=>{pending.current=null;setReporting(false)});
    pending.current=request;return request;
  },[session,activeCampaign.durationSeconds]);
  useEffect(()=>{
    const hidden=()=>{if(document.hidden){video.current?.pause();observation.current=null}};document.addEventListener('visibilitychange',hidden);
    const timer=setInterval(()=>{void report()},2_000);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',hidden)};
  },[report]);
  function observePlayback(){
    const media=video.current;if(!media||document.hidden||failed.current||media.seeking||media.paused&&!media.ended){observation.current=null;return}
    const at=performance.now(),position=media.currentTime,previous=observation.current;
    observation.current={position,at};if(!previous)return;
    const delta=position-previous.position,elapsed=(at-previous.at)/1_000;
    if(delta<=0)return;
    if(media.playbackRate!==1||delta>elapsed+.3){media.currentTime=Math.min(frontier.current,media.duration||frontier.current);observation.current=null;return}
    playedRef.current=Math.min(activeCampaign.durationSeconds,playedRef.current+delta);frontier.current=Math.max(frontier.current,position);setPlayed(playedRef.current);
    if(playedRef.current>=activeCampaign.durationSeconds){media.pause();if(media.currentTime>activeCampaign.durationSeconds)media.currentTime=activeCampaign.durationSeconds;void report()}
  }
  async function reveal(){
    if(!session)return;setClaiming(true);
    try{await report();if(failed.current)return;setReward(await api<RewardClaim>('rewards/claim',{sessionToken:session.sessionToken,nonce:nonceRef.current}));video.current?.pause()}
    catch(e){setError((e as Error).message)}finally{setClaiming(false)};
  }
  if(reward)return <div className="reward-earned"><span className="reward-earned-mark"><Check size={29}/></span><span className="eyebrow">A LITTLE THANK YOU FROM {reward.advertiser}</span><h3>Your reward, revealed.</h3><p>Use this advertiser-supplied code at checkout. Check the advertiser’s offer terms before purchasing.</p><div className="reward-coupon"><strong>{reward.couponCode}</strong><button className="icon-button" aria-label="Copy coupon code" onClick={async()=>{try{await navigator.clipboard.writeText(reward.couponCode);setCopied(true)}catch{setError('Select and copy the code above.')}}}>{copied?<Check size={19}/>:<Copy size={19}/>}</button></div><span className="reward-copy-status" aria-live="polite">{copied?'Code copied.':''}</span><a className="reward-watch-button" href={reward.destinationUrl} target="_blank" rel="sponsored noopener noreferrer">Visit {reward.advertiser}<ArrowUpRight size={17}/></a><button className="text-button" onClick={close}>Back to the edition</button></div>;
  return <div className="reward-player">
    {!session&&!error?<div className="reward-empty"><Loader2 className="spin" size={21}/><p>Preparing your rewarded view.</p></div>:session&&<video ref={video} src={activeCampaign.videoUrl} poster={activeCampaign.posterUrl||undefined} controls playsInline preload="metadata" controlsList="nodownload noplaybackrate" disablePictureInPicture onPlay={()=>{observation.current={position:video.current?.currentTime||0,at:performance.now()}}} onPause={()=>{observation.current=null}} onTimeUpdate={observePlayback} onEnded={()=>{observePlayback();void report()}} onRateChange={()=>{if(video.current)video.current.playbackRate=1}} onSeeking={()=>{const media=video.current;if(media&&media.currentTime>frontier.current+.3)media.currentTime=frontier.current;observation.current=null}} onLoadedMetadata={()=>{const media=video.current;if(media&&Number.isFinite(media.duration)&&media.duration<activeCampaign.durationSeconds-.1){failed.current=true;setError('This video is shorter than its reward requirement. Try another offer.')}}} onError={()=>{failed.current=true;setError('The advertiser’s video could not load. Try another offer.')}}/>}
    <div className="reward-playback-status"><span>{Math.min(activeCampaign.durationSeconds,Math.floor(played))} / {activeCampaign.durationSeconds} seconds played</span><span>{confirmed>=activeCampaign.durationSeconds-.1?'Playback confirmed':reporting?'Confirming playback…':'At your own pace'}</span></div><div className="reward-progress" role="progressbar" aria-label="Reward playback progress" aria-valuemin={0} aria-valuemax={activeCampaign.durationSeconds} aria-valuenow={Math.floor(played)}><span style={{width:Math.min(100,played/activeCampaign.durationSeconds*100)+'%'}}/></div>
    <div className="reward-playback-note"><ShieldCheck size={17}/><p>Normal playback counts toward your reward. Seeking ahead does not count. Playback pauses when this tab is hidden.</p></div>
    {error&&<div className="reward-error" role="alert"><p>{error}</p><button className="text-button" onClick={close}>Close and try again</button></div>}
    <button className="reward-watch-button full" disabled={confirmed<activeCampaign.durationSeconds-.1||claiming||reporting||!!error} onClick={reveal}>{claiming?<Loader2 size={17} className="spin"/>:<Gift size={17}/>} {claiming?'Revealing your reward…':'Reveal my coupon'}</button><p className="reward-small-note">Watching is optional. Your coupon is supplied by {activeCampaign.advertiser}.</p>
  </div>;
}
