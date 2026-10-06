import {categories} from './news-data';
import {sourceDirectory} from './source-directory';
import {clean,safeUrl} from './news-server';
export function validateSources(input:unknown){
 if(!Array.isArray(input)||input.length>200)throw new Error('Use up to 200 donor feeds.');
 const ids=new Set<string>();
 return input.map((s:any)=>{
  if(!s||typeof s!=='object')throw new Error('Invalid donor source.');
  const id=clean(s.id,100);if(!id||ids.has(id))throw new Error('Each donor needs a unique ID.');ids.add(id);
  const feedUrl=safeUrl(s.feedUrl),name=clean(s.name,100);if(!name)throw new Error('Publisher name required.');
  const policy=sourceDirectory.find(d=>d.feedUrl&&new URL(d.feedUrl).hostname===new URL(feedUrl).hostname);
  const mode=['headlines','summary','licensed','fulltext'].includes(s.mode)?s.mode:'headlines';
  const fullTextConfirmed=s.fullTextConfirmed===true;
  if(s.approved===true&&mode==='fulltext'&&!fullTextConfirmed)throw new Error(name+': confirm the feed supplies complete article bodies.');
  const rightsConfirmed=s.rightsConfirmed===true,rightsUrl=s.rightsUrl?safeUrl(s.rightsUrl):'',rightsNote=clean(s.rightsNote,500);
  const permissionRequired=!!policy?.requiringPermission;
  if(s.approved===true&&(permissionRequired||['fulltext','licensed'].includes(mode))&&(!rightsConfirmed||(!rightsUrl&&rightsNote.length<12)))throw new Error(name+': confirm reuse permission and add its reference before enabling this mode.');
  return {id,name,feedUrl,category:categories.slice(1).includes(s.category)?s.category:'World',approved:s.approved===true,mode,rightsConfirmed,rightsUrl,rightsNote,fullTextConfirmed,requiringPermission:permissionRequired,feedVerified:s.feedVerified===true||s.tested===true};
 });
}
