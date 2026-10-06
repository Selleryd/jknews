/** Source-derived intelligence. Geography marks places mentioned in reporting, never force positions. */
export const INTELLIGENCE_TIMEZONE = 'America/New_York';
export const INTELLIGENCE_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const INTELLIGENCE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type IntelligenceSource = {id:string;name:string;approved:boolean;category?:string};
export type IntelligenceInput = {
 id?:string;sourceId?:string;publisher?:string;title:string;sourceUrl?:string;url?:string;
 author?:string;publishedAt?:string;category?:string;dek?:string;description?:string;
 paragraphs?:string[];slug?:string;articleUrl?:string;
};
export type IntelligenceFeedSnapshot = {sourceId:string;collectedAt:string;items:IntelligenceInput[]};
export type IntelligenceItem = {
 id:string;title:string;excerpt:string;publisher:string;author:string;sourceId:string;
 sourceUrl:string;publishedAt:string;category:string;articleUrl?:string;assessment:'source-reported';
};
export type IntelligenceEvidence = {storyId:string;title:string;url:string;publisher:string;publishedAt:string};
export type IntelligenceLocation = {
 id:string;name:string;lat:number;lon:number;kind:'country'|'city'|'region';label:'Reporting location';
 storyCount:number;evidence:IntelligenceEvidence[];
};
export type IntelligenceEdge = {
 id:string;source:string;target:string;relationship:'co-mentioned in reporting';storyCount:number;
 evidence:IntelligenceEvidence[];
};
export type IntelligenceCoverage = {
 approvedSourceCount:number;representedSourceCount:number;sourceIds:string[];eligibleArticleCount:number;
 omitted:{unapproved:number;invalidUrl:number;undated:number;outsideWindow:number;duplicates:number;olderThanLatestLimit:number;staleSnapshots:number};
 limitations:string[];
};
export type IntelligenceBrief = {
 id:string;localDate:string;refreshBucket:string;collectedAt:string;refreshedAt:string;nextRefreshAt:string;
 title:string;summary:string;items:IntelligenceItem[];method:'source-derived'|'ai-assisted';
 assessment:'source-reported';shareText:string;sourceCount:number;
};
export type IntelligenceEdition = {
 brief:IntelligenceBrief;conflicts:{locations:IntelligenceLocation[];edges:IntelligenceEdge[];stories:IntelligenceItem[]};
 status:'waiting'|'ready'|'partial';coverage:IntelligenceCoverage;
};

function plain(value:unknown,max=8000){
 return String(value??'').replace(/<(script|style|iframe|template)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function firstWords(value:string,max:number){const words=value.split(/\s+/).filter(Boolean);return words.length<=max?value:words.slice(0,max).join(' ')+'…';}
export function publicIntelligenceUrl(value:unknown):string|null {
 try{
  const u=new URL(String(value));const host=u.hostname.toLowerCase().replace(/\.$/,'');
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!host.includes('.')||host.startsWith('[')||/^(localhost(?:\.|$))/.test(host)||/\.(local|localhost|internal|lan)$/.test(host))return null;
  const octets=host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);
  if(octets){const [a,b,c]=octets;if(octets.some(n=>n>255)||a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===192&&b===0||a===198&&b===51&&c===100||a===203&&b===0&&c===113)return null;}
  u.hash='';return u.href;
 }catch{return null;}
}
function canonicalUrl(url:string){const u=new URL(url);for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key))u.searchParams.delete(key);return u.href.replace(/\/$/,'');}
function hash(value:string){let result=2166136261;for(let i=0;i<value.length;i++){result^=value.charCodeAt(i);result=Math.imul(result,16777619);}return (result>>>0).toString(36);}
function dateParts(at:Date){return Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:INTELLIGENCE_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(at).map(part=>[part.type,part.value]));}
export function intelligenceWindow(at:Date|string|number=new Date()){
 const date=new Date(at);if(Number.isNaN(date.getTime()))throw new Error('Intelligence refresh requires a valid time.');
 const parts=dateParts(date),localDate=parts.year+'-'+parts.month+'-'+parts.day;
 const refreshBucket=localDate+'/'+String(Math.floor(Number(parts.hour)/2)*2).padStart(2,'0');
 // Find the next New York two-hour boundary, including daylight-saving transitions.
 const rounded=Math.floor(date.getTime()/60000)*60000;let next=rounded+60000;
 for(let minutes=1;minutes<=181;minutes++,next+=60000){const p=dateParts(new Date(next));const candidate=p.year+'-'+p.month+'-'+p.day+'/'+String(Math.floor(Number(p.hour)/2)*2).padStart(2,'0');if(candidate!==refreshBucket)break;}
 return {localDate,refreshBucket,nextRefreshAt:new Date(next).toISOString()};
}
export function intelligenceRefreshDue(edition:IntelligenceEdition|null|undefined,at:Date|string|number=new Date()){
 if(!edition?.brief)return true;
 const time=new Date(at).getTime(),stamp=Date.parse(edition.brief.refreshedAt);
 return !Number.isFinite(stamp)||stamp>time||edition.brief.refreshBucket!==intelligenceWindow(at).refreshBucket||time-stamp>=INTELLIGENCE_INTERVAL_MS;
}

