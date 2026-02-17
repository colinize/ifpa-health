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
  title: "IFPA Health — Competitive Pinball Pulse Check",
  description:
    "Is competitive pinball growing or dying? A 5-second pulse check on tournament growth, player retention, and ecosystem health using IFPA data.",
  openGraph: {
    title: "IFPA Health — Competitive Pinball Pulse Check",
    description:
      "5-second pulse check on competitive pinball ecosystem health.",
    type: "website",
    siteName: "IFPA Health",
  },
  twitter: {
    card: "summary_large_image",
    title: "IFPA Health — Competitive Pinball Pulse Check",
    description:
      "Is competitive pinball growing or dying? Let the data answer.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement;var c=localStorage.getItem('theme');if(c==='light'){d.classList.add('light')}}catch(e){}`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
