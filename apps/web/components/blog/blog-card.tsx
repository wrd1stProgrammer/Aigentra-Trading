import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import type { BlogPost } from "@/lib/blog-posts";

type BlogCardProps = {
  readonly post: BlogPost;
  readonly highlighted?: boolean;
  readonly compact?: boolean;
  readonly sequence?: number;
};

export function BlogCard({ post, highlighted = false, compact = false, sequence }: BlogCardProps) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className={`focus-ring group blog-editorial-card ${compact ? "blog-editorial-card--compact" : ""} ${
        highlighted ? "blog-editorial-card--highlighted" : ""
      }`}
    >
      <div className="blog-card-header">
        <div className="blog-card-meta">
          <span className="blog-overline blog-overline--compact">
            {post.category}
          </span>
          <span className="blog-meta">{post.date}</span>
        </div>
        {sequence ? (
          <span className="blog-card-sequence">
            {String(sequence).padStart(2, "0")}
          </span>
        ) : null}
      </div>

      <h3 className="blog-card-title">{post.title}</h3>
      <p className="blog-card-excerpt">{post.excerpt}</p>

      <div className="blog-card-footer">
        <span>{post.readingTime}</span>
        <span className="blog-card-arrow">
          <ArrowRight size={16} weight="bold" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
