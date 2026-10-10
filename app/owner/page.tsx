import { env } from 'cloudflare:workers';
import { redirect } from 'next/navigation';
export const dynamic='force-dynamic';
export default function Page(){
  const values=env as Record<string,unknown>,url=String(values.LOCAL_PUBLISHER_URL??'');
  if(values.LOCAL_PUBLICATION_ONLY==='true' && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) redirect(url+'/admin');
  return <main><h1>Approve results on the results website</h1><p>Use the website’s admin area to review and publish organizer requests.</p></main>;
}
