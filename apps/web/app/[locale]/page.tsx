import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeSeoJsonLd } from "@/app/seo-json-ld";
import { HomePageClient } from "@/components/home-page-client";
import { LOCALIZED_HOME_LOCALES, isLocalizedHomeLocale } from "@/lib/locale-routing";
import { metadataForHomeLocale } from "@/lib/seo";

type LocalizedHomePageProps = {
  readonly params: Promise<{ readonly locale: string }>;
};

export function generateStaticParams(): { readonly locale: string }[] {
  return LOCALIZED_HOME_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocalizedHomePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocalizedHomeLocale(locale)) return {};
  return metadataForHomeLocale(locale);
}

export default async function LocalizedHomePage({ params }: LocalizedHomePageProps) {
  const { locale } = await params;
  if (!isLocalizedHomeLocale(locale)) notFound();

  return (
    <>
      <HomeSeoJsonLd locale={locale} />
      <HomePageClient />
    </>
  );
}
