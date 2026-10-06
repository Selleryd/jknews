'use client';

import {useEffect, useState} from 'react';
import {ArrowUpRight, Film, Play, Radio} from 'lucide-react';
import type {VideoSettings} from '@/lib/video';

const providerLabel = {youtube: 'YouTube', drive: 'Google Drive', direct: 'Hosted video'};

export function VideoTheater({initialSettings}: {initialSettings?: VideoSettings}) {
  const [settings, setSettings] = useState<VideoSettings>(initialSettings || {videos: []});
  const [selected, setSelected] = useState(initialSettings?.featuredId || '');
  const [failed, setFailed] = useState(false);
  const [serviceError, setServiceError] = useState(false);
  useEffect(() => {
    let disposed = false;
    async function load() {
      try {
        const response = await fetch('/api/videos');
        if (!response.ok) throw new Error('Video playlist unavailable.');
        const data: VideoSettings = await response.json();
        if (disposed) return;
        setSettings(data); setServiceError(false);
        setSelected(previous => data.videos.some(video => video.id === previous) ? previous : data.featuredId || data.videos[0]?.id || '');
      } catch { if (!disposed) setServiceError(true); }
    }
    void load();
    const timer = setInterval(() => {if (document.visibilityState === 'visible') void load();}, 120_000);
    return () => {disposed = true; clearInterval(timer);};
  }, []);
  const available = settings.videos.filter(video => video.enabled);
  const video = available.find(item => item.id === selected) || available.find(item => item.id === settings.featuredId) || available[0];
  useEffect(() => {setFailed(false);}, [video?.id, video?.url]);
  return <section className="video-theater" aria-labelledby="video-theater-heading">
    <div className="theater-heading"><div><span className="eyebrow">THE SIGNAL ROOM</span><h2 id="video-theater-heading">A wider view.</h2></div><span className="theater-heading-label"><Radio size={14}/> Selected by the newsroom</span></div>
    <div className="theater-television">
      <div className="theater-screen">
        {video ? video.provider === 'direct' ? <video key={video.id + video.url} controls playsInline preload="metadata" poster={video.poster} aria-label={video.title} onError={() => setFailed(true)}><source src={video.url}/>Your browser does not support embedded video. <a href={video.url}>Open the original video</a>.</video> : <iframe key={video.id + video.url} src={video.embedUrl} title={video.title} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" loading="lazy"/> : <div className="theater-standby"><div className="theater-standby-mark"><Film size={34} strokeWidth={1}/></div><span className="eyebrow">JEW KNOWS · VIDEO</span><h3>The screen is yours.</h3><p>{serviceError ? 'The video playlist is temporarily unavailable.' : 'New films and dispatches are on their way.'}</p><div className="theater-standby-line"/></div>}
      </div>
      <div className="theater-bezel"><span>JEW KNOWS</span><span className="theater-indicator" aria-hidden="true"/></div>
    </div>
    <div className="theater-pedestal" aria-hidden="true"/>
    {video && <div className="theater-caption"><div><span className="eyebrow">{providerLabel[video.provider]}</span><h3>{video.title}</h3>{video.description && <p>{video.description}</p>}{failed && <p className="theater-playback-error" role="status">This video cannot play here. Open the original video to continue watching.</p>}</div><a href={video.url} target="_blank" rel="noopener noreferrer" className="text-button">Original video <ArrowUpRight size={15}/></a></div>}
    {available.length > 1 && <div className="theater-playlist" role="group" aria-label="Select a newsroom video">{available.map((item, index) => <button key={item.id} onClick={() => setSelected(item.id)} aria-pressed={video?.id === item.id} className={video?.id === item.id ? 'selected' : ''}><span className="theater-playlist-number">{String(index + 1).padStart(2, '0')}</span><span><span className="eyebrow">{providerLabel[item.provider]}</span><strong>{item.title}</strong></span><Play size={14} fill="currentColor"/></button>)}</div>}
  </section>;
}
