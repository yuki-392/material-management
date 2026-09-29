import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "研究室タスク管理",
  description: "研究室・ゼミ内のタスクと資料を管理するアプリです。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <a
          className="sr-only z-50 rounded-lg bg-white px-4 py-3 font-semibold text-indigo-800 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
          href="#main-content"
        >
          本文へ移動
        </a>
        {children}
      </body>
    </html>
  );
}
