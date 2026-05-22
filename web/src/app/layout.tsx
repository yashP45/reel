import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Reel — Record & Share',
  description: 'Watch and manage screen recordings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
