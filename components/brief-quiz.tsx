'use client';

import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Check,Plus} from 'lucide-react';
import {Checkbox} from './ui/checkbox';
import {Progress} from './ui/progress';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from './ui/select';
import {categories} from '@/lib/news-data';

type BriefPreferences={email:string;topics:string[];days:number[];time:string;timezone:string;length:string;consent:true};
type BriefResult={saved:boolean;deliveryReady:boolean};
const dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const lengths=[['essential','The essentials','3 top stories. A quick start.','2 min'],['balanced','The considered brief','5 top stories, with context.','5 min'],['complete','The wider view','Up to 10 stories across your interests.','10 min']];
const zones=['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Jerusalem','Asia/Dubai','Asia/Singapore','Australia/Sydney'];

export function BriefQuiz({savePreferences}:{savePreferences:(value:BriefPreferences)=>Promise<BriefResult>}){
 const [step,setStep]=useState(0),[topics,setTopics]=useState<string[]>(['AI & Technology','Politics','Markets']);
 const [days,setDays]=useState<number[]>([0,1,2,3,4,5,6]),[time,setTime]=useState('07:00'),[zone,setZone]=useState('America/New_York');
 const [length,setLength]=useState('balanced'),[email,setEmail]=useState(''),[consent,setConsent]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<BriefResult|null>(null);
 const heading=useRef<HTMLHeadingElement>(null),firstRender=useRef(true),submitting=useRef(false);
 useEffect(()=>{try{setZone(Intl.DateTimeFormat().resolvedOptions().timeZone)}catch{}},[]);
 useEffect(()=>{
  if(firstRender.current){firstRender.current=false;return;}
  const node=heading.current;if(!node)return;
  node.focus({preventScroll:true});
  const top=node.getBoundingClientRect().top;
  if(top<0||top>window.innerHeight*.6)node.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 },[step]);
 const scheduleLabel=days.length===7?'Every day':days.slice().sort((a,b)=>a-b).map(i=>dayNames[i].slice(0,3)).join(', ');
 const lengthLabel=lengths.find(option=>option[0]===length)?.[1];
 const validSchedule=days.length>0&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time);
 const titleProps={id:'brief-question',ref:heading,tabIndex:-1};
 async function save(event:FormEvent){
  event.preventDefault();if(submitting.current||!consent||!topics.length||!validSchedule)return;
  submitting.current=true;setBusy(true);setError('');
  try{const value=await savePreferences({email:email.trim(),topics,days,time,timezone:zone,length,consent:true});setResult(value);setStep(4);}
  catch(reason){setError(reason instanceof Error?reason.message:'Your preferences could not be saved. Please try again.');}
  finally{submitting.current=false;setBusy(false);}
 }
 const back=(value:number)=>{setError('');setStep(value);};
 return <div className="brief-page">
  <div className="brief-intro"><span className="eyebrow accent">A DAILY EDITION, ENTIRELY YOURS</span><a href="/" className="text-button">Back to the edition</a></div>
  <section className="quiz" aria-labelledby="brief-question">
   <div className="quiz-progress"><span aria-label={'Step '+Math.min(step+1,4)+' of 4'}>0{Math.min(step+1,4)} / 04</span><Progress aria-label="Brief setup progress" value={step===4?100:(step+1)*25}/><span>{['YOUR TOPICS','YOUR SCHEDULE','YOUR PERSPECTIVE','YOUR EMAIL','PREFERENCES SAVED'][step]}</span></div>
   <div className="quiz-step" key={step}>
    {step===0&&<>
     <h1 {...titleProps}>What’s in<br/>your world<span>?</span></h1>
     <p className="quiz-dek">Choose the stories you want to wake up to.</p>
     <div className="topic-grid" role="group" aria-label="Choose your news topics">{categories.slice(1).map(c=><label className={'topic-option '+(topics.includes(c)?'selected':'')} key={c} htmlFor={'brief-topic-'+c.replace(/\W/g,'')}><span>{c}</span><Checkbox id={'brief-topic-'+c.replace(/\W/g,'')} checked={topics.includes(c)} onCheckedChange={value=>setTopics(previous=>value===true?[...new Set([...previous,c])]:previous.filter(topic=>topic!==c))}/></label>)}</div>
     <div className="quiz-actions"><p className="quiz-selection" role="status">{topics.length?topics.length+' '+(topics.length===1?'topic':'topics')+' selected':'Select at least one topic.'}</p><button className="button dark" disabled={!topics.length} onClick={()=>setStep(1)}>Continue</button></div>
    </>}
    {step===1&&<>
     <h1 {...titleProps}>Good mornings.<br/>On your terms<span>.</span></h1>
     <p className="quiz-dek">Pick your days and your perfect moment.</p>
     <div className="day-grid" role="group" aria-label="Delivery days">{dayNames.map((name,i)=><button type="button" aria-label={name} aria-pressed={days.includes(i)} className={days.includes(i)?'selected':''} key={name} onClick={()=>setDays(previous=>previous.includes(i)?previous.filter(day=>day!==i):[...previous,i])}>{name.slice(0,3)}<span aria-hidden="true">{days.includes(i)?<Check size={16}/>:<Plus size={16}/>}</span></button>)}</div>
     <button className="text-button daily-toggle" onClick={()=>setDays(days.length===7?[1,2,3,4,5]:[0,1,2,3,4,5,6])}>{days.length===7?'Switch to weekdays':'Select every day'}</button>
     <div className="schedule-fields"><label htmlFor="brief-time">Delivery time<input id="brief-time" type="time" required value={time} onChange={event=>setTime(event.target.value)}/></label><div className="quiz-zone"><label htmlFor="brief-zone">Time zone</label><Select value={zone} onValueChange={setZone}><SelectTrigger id="brief-zone"><SelectValue/></SelectTrigger><SelectContent>{Array.from(new Set([zone,...zones])).map(value=><SelectItem key={value} value={value}>{value.replaceAll('_',' ')}</SelectItem>)}</SelectContent></Select></div></div>
     <p className="quiz-schedule-note" role="status">{days.length?`${scheduleLabel} at ${time||'your selected time'} · ${zone.replaceAll('_',' ')}`:'Choose at least one delivery day.'}</p>
     <div className="quiz-actions"><button className="text-button" onClick={()=>back(0)}>Back</button><button className="button dark" disabled={!validSchedule} onClick={()=>setStep(2)}>Continue</button></div>
    </>}
    {step===2&&<>
     <h1 {...titleProps}>How much<br/>perspective<span>?</span></h1>
     <p className="quiz-dek">A quick glance or a little more context.</p>
     <div className="length-options" role="group" aria-label="Choose your brief length">{lengths.map(([value,name,description,readingTime])=><button className={'length-option '+(length===value?'selected':'')} key={value} aria-pressed={length===value} onClick={()=>setLength(value)}><span><strong>{name}</strong><p>{description}</p></span><span>{readingTime}{length===value&&<Check size={18} aria-hidden="true"/>}</span></button>)}</div>
     <div className="quiz-actions"><button className="text-button" onClick={()=>back(1)}>Back</button><button className="button dark" onClick={()=>setStep(3)}>Continue</button></div>
    </>}
    {step===3&&<form onSubmit={save} aria-busy={busy}>
     <h1 {...titleProps}>Your world.<br/>In your inbox<span>.</span></h1>
     <p className="quiz-dek">One thoughtful email. Everything you chose.</p>
     <div className="brief-summary quiz-review"><div><span>{topics.join(' · ')}</span><button type="button" className="text-button" disabled={busy} onClick={()=>back(0)}>Edit topics</button></div><div><span>{scheduleLabel} at {time} · {zone.replaceAll('_',' ')}</span><button type="button" className="text-button" disabled={busy} onClick={()=>back(1)}>Edit schedule</button></div><div><span>{lengthLabel}</span><button type="button" className="text-button" disabled={busy} onClick={()=>back(2)}>Edit length</button></div></div>
     <label className="email-label" htmlFor="brief-email">Email address</label><input className="email-input" id="brief-email" type="email" inputMode="email" autoComplete="email" maxLength={254} required disabled={busy} value={email} placeholder="you@example.com" aria-describedby={error?'brief-save-error':undefined} onChange={event=>{setEmail(event.target.value);setError('');}}/>
     <label className="consent" htmlFor="brief-consent"><Checkbox id="brief-consent" disabled={busy} checked={consent} onCheckedChange={value=>setConsent(value===true)}/><span>Email me the brief I selected. I can unsubscribe or change my preferences at any time.</span></label>
     {error&&<p id="brief-save-error" className="quiz-error" role="alert">{error}</p>}
     <div className="quiz-actions"><button type="button" className="text-button" disabled={busy} onClick={()=>back(2)}>Back</button><button type="submit" className="button dark" disabled={!consent||busy||!email.trim()}>{busy?'Saving your edition…':'Create my brief'}</button></div>
    </form>}
    {step===4&&<div className="quiz-success"><span className="success-mark"><Check size={26}/></span><h1 {...titleProps}>Your edition<br/>is taking shape<span>.</span></h1><p className="quiz-dek">{result?.deliveryReady?'Check your inbox to confirm your email address. Your brief begins after confirmation.':'Your preferences are saved. We’ll email a confirmation when delivery becomes available.'}</p><div className="brief-summary"><strong>{email.trim()}</strong><p>{scheduleLabel} at {time} · {zone.replaceAll('_',' ')}</p></div><a className="button dark" href="/">Return to the edition</a></div>}
   </div>
  </section>
  <div className="brief-bottom"><span>Less noise. More perspective.</span><span>Unsubscribe whenever you like.</span></div>
 </div>;
}
