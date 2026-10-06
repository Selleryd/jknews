import {NewsApp} from '@/components/news-app';
import {articles} from '@/lib/news-data';
import {getArticles,getArticleBySlug} from '@/lib/news-server';
export const dynamic='force-dynamic';
async function edition(){try{return await getArticles()}catch{return articles}}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const a=await getArticleBySlug(slug).catch(()=>articles.find(a=>a.slug===slug));return {title:a?.title??'Story',description:a?.dek};}
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const [requested,items]=await Promise.all([getArticleBySlug(slug).catch(()=>articles.find(a=>a.slug===slug)),edition()]);return <NewsApp view="article" slug={slug} initialItems={requested?[requested,...items.filter(a=>a.slug!==slug)]:items}/>}
