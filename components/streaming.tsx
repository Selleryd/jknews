'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowUpRight, Captions, ChevronRight, Download, Radio, Square, Tv, Volume2} from 'lucide-react';
import {STREAMING_CATEGORIES, type NewsChannel, type PublicStreamingSettings, type StreamingCategory} from '@/lib/streaming';

type CaptionLine = {at:string; text:string};
type CaptureSession = {active:boolean; stream:MediaStream; recorder?:MediaRecorder; timer?:ReturnType<typeof setTimeout>; deadline?:ReturnType<typeof setTimeout>; pending:Blob[]; sending:boolean; abort:AbortController};
const categoryLabels: Record<StreamingCategory,string> = {World:'World',US:'United States',Markets:'Markets','Middle East':'Middle East'};

function useBroadcastCaptions(channelId?: string) {
  const [running,setRunning] = useState(false), [starting,setStarting] = useState(false);
  const [error,setError] = useState(''), [lines,setLines] = useState<CaptionLine[]>([]);
  const session = useRef<CaptureSession | null>(null), mounted = useRef(true), permissionRequest = useRef(0);
  const stop = useCallback(() => {
    permissionRequest.current++;
    const current = session.current;
    session.current = null;
    if (current) {
      current.active = false;
      clearTimeout(current.timer); clearTimeout(current.deadline);
      current.abort.abort(); current.pending.length = 0;
      if (current.recorder?.state !== 'inactive') current.recorder?.stop();
      current.stream.getTracks().forEach(track => track.stop());
    }
    if (mounted.current) {setRunning(false); setStarting(false);}
  },[]);
  useEffect(() => {
    mounted.current = true;
    const visibility = () => {if (document.visibilityState !== 'visible') stop();};
    document.addEventListener('visibilitychange',visibility);
    return () => {mounted.current = false; document.removeEventListener('visibilitychange',visibility); stop();};
  },[stop]);
  useEffect(() => {stop(); setLines([]); setError('');},[channelId,stop]);

  async function start() {
    if (starting || running) return;
    setError(''); setStarting(true);
    const attempt = ++permissionRequest.current;
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') throw new Error('Tab-audio captions need a supported desktop browser. Use the broadcaster’s CC controls on this device.');
      const options = {video:true,audio:true,preferCurrentTab:true,selfBrowserSurface:'include',systemAudio:'exclude'} as DisplayMediaStreamOptions;
      stream = await navigator.mediaDevices.getDisplayMedia(options);
      if (!mounted.current || attempt !== permissionRequest.current || document.visibilityState !== 'visible') {stream.getTracks().forEach(track => track.stop()); return;}
      const videoTrack = stream.getVideoTracks()[0];
      const surface = videoTrack?.getSettings().displaySurface;
      if (surface !== 'browser') throw new Error('Choose this browser tab, rather than a screen or application window.');
      if (!stream.getAudioTracks().length) throw new Error('Choose this tab and enable “Share tab audio” in your browser’s permission dialog. No microphone is used.');
      const mime = ['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(value => MediaRecorder.isTypeSupported(value));
      if (!mime) throw new Error('This browser cannot record a compatible audio segment. Use the broadcaster’s CC controls.');
      const current: CaptureSession = {active:true,stream,pending:[],sending:false,abort:new AbortController()};
      session.current = current;
      stream.getTracks().forEach(track => {track.onended = () => stop();});
      const audioOnly = new MediaStream(stream.getAudioTracks());
      async function drain() {
        if (!current.active || current.sending) return;
        current.sending = true;
        try {
          while (current.active && current.pending.length) {
            const audio = current.pending.shift()!;
            const response = await fetch('/api/streaming/transcribe',{method:'POST',headers:{'Content-Type':audio.type || mime!, 'X-Broadcast-Consent':'tab-audio'},body:audio,signal:current.abort.signal});
            const data = await response.json() as {text?:string;error?:string};
            if (!response.ok) throw new Error(data.error || 'Captions are temporarily unavailable.');
            if (current.active && mounted.current && data.text) setLines(previous => [...previous,{at:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}),text:data.text!}].slice(-100));
          }
        } catch (reason) {
          if (current.active && mounted.current) {setError((reason as Error).message); stop();}
        } finally {current.sending = false;}
      }
      const record = () => {
        if (!current.active) return;
        const fragments: Blob[] = [];
        // Each recorder is finalized and restarted. Timeslice fragments alone
        // may omit WebM headers and are not independent transcription inputs.
        const recorder = new MediaRecorder(audioOnly,{mimeType:mime,audioBitsPerSecond:64_000});
        current.recorder = recorder;
        recorder.ondataavailable = event => {if (event.data.size) fragments.push(event.data);};
        recorder.onerror = () => {if (mounted.current) setError('The browser stopped recording tab audio.'); stop();};
        recorder.onstop = () => {
          if (!current.active) return;
          const audio = new Blob(fragments,{type:mime});
          if (audio.size > 2_000_000 || current.pending.length >= 2) {setError('Caption processing is falling behind. Start a new session when the connection improves.'); stop(); return;}
          if (audio.size) current.pending.push(audio);
          void drain(); record();
        };
        recorder.start();
        current.timer = setTimeout(() => {if (recorder.state !== 'inactive') recorder.stop();},15_000);
      };
      record(); setLines([]); setRunning(true);
      current.deadline = setTimeout(() => {if (mounted.current) setError('This five-minute caption session is complete. You can start another.'); stop();},300_000);
    } catch (reason) {
      stream?.getTracks().forEach(track => track.stop());
      if (mounted.current && attempt === permissionRequest.current) setError((reason as Error).name === 'NotAllowedError' ? 'Tab sharing was not enabled. You can try again or use the broadcaster’s CC controls.' : (reason as Error).message);
    } finally {if (mounted.current && attempt === permissionRequest.current) setStarting(false);}
  }
  return {running,starting,error,lines,start,stop};
}

