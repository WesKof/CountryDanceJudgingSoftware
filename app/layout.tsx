import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';

const description = 'Reliable, local-first scoring for Strictly and Jack & Jill competitions.';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get('x-forwarded-host')?.split(',')[0]?.trim();
  const requestHost = forwardedHost ?? requestHeaders.get('host') ?? 'localhost:3000';
  const safeHost = /^[a-z0-9.-]+(?::\d+)?$/i.test(requestHost) ? requestHost : 'localhost:3000';
  const forwardedProtocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = safeHost.startsWith('localhost') ? 'http' : forwardedProtocol === 'http' ? 'http' : 'https';
  const origin = `${protocol}://${safeHost}`;
  const imageUrl = `${origin}/og`;

  return {
    metadataBase: new URL(origin),
    title: 'Country Dance Judging',
    description,
    openGraph: {
      type: 'website',
      title: 'Country Dance Judging',
      description,
      siteName: 'Country Dance Judging',
      images: [{ url: imageUrl, width: 1200, height: 630, alt: 'Country Dance Judging — Offline-ready scoring. Clear results.' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Country Dance Judging',
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
