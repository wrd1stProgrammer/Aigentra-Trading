import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { AppProvider } from "@/components/app-provider";
import { SiteVisitTracker } from "@/components/site-visit-tracker";
import { SITE_NAME, SITE_URL, metadataForPath } from "@/lib/seo";
import { REQUEST_LOCALE_HEADER, localeFromRequestHeader } from "@/lib/server-locale";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

const homeMetadata = metadataForPath("/");

export const metadata: Metadata = {
  ...homeMetadata,
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Aigentra Trading - AI Trader League for Simulated BTC Futures",
    template: `%s | ${SITE_NAME}`
  },
  applicationName: SITE_NAME,
  creator: "SERN",
  publisher: "SERN",
  category: "finance",
  verification: {
    other: {
      "naver-site-verification": "6cecf585a2c292f0706f14738977fd48fb926154"
    }
  },
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  twitter: {
    ...homeMetadata.twitter,
    card: "summary_large_image"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070908"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const initialLocale = localeFromRequestHeader(requestHeaders.get(REQUEST_LOCALE_HEADER));

  return (
    <html lang={initialLocale} className="dark" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="https://unpkg.com/react-scan/dist/auto.global.js"
            crossOrigin="anonymous"
            strategy="lazyOnload"
          />
        )}

        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="lazyOnload"
          />
        )}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans text-zinc-900 antialiased dark:text-zinc-100`}>
        <AppProvider initialLocale={initialLocale}>
          <SiteVisitTracker />
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
