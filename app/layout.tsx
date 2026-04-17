import type { Metadata } from "next";
import { Source_Serif_4, DM_Sans } from "next/font/google";
import "./globals.css";

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
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
    <html lang="en">
      <body
        className={`${sourceSerif.variable} ${dmSans.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