/** A conservative classifier: figurative wars alone never enter conflict mode. */
export function isArmedConflictReporting(value:string){
 const text=plain(value).toLowerCase().replace(/\b(?:culture|trade|tariff|price|bidding|cyber|console|streaming|browser|chip|ai|star)\s+war(?:s|fare)?\b/g,' ').replace(/\bcyberwar(?:s|fare)?\b/g,' ').replace(/\bwar\s+(?:on|against)\s+(?:cancer|drugs|poverty|obesity|waste|disease)\b/g,' ');
 const active=/\b(?:armed conflict|air\s?strikes?|missile (?:attacks?|strikes?)|artillery (?:fire|attacks?)|shelling|military offensive|military invasion|armed clashes|combat operations?|combatants?|ceasefires?|bombardment|war zone|war crimes?|drone strikes?|insurgency)\b/;
 if(active.test(text))return true;
 if(/\b(?:museum|anniversary|historical|history|documentary|movie|film|novel|video game|memorial|world war (?:ii|i|one|two|1|2))\b/.test(text))return false;
 const military=/\b(?:military|troops?|missiles?|artillery|insurgents?|rebels?|armed forces|hamas|hezbollah|houthis?|m23|rsf|taliban|al-shabaab|isis|islamic state)\b/.test(text)&&/\b(?:fighting|conflict|war|killed|attacks?|clashes|offensive|frontline|invading|hostages?|peace talks)\b/.test(text);
 return military||/\b(?:war|wars|warfare|invasion|invaded|invading)\b/.test(text)&&REPORTING_GEOGRAPHY.some(place=>place.aliases.some(alias=>containsAlias(text,alias)));
}

