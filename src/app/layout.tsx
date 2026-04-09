import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "평택 부동산 인사이트",
  description: "평택시 유동인구·교통·상권 데이터 기반 부동산 분석 SaaS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="h-full flex bg-gray-50">
        <Sidebar />
        <main className="flex-1 h-full overflow-auto pb-16 md:pb-0">{children}</main>
      </body>
    </html>
  );
}
