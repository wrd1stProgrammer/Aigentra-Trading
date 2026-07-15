import type { ReactNode } from "react";
import { metadataForPath } from "@/lib/seo";

export const metadata = metadataForPath("/terms");

export default function TermsLayout({ children }: { readonly children: ReactNode }) {
  return children;
}
