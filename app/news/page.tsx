import {NewsApp} from '@/components/news-app';
import {getArticles} from '@/lib/news-server';
import {articles} from '@/lib/news-data';
export const dynamic='force-dynamic';
export const metadata={title:'News edition'};
export default async function Page(){let items=articles;try{items=await getArticles()}catch{}return <NewsApp view="news" initialItems={items}/>;}
