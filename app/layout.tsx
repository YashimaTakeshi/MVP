import type { Metadata } from "next";
import { Zen_Kaku_Gothic_New, IBM_Plex_Mono, Klee_One } from "next/font/google";
import "./globals.css";

const zenKaku = Zen_Kaku_Gothic_New({
  variable: "--font-zen-kaku",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

const kleeOne = Klee_One({
  variable: "--font-klee-one",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "日程調整",
  description: "参加者はログイン不要、幹事だけGoogleカレンダーでパワーアップする日程調整",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${zenKaku.variable} ${plexMono.variable} ${kleeOne.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-ground text-ink">{children}</body>
    </html>
  );
}
