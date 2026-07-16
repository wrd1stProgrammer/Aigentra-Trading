import type { Metadata } from "next";
import { headers } from "next/headers";
import { HomePageClient } from "@/components/home-page-client";
import { HomeSeoJsonLd } from "@/app/seo-json-ld";
import { metadataForHomeLocale } from "@/lib/seo";
import { REQUEST_LOCALE_HEADER, localeFromRequestHeader } from "@/lib/server-locale";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  return metadataForHomeLocale(localeFromRequestHeader(requestHeaders.get(REQUEST_LOCALE_HEADER)));
}

export default async function HomePage() {
  const requestHeaders = await headers();
  const locale = localeFromRequestHeader(requestHeaders.get(REQUEST_LOCALE_HEADER));

  return (
    <>
      <HomeSeoJsonLd locale={locale} />
      <HomePageClient />
    </>
  );
}
