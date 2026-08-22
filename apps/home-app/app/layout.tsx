'use client';

import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'App Maker - AI App Generator',
  description: 'Generate production-ready applications using AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50">
        <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-blue-600">⚡️</div>
              <h1 className="text-xl font-bold text-slate-900">App Maker</h1>
            </div>
            <div className="text-sm text-slate-600">AI-Powered App Generation</div>
          </div>
        </nav>
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
          {children}
        </main>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
