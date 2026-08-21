import { SOCIAL_IMAGE_BASE64 } from '@/lib/social-image';

export function GET() {
  const bytes = Uint8Array.from(atob(SOCIAL_IMAGE_BASE64), (character) => character.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
