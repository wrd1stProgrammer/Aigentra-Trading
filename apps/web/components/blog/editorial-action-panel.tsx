import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

type EditorialActionPanelProps = {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly button: string;
};

export function EditorialActionPanel({ eyebrow, title, body, button }: EditorialActionPanelProps) {
  return (
    <section id="article-action" className="blog-action-section">
      <div className="blog-action-panel">
        <p className="blog-overline blog-overline--inverse">{eyebrow}</p>
        <h2 className="blog-action-title">{title}</h2>
        <p className="blog-action-body">{body}</p>
        <Link href="/leaderboard" className="focus-ring blog-primary-action blog-primary-action--cta shadow-neon-emerald">
          {button}<ArrowRight size={17} weight="bold" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
