import { HomePageClient } from "@/components/home-page-client";
import { HomeSeoJsonLd } from "@/app/seo-json-ld";

export default function HomePage() {
  return (
    <>
      <HomeSeoJsonLd />
      <HomePageClient />
    </>
  );
}
