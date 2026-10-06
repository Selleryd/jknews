import {notFound} from 'next/navigation';
import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {runtime} from '@/lib/news-server';
import {isOwnerIdentity} from '@/lib/owner-access';
import {loopbackOrigin} from '@/lib/owner-bridge-protocol';
import {OwnerConnect} from '@/components/owner-connect';
export const dynamic = 'force-dynamic';
export const metadata = {title:'Private connection', robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{local?:string}>}) {
  const params = await searchParams, local = loopbackOrigin(params.local);
  if (!local) notFound();
  const user = await requireChatGPTUser('/owner-connect?local=' + encodeURIComponent(local));
  if (!isOwnerIdentity(user.userId,user.email,runtime().ADMIN_EMAIL)) notFound();
  return <OwnerConnect localOrigin={local}/>;
}
