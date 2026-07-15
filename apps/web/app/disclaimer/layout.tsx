import type { ReactNode } from "react";
import { metadataForPath } from "@/lib/seo";

export const metadata = metadataForPath("/disclaimer");

export default function DisclaimerLayout({ children }: { readonly children: ReactNode }) {
  return children;
}
