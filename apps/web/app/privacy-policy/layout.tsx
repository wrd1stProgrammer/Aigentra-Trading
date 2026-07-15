import type { ReactNode } from "react";
import { metadataForPath } from "@/lib/seo";

export const metadata = metadataForPath("/privacy-policy");

export default function PrivacyPolicyLayout({ children }: { readonly children: ReactNode }) {
  return children;
}
