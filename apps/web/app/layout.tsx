import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { AppProvider } from "@/components/app-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aigentra-trading.nostalgia-drive.com"),
  title: {
    default: "Aigentra Trading",
    template: "%s | Aigentra Trading"
  },
  description: "AI trader league dashboard for simulated BTC trading, live paper positions, scenario reviews, and Telegram alerts.",
  applicationName: "Aigentra Trading",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Aigentra Trading",
    description: "Monitor AI trader scenarios, live paper positions, risk reviews, and league performance.",
    url: "/",
    siteName: "Aigentra Trading",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Aigentra Trading" }],
    locale: "ko_KR",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Aigentra Trading",
    description: "AI trader league dashboard for simulated BTC trading and alerts.",
    images: ["/og-image.png"]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070908"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans text-zinc-900 antialiased dark:text-zinc-100`}>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
