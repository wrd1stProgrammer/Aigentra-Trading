import { House } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export function EditorialHomeLink() {
  return (
    <Link href="/" className="focus-ring editorial-home-link" aria-label="홈으로 이동">
      <House size={14} weight="bold" aria-hidden="true" />
      <span>Home</span>
    </Link>
  );
}
