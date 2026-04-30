import type { Metadata } from "next";
import localFont from "next/font/local";
import "react-loading-skeleton/dist/skeleton.css";
import "../assets/css/globals.css";
import { AppDesktopShell } from "../components/AppDesktopShell";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "TravelVia Chat",
  description: "LLM chat mock in apps/web",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AppDesktopShell>{children}</AppDesktopShell>
      </body>
    </html>
  );
}
