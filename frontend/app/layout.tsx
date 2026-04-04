import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Spare Parts Web Verifier',
  description: 'AI-powered industrial spare parts verification system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg-primary text-text-primary font-sans antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
