import { env } from 'cloudflare:workers';
import { LiveError } from './validation';
export function localPublisher(request: Request, authenticate = true) {
  const values = env as Record<string,unknown>, host = new URL(request.url).hostname;
  if(values.LOCAL_PUBLICATION_ONLY !== 'true' || !['127.0.0.1','localhost','[::1]'].includes(host)) throw new LiveError(404,'Local publisher controls are unavailable.');
  const key=String(values.LOCAL_OWNER_KEY ?? '');
  if(authenticate && (!key || request.headers.get('authorization') !== `Bearer ${key}`)) throw new LiveError(403,'Separate service-owner authorization is required.');
  return {enabled:true,receiverUrl:String(values.LOCAL_PUBLISHER_URL ?? ''),receiverKey:String(values.LOCAL_RECEIVER_KEY ?? '')};
}
