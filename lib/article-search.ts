import {articles as guides, type Article} from './news-data';

export type SearchResult = Pick<Article,'id'|'slug'|'title'|'dek'|'category'|'publisher'|'author'|'sourceUrl'|'image'|'imageLabel'|'publishedAt'|'kind'>;
export const searchTerms = (query:string) => query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).slice(0,12);
const searchable = (article:Article) => [article.title,article.dek,article.publisher,article.author,article.category,...article.paragraphs].join(' ').toLocaleLowerCase();
const result = ({id,slug,title,dek,category,publisher,author,sourceUrl,image,imageLabel,publishedAt,kind}:Article):SearchResult => ({id,slug,title,dek,category,publisher,author,sourceUrl,image,imageLabel,publishedAt,kind});
const like = (term:string) => '%'+term.replace(/[\\%_]/g,'\\$&')+'%';
/** Searches all published donor stories, including those beyond the home edition. */
export async function searchArticles(database:D1Database,query:string,page=1) {
  query=query.trim().slice(0,160);page=Math.max(1,Math.min(10000,Math.floor(page)||1));
  const terms=searchTerms(query),size=20;
  if(!terms.length)return {query,results:[] as SearchResult[],page,total:0,hasMore:false};
  const fields="coalesce(json_extract(data,'$.title'),'')||' '||coalesce(json_extract(data,'$.dek'),'')||' '||coalesce(json_extract(data,'$.publisher'),'')||' '||coalesce(json_extract(data,'$.author'),'')||' '||coalesce(json_extract(data,'$.category'),'')||' '||coalesce(json_extract(data,'$.paragraphs'),'')";
  const condition="status='published' AND json_valid(data) AND "+terms.map(()=>`lower(${fields}) LIKE ? ESCAPE '\\'`).join(' AND ');
  const args=terms.map(like);
  const count=await database.prepare('SELECT COUNT(*) AS count FROM stories WHERE '+condition).bind(...args).first<{count:number}>();
  const matchingGuides=guides.filter(a=>terms.every(t=>searchable(a).includes(t)));
  const duplicates=matchingGuides.length?await database.prepare("SELECT source_url FROM stories WHERE status='published' AND source_url IN ("+matchingGuides.map(()=>'?').join(',')+")").bind(...matchingGuides.map(a=>a.sourceUrl)).all<{source_url:string}>():{results:[]};
  const seed=matchingGuides.filter(a=>!duplicates.results.some(r=>r.source_url===a.sourceUrl));
  const publishedTotal=count?.count||0,offset=(page-1)*size;
  const rows=offset<publishedTotal?await database.prepare('SELECT data FROM stories WHERE '+condition+' ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?').bind(...args,size,offset).all<{data:string}>():{results:[]};
  const matched=rows.results.map(r=>result(JSON.parse(r.data)));
  if(matched.length<size)matched.push(...seed.slice(Math.max(0,offset-publishedTotal),Math.max(0,offset-publishedTotal)+size-matched.length).map(result));
  const total=publishedTotal+seed.length;
  return {query,results:matched,page,total,hasMore:offset+matched.length<total};
}
