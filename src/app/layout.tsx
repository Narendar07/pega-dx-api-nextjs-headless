import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pega Headless POC — DX API V2',
  description: 'Option 4: Next.js + Pega DX API V2 (No ConstellationJS)',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
