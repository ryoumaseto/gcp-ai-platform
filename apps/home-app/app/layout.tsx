import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css';

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'AppGen - AI App Generator',
  description: 'Generate production-ready applications using AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={geist.variable}>
      <body className="bg-white text-gray-900">
        {children}
        {/* 全ルートで toast を表示するため、ルートレイアウトに置く */}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
