import {NewsApp} from '@/components/news-app';
import {getArticles} from '@/lib/news-server';
import {articles} from '@/lib/news-data';
export const dynamic='force-dynamic';
export default async function Home(){let items=articles;try{items=await getArticles()}catch{}return <NewsApp view="home" initialItems={items}/>;}
