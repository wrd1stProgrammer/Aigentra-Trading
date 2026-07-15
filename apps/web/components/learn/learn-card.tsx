import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import type { LearnEntry } from "@/lib/learn";
import { learnUiCopy } from "@/lib/learn-locales";

type LearnCardProps = {
  readonly entry: LearnEntry;
  readonly sequence: number;
  readonly locale: Locale;
};

export function LearnCard({ entry, sequence, locale }: LearnCardProps) {
  const copy = learnUiCopy[locale];

  return (
    <Link href={`/learn/${entry.slug}`} className="focus-ring group blog-editorial-card learn-card">
      <div className="blog-card-header">
        <div className="blog-card-meta">
          <span className="blog-overline blog-overline--compact">{copy.category[entry.category]}</span>
          <span className="blog-meta">{copy.conceptNote}</span>
        </div>
        <span className="blog-card-sequence">{String(sequence).padStart(2, "0")}</span>
      </div>
      <p className="learn-card-term">{entry.term}</p>
      <h3 className="blog-card-title learn-card-title">{entry.localizedTerm}</h3>
      <p className="blog-card-excerpt">{entry.summary}</p>
      <div className="blog-card-footer">
        <span>{copy.cardAction}</span>
        <span className="blog-card-arrow"><ArrowRight size={16} weight="bold" aria-hidden="true" /></span>
      </div>
    </Link>
  );
}
