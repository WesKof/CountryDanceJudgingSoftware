import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer', openGraph: { images: [] }, twitter: { images: [] } };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
