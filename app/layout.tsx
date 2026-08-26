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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${monaSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-ground text-ink">
        <Nav />
        <SmoothScroll>
          {children}
        </SmoothScroll>
      </body>
    </html>
  );
}
