import type { ReactNode } from "react";
import { metadataForPath } from "@/lib/seo";

export const metadata = metadataForPath("/risk-disclosure");

export default function RiskDisclosureLayout({ children }: { readonly children: ReactNode }) {
  return children;
}
