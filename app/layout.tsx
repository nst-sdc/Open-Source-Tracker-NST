import type { Metadata } from "next";
import { Mona_Sans } from "next/font/google";
import { Nav } from "./components/Nav";
import SmoothScroll from "./components/SmoothScroll";
import "./globals.css";

// grauity's own face (see Newton-School/grauity constantGlobalStyle.ts).
// Variable weight + width axis, self-hosted by next/font — no layout shift.
const monaSans = Mona_Sans({
  variable: "--font-mona-sans",
  subsets: ["latin"],
  weight: "variable",
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: "Opensource Tracker",
  description: "Track pull requests and contributors across open source projects",
};

/* Applies the stored theme before the browser paints. Without this, a reader
 * who chose dark gets a flash of the light page on every navigation, because
 * the server has no way to know their choice. Kept inline and tiny for that
 * reason — an external file would arrive too late. The key must match
 * THEME_STORAGE_KEY in components/ThemeToggle.tsx. */
const NO_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t}}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the script above sets data-theme on <html>
    // before React hydrates, so the client attribute deliberately differs from
    // what the server sent.
    <html lang="en" className={`${monaSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-ground text-ink">
        <Nav />
        <SmoothScroll>
          {children}
        </SmoothScroll>
      </body>
    </html>
  );
}