export function StreamingHub({initialSettings}: {initialSettings?:PublicStreamingSettings}) {
  const [settings,setSettings] = useState<PublicStreamingSettings | undefined>(initialSettings);
  const [selected,setSelected] = useState(initialSettings?.featuredId || '');
  const [category,setCategory] = useState<StreamingCategory | 'All'>('All');
  const [loading,setLoading] = useState(!initialSettings), [serviceError,setServiceError] = useState('');
  const [consented,setConsented] = useState(false), [failed,setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/streaming',{signal:controller.signal});
        if (!response.ok) throw new Error('The channel desk is temporarily unavailable.');
        const data = await response.json() as PublicStreamingSettings;
        if (!active) return;
        setSettings(data); setServiceError('');
        setSelected(previous => data.channels.some(channel => channel.id === previous) ? previous : data.featuredId || data.channels[0]?.id || '');
      } catch (reason) {if (active) setServiceError((reason as Error).message);}
      finally {if (active) setLoading(false);}
    }
    void load();
    const interval = setInterval(() => {if (document.visibilityState === 'visible') void load();},120_000);
    return () => {active = false; controller.abort(); clearInterval(interval);};
  },[]);
  const channels = settings?.channels || [];
  const channel = channels.find(item => item.id === selected) || channels[0];
  const filtered = channels.filter(item => category === 'All' || item.category === category);
  const captions = useBroadcastCaptions(channel ? channel.id + channel.url : undefined);
  useEffect(() => {if (!settings?.transcriptionReady) captions.stop();},[settings?.transcriptionReady,captions.stop]);
  useEffect(() => {setFailed(false); setConsented(false);},[channel?.id,channel?.url]);
  const playerUrl = channel?.provider === 'youtube' && channel.embedUrl ? channel.embedUrl + '&cc_load_policy=1' : channel?.embedUrl;
  function downloadTranscript() {
    const content = ['Jew Knows · Viewer caption session',channel?.name || '', 'Machine transcript; verify names and claims against the original broadcast.','',...captions.lines.map(line => line.at + '  ' + line.text)].join('\n');
    const url = URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = 'jew-knows-caption-session.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  return <section className="streaming-hub" aria-labelledby="streaming-heading">
    <div className="streaming-heading"><div><span className="eyebrow">THE BROADCAST DESK</span><h1 id="streaming-heading">The world. On screen.</h1><p>Major newsrooms, one place. Choose your perspective.</p></div><span className="streaming-free"><Tv size={15}/>Subscription-free on Jew Knows</span></div>
    <div className="streaming-topics" role="group" aria-label="Filter news channels">{(['All',...STREAMING_CATEGORIES] as const).map(value => <button key={value} onClick={() => setCategory(value)} className={category === value ? 'selected' : ''} aria-pressed={category === value}>{value === 'All' ? 'All channels' : categoryLabels[value]}<span>{channels.filter(item => value === 'All' || item.category === value).length}</span></button>)}</div>
    {serviceError && <p className="streaming-service-error" role="status">{serviceError}</p>}
    <div className="streaming-workspace"><div className="streaming-main"><div className="streaming-stage">
      <div className="streaming-screen">{loading ? <div className="streaming-standby"><Radio size={35}/><span>Opening the broadcast…</span></div> : channel ? channel.provider === 'source' ? <div className="streaming-original"><span className="streaming-original-monogram">{channel.name.split(' ').slice(0,2).map(word => word[0]).join('')}</span><span className="eyebrow">OFFICIAL BROADCASTER PLAYER</span><h2>{channel.name}</h2><p>{channel.description}</p><a href={channel.sourceUrl} target="_blank" rel="noopener noreferrer" className="button dark">Watch on their site<ArrowUpRight size={16}/></a></div> : channel.provider === 'direct' ? <video key={channel.id + channel.url} controls playsInline preload="none" aria-label={channel.name} onError={() => setFailed(true)}><source src={channel.url}/>Open the original broadcaster below.</video> : <iframe key={channel.id + channel.url} src={playerUrl} title={channel.name + ' official broadcaster stream'} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/> : <div className="streaming-standby"><Tv size={35}/><span>New channels are on their way.</span></div>}</div>
      <div className="streaming-bezel"><span>JEW KNOWS</span><span>INDEPENDENT VIEW · ORIGINAL SOURCES</span><span className="streaming-bezel-light"/></div>
    </div>
    {channel && <div className="streaming-now"><div><span className="eyebrow">{categoryLabels[channel.category]} · {channel.provider === 'source' ? 'Original live page' : 'Broadcaster stream'}</span><h2>{channel.name}</h2><p>{channel.description}</p></div><a href={channel.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-button">Official live page<ArrowUpRight size={14}/></a></div>}
    {(failed || channel?.provider !== 'source') && channel && <p className="streaming-provider-note">{failed ? 'This video cannot play here. ' : ''}If the stream has ended or playback is restricted, use the official live page. Captions and regional access follow the broadcaster.</p>}
    <section className="streaming-captions" aria-labelledby="streaming-captions-heading"><div className="streaming-captions-head"><div><Captions size={21}/><div><h3 id="streaming-captions-heading">Follow every word.</h3><span>{captions.running ? 'Capturing shared tab audio · updates every 15 seconds' : 'Use the player’s CC button for broadcaster captions'}</span></div></div>{captions.lines.length > 0 && <button onClick={downloadTranscript} className="text-button" aria-label="Download this caption session"><Download size={15}/>Save transcript</button>}</div>
      {channel?.provider !== 'source' && <div className="streaming-capture-controls">{settings?.transcriptionReady ? captions.running ? <button className="button outline" onClick={captions.stop}><Square size={13} fill="currentColor"/>Stop tab captions</button> : <><label className="streaming-consent"><input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)}/><span>I agree to send this news tab’s audio to OpenAI for captions. Audio and captions are not saved on Jew Knows.</span></label><button className="button outline" disabled={!consented || captions.starting || !channel} onClick={() => void captions.start()}><Volume2 size={15}/>{captions.starting ? 'Choose this tab…' : 'Start tab captions'}</button></> : <p>Live captions are temporarily unavailable. Use the broadcaster’s CC controls where available.</p>}</div>}
      {captions.error && <p className="streaming-caption-error" role="status">{captions.error}</p>}
      {!!captions.lines.length && <div className="streaming-transcript" role="log" aria-label="Machine caption transcript" aria-live="polite">{captions.lines.map((line,index) => <p key={index}><time>{line.at}</time><span>{line.text}</span></p>)}</div>}
      {settings?.transcriptionReady && <p className="streaming-caption-footnote">Choose this browser tab and “Share tab audio” when prompted. Your microphone is never requested. Sessions stop when you leave the page, switch tabs, change channels, or after five minutes. Machine captions can contain errors.</p>}
    </section></div>
    <aside className="streaming-channel-desk" aria-label="News channel lineup"><div className="streaming-channel-desk-head"><span className="eyebrow">CHANNEL DIRECTORY</span><span>{filtered.length} sources</span></div><div className="streaming-channel-list">{filtered.map((item,index) => <button key={item.id} onClick={() => setSelected(item.id)} aria-pressed={channel?.id === item.id} className={channel?.id === item.id ? 'selected' : ''}><span className="streaming-channel-index">{String(index + 1).padStart(2,'0')}</span><span><strong>{item.name}</strong><small>{categoryLabels[item.category]} · {item.provider === 'source' ? 'Official live page' : 'Watch here'}</small></span><ChevronRight size={15}/></button>)}</div><p>Broadcasts belong to their original newsrooms. Jew Knows does not alter their coverage. Provider ads, access rules, and availability may apply.</p></aside></div>
  </section>;
}
