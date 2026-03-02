import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SupabaseDevExpose from "@/components/SupabaseDevExpose";
import SupabaseSessionSync from "@/components/SupabaseSessionSync";
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
  title: "ReBites — Tableau de bord fidélité",
  description: "Gérez votre programme de fidélité restaurant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SupabaseSessionSync />
        {process.env.NODE_ENV === 'development' ? <SupabaseDevExpose /> : null}
        {children}
      </body>
    </html>
  );
}
