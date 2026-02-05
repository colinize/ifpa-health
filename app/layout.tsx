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
  title: "IFPA Ecosystem Health Dashboard",
  description:
    "Is competitive pinball growing or dying? A data-driven dashboard tracking tournament growth, player retention, and ecosystem health using IFPA data.",
  openGraph: {
    title: "IFPA Ecosystem Health Dashboard",
    description:
      "Data-driven dashboard tracking competitive pinball ecosystem health.",
    type: "website",
    siteName: "IFPA Health Dashboard",
  },
  twitter: {
    card: "summary_large_image",
    title: "IFPA Ecosystem Health Dashboard",
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
            __html: `try{var d=document.documentElement;var c=localStorage.getItem('theme');if(c==='dark'||(!c&&window.matchMedia('(prefers-color-scheme:dark)').matches)){d.classList.add('dark')}}catch(e){}`,
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
