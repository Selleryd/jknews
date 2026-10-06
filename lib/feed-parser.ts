/** RSS/Atom reader for Worker runtimes. It never resolves DTDs or external entities. */
export type FeedItem = {
  title:string; url:string; publisher:string; author:string; description:string;
  publishedAt:string; fullBody:string[];
  fullContentStatus:'available'|'missing'|'incomplete'|'oversized';
  fullContentReason?:string;
};
type XmlNode={name:string; attributes:Record<string,string>; children:(XmlNode|string)[]};
const MAX_FEED=2_000_000;
const MAX_BODY=100_000;
const namedEntities:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ensp:' ',emsp:' ',thinsp:' ',ndash:'–',mdash:'—',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',hellip:'…',copy:'©',reg:'®',trade:'™',bull:'•',middot:'·',euro:'€',pound:'£',yen:'¥',aacute:'á',eacute:'é',iacute:'í',oacute:'ó',uacute:'ú',ntilde:'ñ',ouml:'ö',uuml:'ü',auml:'ä',ccedil:'ç',egrave:'è',agrave:'à',ocirc:'ô',aring:'å'};
export function decodeEntities(value:string){return value.replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi,(entity,key:string)=>{
  if(key[0]!=='#')return namedEntities[key]??entity;
  const n=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
  return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'�';
});}
function parseXml(xml:string):XmlNode {
  if(xml.length>MAX_FEED)throw new Error('Feed exceeds the 2 MB limit.');
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Feeds with DTD or entity declarations are not supported.');
  const document:XmlNode={name:'#document',attributes:{},children:[]},stack=[document];let offset=0,nodes=0;
  while(offset<xml.length){
    if(++nodes>40_000)throw new Error('Feed has too many XML nodes.');
    if(xml[offset]!=='<'){const end=xml.indexOf('<',offset);const next=end===-1?xml.length:end;stack.at(-1)!.children.push(decodeEntities(xml.slice(offset,next)));offset=next;continue;}
    if(xml.startsWith('<!--',offset)){const end=xml.indexOf('-->',offset+4);if(end<0)throw new Error('Feed contains an unfinished comment.');offset=end+3;continue;}
    if(xml.startsWith('<![CDATA[',offset)){const end=xml.indexOf(']]>',offset+9);if(end<0)throw new Error('Feed contains unfinished CDATA.');stack.at(-1)!.children.push(xml.slice(offset+9,end));offset=end+3;continue;}
    if(xml.startsWith('<?',offset)){const end=xml.indexOf('?>',offset+2);if(end<0)throw new Error('Feed contains an unfinished declaration.');offset=end+2;continue;}
    let end=offset+1,quote='';for(;end<xml.length;end++){const char=xml[end];if(quote){if(char===quote)quote='';}else if(char==='"'||char==="'")quote=char;else if(char==='>')break;}
    if(end===xml.length)throw new Error('Feed contains an unfinished XML tag.');
    const token=xml.slice(offset+1,end).trim();offset=end+1;
    if(token[0]==='/'){const name=token.slice(1).trim().toLowerCase();if(stack.length===1||stack.at(-1)!.name!==name)throw new Error('Feed contains mismatched XML tags.');stack.pop();continue;}
    if(token[0]==='!')throw new Error('Feed contains an unsupported declaration.');
    const selfClosing=/\/\s*$/.test(token),body=selfClosing?token.replace(/\/\s*$/,''):token;
    const match=body.match(/^([\w:.-]+)/);if(!match)throw new Error('Feed contains an invalid XML element.');
    const name=match[1].toLowerCase(),attributes:Record<string,string>={};let rest=body.slice(match[0].length);
    while(rest.trim()){const attr=rest.match(/^\s+([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/);if(!attr)throw new Error('Feed contains an invalid XML attribute.');attributes[attr[1].toLowerCase()]=decodeEntities(attr[2]??attr[3]);rest=rest.slice(attr[0].length);}
    const node:XmlNode={name,attributes,children:[]};stack.at(-1)!.children.push(node);
    if(!selfClosing){stack.push(node);if(stack.length>64)throw new Error('Feed XML is nested too deeply.');}
  }
  if(stack.length!==1)throw new Error('Feed contains unfinished XML elements.');
  const roots=document.children.filter((x):x is XmlNode=>typeof x!=='string');
  if(roots.length!==1)throw new Error('Feed must have one XML root.');return roots[0];
}
function local(node:XmlNode){return node.name.split(':').at(-1)!;}
function children(node:XmlNode,name:string){return node.children.filter((x):x is XmlNode=>typeof x!=='string'&&(x.name===name||local(x)===name));}
function first(node:XmlNode,name:string){return children(node,name)[0];}
function allText(node?:XmlNode):string {return node?.children.map(x=>typeof x==='string'?x:allText(x)).join('')??'';}
function serialize(node:XmlNode):string {return '<'+node.name+'>'+node.children.map(x=>typeof x==='string'?x:serialize(x)).join('')+'</'+node.name+'>';}
function contentText(node?:XmlNode):string {return node?.children.map(x=>typeof x==='string'?x:serialize(x)).join('')??'';}
/** Return safe plain text, with semantic HTML block boundaries retained. No HTML reaches article rendering. */
export function plainParagraphs(input:string):string[]{
  let value=input;for(let n=0;n<2;n++){const decoded=decodeEntities(value);if(decoded===value)break;value=decoded;}
  value=value.replace(/<!--([\s\S]*?)-->/g,'').replace(/<(script|style|iframe|object|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<(?:script|style|iframe|object|template|noscript)\b[^>]*>[\s\S]*$/gi,'');
  value=value.replace(/<\s*br\b[^>]*\/?\s*>/gi,'\n').replace(/<\/?(?:p|div|section|article|blockquote|li|h[1-6]|pre|tr|ul|ol)\b[^>]*>/gi,'\n\n').replace(/<[^>]*>/g,'');
  return value.replace(/\r\n?/g,'\n').split(/\n\s*\n/).map(p=>p.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/\s+/g,' ').trim()).filter(Boolean);
}
function concise(input:string,max:number){return plainParagraphs(input).join(' ').slice(0,max);}
function textParagraphs(input:string){return input.replace(/\r\n?/g,'\n').split(/\n\s*\n/).map(p=>p.replace(/\s+/g,' ').trim()).filter(Boolean);}
function articleUrl(node:XmlNode,atom:boolean){
  if(atom){const links=children(node,'link');const link=links.find(l=>(!l.attributes.rel||l.attributes.rel==='alternate')&&(!l.attributes.type||l.attributes.type==='text/html'))??links.find(l=>l.attributes.rel==='alternate');return link?.attributes.href??'';}
  const link=allText(first(node,'link')).trim();const guid=first(node,'guid');return link||(guid?.attributes.ispermalink!=='false'?allText(guid).trim():'');
}
function readEntry(node:XmlNode,atom:boolean,feedAuthor:string,feedTitle:string):FeedItem {
  const authorNode=first(node,'author');const author=concise(allText(first(node,'dc:creator'))||allText(first(node,'creator'))||(atom?allText(authorNode&&first(authorNode,'name')):allText(authorNode))||feedAuthor,200);
  const full=atom?first(node,'content'):first(node,'content:encoded');
  const contentType=full?.attributes.type?.toLowerCase()||'text';
  const supported=!atom||['text','html','xhtml','text/plain','text/html','application/xhtml+xml'].includes(contentType);
  const raw=full&&!full.attributes.src&&supported?contentText(full):'';
  const description=concise(contentText(first(node,atom?'summary':'description')),12_000);
  let fullBody:string[]=[],fullContentStatus:FeedItem['fullContentStatus']='missing',fullContentReason='The feed supplies an excerpt without the full article body.';
  if(raw.length>MAX_BODY){fullContentStatus='oversized';fullContentReason='Full content exceeds the 100,000-character publishing limit; it was held rather than truncated.';}
  else if(raw){fullBody=atom&&['text','text/plain'].includes(contentType)?textParagraphs(raw):plainParagraphs(raw);if(fullBody.length){
    const tail=fullBody.slice(-2).join(' ');
    if(/(?:read\s+(?:the\s+)?(?:full\s+)?(?:article|story|more)|continue\s+reading|full\s+(?:article|story)|subscriber(?:s)?\s+only|log\s*in\s+to\s+(?:continue|read)|subscribe\s+to\s+(?:continue|read)|\[\.\.\.\]|\[\u2026\])(?:\s+(?:at|on|here))?[.!…\s]*$/i.test(tail)){fullContentStatus='incomplete';fullContentReason='The supplied content ends with a continuation or access marker, so completeness could not be confirmed.';}
    else if(fullBody.join('\n\n').length<600){fullContentStatus='incomplete';fullContentReason='The supplied content is shorter than 600 characters and may be an excerpt; full publication was held for review.';}
    else{fullContentStatus='available';fullContentReason='Full body supplied by the RSS/Atom publisher.';}
  }}
  if(full?.attributes.src){fullContentReason='Atom content points to an external body; the feed does not contain the full article.';}
  else if(!supported){fullContentReason='The Atom content type does not contain a supported text article body.';}
  return {title:concise(contentText(first(node,'title')),300),url:articleUrl(node,atom).trim(),publisher:concise(allText(first(node,'source')&&first(first(node,'source')!,'title'))||allText(first(node,'source'))||feedTitle,160),author,description:description||(fullContentStatus==='available'?fullBody.join(' ').slice(0,12_000):''),publishedAt:allText(first(node,atom?'published':'pubdate'))||allText(first(node,'updated'))||'',fullBody,fullContentStatus,fullContentReason};
}
export function parseFeed(xml:string):FeedItem[]{
  const root=parseXml(xml);const kind=local(root);if(!['rss','rdf','feed'].includes(kind))throw new Error('The URL did not return a recognized RSS or Atom feed.');
  const atom=kind==='feed',container=kind==='rss'?first(root,'channel'):root;if(!container)throw new Error('RSS feed has no channel.');
  const feedTitle=allText(first(container,'title')),feedAuthor=allText(first(container,'dc:creator'))||allText(first(first(container,'author')??container,'name'));
  const entries=children(container,atom?'entry':'item');
  return entries.map(n=>readEntry(n,atom,feedAuthor,feedTitle)).filter(n=>n.title&&/^https?:\/\//i.test(n.url)).sort((a,b)=>{const time=(s:string)=>Number.isFinite(Date.parse(s))?Date.parse(s):0;return time(b.publishedAt)-time(a.publishedAt);}).slice(0,30);
}
