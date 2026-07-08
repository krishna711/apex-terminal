import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Multi-Broker Login Terminal',
  description: 'Trade, track portfolios, and manage orders across Dhan, AngelOne, and Fyers broker accounts simultaneously.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
