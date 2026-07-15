import type { ReactNode } from "react";
import { metadataForPath } from "@/lib/seo";

export const metadata = metadataForPath("/legal-notices");

export default function LegalNoticesLayout({ children }: { readonly children: ReactNode }) {
  return children;
}
