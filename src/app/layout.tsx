import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AIO TaskSync — Asana → HubSpot',
  description: 'Sync Asana project tasks as notes on HubSpot companies and deals',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
