import {NewsApp} from '@/components/news-app';
import {db} from '@/lib/news-server';
import {getBrain} from '@/lib/forecast';
export const dynamic='force-dynamic';
export const metadata={title:'Intelligence network'};
export default async function Page(){let brain=null;try{brain=await getBrain({db:db()})}catch{}return <NewsApp view="intelligence" initialBrain={brain}/>;}