type ReportingPlace={id:string;name:string;lat:number;lon:number;kind:'country'|'city'|'region';aliases:string[]};
export const REPORTING_GEOGRAPHY:ReportingPlace[]=[
 {id:'ukraine',name:'Ukraine',lat:49.0,lon:31.0,kind:'country',aliases:['ukraine']},
 {id:'russia',name:'Russia',lat:61.5,lon:105.3,kind:'country',aliases:['russia']},
 {id:'israel',name:'Israel',lat:31.4,lon:35.0,kind:'country',aliases:['israel']},
 {id:'gaza',name:'Gaza',lat:31.4,lon:34.4,kind:'region',aliases:['gaza']},
 {id:'west-bank',name:'West Bank',lat:32.0,lon:35.3,kind:'region',aliases:['west bank']},
 {id:'lebanon',name:'Lebanon',lat:33.9,lon:35.9,kind:'country',aliases:['lebanon']},
 {id:'syria',name:'Syria',lat:35.0,lon:38.4,kind:'country',aliases:['syria']},
 {id:'iran',name:'Iran',lat:32.4,lon:53.7,kind:'country',aliases:['iran']},
 {id:'iraq',name:'Iraq',lat:33.2,lon:43.7,kind:'country',aliases:['iraq']},
 {id:'yemen',name:'Yemen',lat:15.6,lon:48.5,kind:'country',aliases:['yemen']},
 {id:'red-sea',name:'Red Sea',lat:20.3,lon:38.7,kind:'region',aliases:['red sea']},
 {id:'sudan',name:'Sudan',lat:15.5,lon:30.2,kind:'country',aliases:['sudan']},
 {id:'south-sudan',name:'South Sudan',lat:6.9,lon:31.3,kind:'country',aliases:['south sudan']},
 {id:'drc',name:'Democratic Republic of the Congo',lat:-4.0,lon:21.8,kind:'country',aliases:['democratic republic of congo','democratic republic of the congo','dr congo','drc','congo']},
 {id:'myanmar',name:'Myanmar',lat:21.9,lon:96.0,kind:'country',aliases:['myanmar','burma']},
 {id:'afghanistan',name:'Afghanistan',lat:33.9,lon:67.7,kind:'country',aliases:['afghanistan']},
 {id:'pakistan',name:'Pakistan',lat:30.4,lon:69.3,kind:'country',aliases:['pakistan']},
 {id:'india',name:'India',lat:21.0,lon:78.9,kind:'country',aliases:['india']},
 {id:'china',name:'China',lat:35.9,lon:104.2,kind:'country',aliases:['china']},
 {id:'taiwan',name:'Taiwan',lat:23.7,lon:121.0,kind:'region',aliases:['taiwan']},
 {id:'north-korea',name:'North Korea',lat:40.3,lon:127.5,kind:'country',aliases:['north korea']},
 {id:'south-korea',name:'South Korea',lat:35.9,lon:127.8,kind:'country',aliases:['south korea']},
 {id:'somalia',name:'Somalia',lat:5.2,lon:46.2,kind:'country',aliases:['somalia']},
 {id:'ethiopia',name:'Ethiopia',lat:9.1,lon:40.5,kind:'country',aliases:['ethiopia']},
 {id:'mali',name:'Mali',lat:17.6,lon:-4.0,kind:'country',aliases:['mali']},
 {id:'burkina-faso',name:'Burkina Faso',lat:12.3,lon:-1.6,kind:'country',aliases:['burkina faso']},
 {id:'nigeria',name:'Nigeria',lat:9.1,lon:8.7,kind:'country',aliases:['nigeria']},
 {id:'libya',name:'Libya',lat:26.3,lon:17.2,kind:'country',aliases:['libya']},
 {id:'armenia',name:'Armenia',lat:40.1,lon:45.0,kind:'country',aliases:['armenia']},
 {id:'azerbaijan',name:'Azerbaijan',lat:40.1,lon:47.6,kind:'country',aliases:['azerbaijan']},
 {id:'turkey',name:'Türkiye',lat:39.0,lon:35.2,kind:'country',aliases:['turkey','türkiye']},
 {id:'egypt',name:'Egypt',lat:26.8,lon:30.8,kind:'country',aliases:['egypt']},
 {id:'saudi-arabia',name:'Saudi Arabia',lat:23.9,lon:45.1,kind:'country',aliases:['saudi arabia']},
 {id:'united-states',name:'United States',lat:38.0,lon:-97.0,kind:'country',aliases:['united states','u.s.','usa']},
 {id:'united-kingdom',name:'United Kingdom',lat:55.4,lon:-3.4,kind:'country',aliases:['united kingdom','britain']},
 {id:'kyiv',name:'Kyiv',lat:50.45,lon:30.52,kind:'city',aliases:['kyiv','kiev']},
 {id:'kharkiv',name:'Kharkiv',lat:49.99,lon:36.23,kind:'city',aliases:['kharkiv']},
 {id:'odesa',name:'Odesa',lat:46.48,lon:30.73,kind:'city',aliases:['odesa','odessa']},
 {id:'donetsk',name:'Donetsk',lat:48.00,lon:37.81,kind:'city',aliases:['donetsk']},
 {id:'jerusalem',name:'Jerusalem',lat:31.77,lon:35.21,kind:'city',aliases:['jerusalem']},
 {id:'tel-aviv',name:'Tel Aviv',lat:32.09,lon:34.78,kind:'city',aliases:['tel aviv']},
 {id:'beirut',name:'Beirut',lat:33.89,lon:35.50,kind:'city',aliases:['beirut']},
 {id:'tehran',name:'Tehran',lat:35.69,lon:51.39,kind:'city',aliases:['tehran']},
 {id:'sanaa',name:'Sanaa',lat:15.37,lon:44.19,kind:'city',aliases:['sanaa',"sana'a"]},
 {id:'khartoum',name:'Khartoum',lat:15.50,lon:32.56,kind:'city',aliases:['khartoum']},
 {id:'goma',name:'Goma',lat:-1.68,lon:29.23,kind:'city',aliases:['goma']},
];
function containsAlias(text:string,alias:string){const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(?:^|[^\\p{L}\\p{N}])'+escaped+'(?:$|[^\\p{L}\\p{N}])','iu').test(text);}
function mentionedPlaces(text:string){
 return REPORTING_GEOGRAPHY.filter(place=>place.aliases.some(alias=>{
  // “South Sudan” should not imply a separate mention of Sudan.
  const checked=place.id==='sudan'?text.replace(/south sudan(?:ese)?/gi,' '):text;
  // Congo alone is ambiguous between two countries; only unambiguous DRC names qualify.
  return !(place.id==='drc'&&alias==='congo')&&containsAlias(checked,alias);
 }));
}

export function buildIntelligence(input:{sources:IntelligenceSource[];articles?:IntelligenceInput[];feedSnapshots?:IntelligenceFeedSnapshot[];now?:Date|string|number;maxItems?:number}):IntelligenceEdition {
 const date=new Date(input.now??Date.now()),time=date.getTime();const {localDate,refreshBucket,nextRefreshAt}=intelligenceWindow(date);
 const sources=Array.isArray(input.sources)?input.sources:[],approved=sources.filter(s=>s.approved===true&&s.id&&s.name);
 const sourceMap=new Map(approved.map(s=>[s.id,s]));
 const omitted={unapproved:0,invalidUrl:0,undated:0,outsideWindow:0,duplicates:0,olderThanLatestLimit:0,staleSnapshots:0};
 const freshSnapshots=(input.feedSnapshots??[]).filter(snapshot=>{
  const collected=Date.parse(snapshot.collectedAt);
  const fresh=Number.isFinite(collected)&&collected>=time-INTELLIGENCE_LOOKBACK_MS&&collected<=time+5*60000;
  if(!fresh)omitted.staleSnapshots++;return fresh;
 });
 const candidates=[...(input.articles??[]),...freshSnapshots.flatMap(snapshot=>snapshot.items.map(item=>({...item,sourceId:snapshot.sourceId})))];
 const unique=new Map<string,{item:IntelligenceItem;text:string}>();
 for(const article of candidates){
  let source=article.sourceId?sourceMap.get(article.sourceId):undefined;
  if(!article.sourceId&&article.publisher){const matches=sources.filter(s=>s.name.trim().toLowerCase()===article.publisher!.trim().toLowerCase());if(matches.length===1&&matches[0].approved===true)source=sourceMap.get(matches[0].id);}
  if(!source){omitted.unapproved++;continue;}
  const url=publicIntelligenceUrl(article.sourceUrl??article.url);if(!url){omitted.invalidUrl++;continue;}
  const published=Date.parse(article.publishedAt??'');if(!Number.isFinite(published)){omitted.undated++;continue;}
  // Future timestamps are not silently changed into current news.
  if(published<time-INTELLIGENCE_LOOKBACK_MS||published>time+5*60000){omitted.outsideWindow++;continue;}
  const title=plain(article.title,400);if(!title)continue;
  const detail=plain(article.dek||article.description||(article.paragraphs??[]).join(' '),8000);
  const item:IntelligenceItem={id:article.id||'intel-'+hash(canonicalUrl(url)),title,excerpt:firstWords(detail,24),publisher:source.name,author:plain(article.author,160)||'Byline not provided',sourceId:source.id,sourceUrl:url,publishedAt:new Date(published).toISOString(),category:plain(article.category||source.category||'World',80),assessment:'source-reported'};
  if(article.articleUrl?.startsWith('/')&&!article.articleUrl.startsWith('//'))item.articleUrl=article.articleUrl;
  else if(article.slug&&/^[a-z0-9-]+$/i.test(article.slug))item.articleUrl='/article/'+article.slug;
  const key=canonicalUrl(url),old=unique.get(key);if(old){omitted.duplicates++;if(old.item.articleUrl||!item.articleUrl)continue;}
  unique.set(key,{item,text:title+' '+detail});
 }
 const eligible=[...unique.values()].sort((a,b)=>Date.parse(b.item.publishedAt)-Date.parse(a.item.publishedAt)||a.item.id.localeCompare(b.item.id));
 const maxItems=Math.max(1,Math.min(800,input.maxItems??80));
 // Give each represented donor a place before filling with the latest remaining stories.
 const chosen:typeof eligible=[];const donorIds=new Set<string>();
 for(const row of eligible){if(!donorIds.has(row.item.sourceId)){chosen.push(row);donorIds.add(row.item.sourceId);}if(chosen.length>=maxItems)break;}
 for(const row of eligible){if(chosen.length>=maxItems)break;if(!chosen.includes(row))chosen.push(row);}
 chosen.sort((a,b)=>Date.parse(b.item.publishedAt)-Date.parse(a.item.publishedAt)||a.item.id.localeCompare(b.item.id));
 omitted.olderThanLatestLimit=eligible.length-chosen.length;
 const items=chosen.map(row=>row.item),represented=[...new Set(items.map(item=>item.sourceId))];
 const conflictRows=chosen.filter(row=>isArmedConflictReporting(row.text));
 const locations=new Map<string,IntelligenceLocation>(),edges=new Map<string,IntelligenceEdge>();
 for(const row of conflictRows){
  const evidence:IntelligenceEvidence={storyId:row.item.id,title:row.item.title,url:row.item.sourceUrl,publisher:row.item.publisher,publishedAt:row.item.publishedAt};
  const places=mentionedPlaces(row.text).slice(0,10);
  for(const place of places){const previous=locations.get(place.id);if(previous){previous.storyCount++;if(previous.evidence.length<6)previous.evidence.push(evidence);}else locations.set(place.id,{id:place.id,name:place.name,lat:place.lat,lon:place.lon,kind:place.kind,label:'Reporting location',storyCount:1,evidence:[evidence]});}
  for(let a=0;a<places.length;a++)for(let b=a+1;b<places.length;b++){
   const ids=[places[a].id,places[b].id].sort(),id=ids.join('--'),previous=edges.get(id);
   if(previous){previous.storyCount++;if(previous.evidence.length<4)previous.evidence.push(evidence);}else edges.set(id,{id,source:ids[0],target:ids[1],relationship:'co-mentioned in reporting',storyCount:1,evidence:[evidence]});
  }
 }
 const top=items.slice(0,4);
 const summary=top.length?'Source-reported updates from '+represented.length+' '+(represented.length===1?'publisher':'publishers')+' in the past 24 hours. '+top.map(item=>item.publisher+': '+item.title).join(' · '):approved.length?'No recent reporting is available for this briefing.':'The next OSINT briefing will appear as reporting arrives.';
 const limitations=[
  'Publisher reports have not been independently verified. Repetition across sources does not itself confirm a claim.',
  'Map pins are static geographic reference points for places explicitly mentioned in reporting. Lines mean co-mention in the same article, not an operational relationship or battlefront.',
 ];
 if(omitted.undated)limitations.push(omitted.undated+' undated feed '+(omitted.undated===1?'entry was':'entries were')+' omitted rather than presented as current news.');
 if(omitted.olderThanLatestLimit)limitations.push(omitted.olderThanLatestLimit+' additional current '+(omitted.olderThanLatestLimit===1?'article is':'articles are')+' beyond the brief display limit.');
 if(omitted.staleSnapshots)limitations.push(omitted.staleSnapshots+' old or undated source '+(omitted.staleSnapshots===1?'snapshot was':'snapshots were')+' omitted.');
 if(represented.length<approved.length)limitations.push((approved.length-represented.length)+' '+(approved.length-represented.length===1?'source has':'sources have')+' no eligible dated reporting in this window.');
 const coverage:IntelligenceCoverage={approvedSourceCount:approved.length,representedSourceCount:represented.length,sourceIds:represented,eligibleArticleCount:eligible.length,omitted,limitations};
 const shareText=top.length?makeIntelligenceShareText(top[0]):'';
 return {brief:{id:'osint-'+refreshBucket.replace('/','-'),localDate,refreshBucket,collectedAt:date.toISOString(),refreshedAt:date.toISOString(),nextRefreshAt,title:'OSINT · Daily brief',summary,items,method:'source-derived',assessment:'source-reported',shareText,sourceCount:represented.length},conflicts:{locations:[...locations.values()].sort((a,b)=>b.storyCount-a.storyCount),edges:[...edges.values()].sort((a,b)=>b.storyCount-a.storyCount).slice(0,100),stories:conflictRows.map(row=>row.item)},status:!items.length?'waiting':represented.length<approved.length||omitted.olderThanLatestLimit>0?'partial':'ready',coverage};
}

export function makeIntelligenceShareText(item:IntelligenceItem,permalink?:string){
 const suffix='\n'+item.sourceUrl+(publicIntelligenceUrl(permalink)?'\n'+permalink:'');
 const prefix='Jew Knows OSINT · Source-reported\n'+item.publisher+': ';
 // Count literal URL length conservatively; X normally shortens URLs in its character count.
 const available=Math.max(0,280-[...prefix+suffix].length);
 let title=[...item.title].slice(0,available).join('');if(title!==item.title&&available>1)title=[...item.title].slice(0,available-1).join('')+'…';
 if([...prefix+suffix].length>280){const fallback='Jew Knows OSINT · Source-reported\n'+item.sourceUrl;return [...fallback].length<=280?fallback:'';}
 return prefix+title+suffix;
}

/** AI may choose priorities, but it cannot introduce claims into the source-derived brief. */
export function applyIntelligencePriorities(edition:IntelligenceEdition,ids:string[]){
 const order=[...new Set(ids)].map(id=>edition.brief.items.find(item=>item.id===id)).filter((item):item is IntelligenceItem=>!!item).slice(0,5);
 if(!order.length)return edition;
 return {...edition,brief:{...edition.brief,method:'ai-assisted' as const,summary:'Source-reported updates from '+edition.brief.sourceCount+' '+(edition.brief.sourceCount===1?'publisher':'publishers')+' in the past 24 hours. '+order.map(item=>item.publisher+': '+item.title).join(' · '),shareText:makeIntelligenceShareText(order[0])}};
}
