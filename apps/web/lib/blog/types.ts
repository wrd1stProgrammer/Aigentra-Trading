export type BlogSource = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
};

export type CanonicalBlogPost = {
  readonly slug: string;
  readonly category: string;
  readonly publishedAt: string;
  readonly modifiedAt: string;
  readonly sourceIds: readonly [string, string, ...string[]];
  readonly relatedSlugs: readonly [string, string, string];
};

export type LocalizedBlogPost = {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly readingTime: string;
  readonly paragraphs: readonly [string, string, string, string, string, string];
  readonly takeaways: readonly [string, string, string, ...string[]];
  readonly riskNotice: string;
  readonly methodologyDisclosure: string;
};
