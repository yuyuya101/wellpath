import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WellPath',
  description: 'Personalized wellness plan assessment',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
