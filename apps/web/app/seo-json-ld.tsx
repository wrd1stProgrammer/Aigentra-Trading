import { landingCopy } from "@/lib/marketing-copy";
import type { Locale } from "@/lib/i18n";
import { homePathForLocale } from "@/lib/locale-routing";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo";

type JsonLdValue = string | number | boolean | null | readonly JsonLdValue[] | { readonly [key: string]: JsonLdValue };

function JsonLdScript({ data }: { readonly data: JsonLdValue }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: json }} />;
}

export function HomeSeoJsonLd({ locale }: { readonly locale: Locale }) {
  const copy = landingCopy(locale);
  const homeUrl = absoluteUrl(homePathForLocale(locale));
  const faqEntities = copy.faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer
    }
  }));

  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SERN",
      url: SITE_URL,
      brand: {
        "@type": "Brand",
        name: SITE_NAME
      },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "support@aigentratrading.com"
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: homeUrl,
      description: copy.heroSubtitle,
      inLanguage: locale
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: homeUrl,
      description: copy.heroSubtitle,
      offers: {
        "@type": "Offer",
        price: "19",
        priceCurrency: "USD",
        url: absoluteUrl("/login")
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqEntities
    }
  ] as const satisfies JsonLdValue;

  return <JsonLdScript data={structuredData} />;
}
