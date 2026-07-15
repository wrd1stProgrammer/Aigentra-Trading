# Aigentra Trading SEO, SNS, Community Exposure Strategy

Updated: 2026-07-09  
Primary domain: `https://aigentratrading.com`

## Positioning

Aigentra Trading should be positioned as an AI trader league for simulated BTC futures analysis, not as an auto-trading bot, signal room, exchange execution tool, or investment adviser. The winning message is:

- Compare 20+ AI trader styles in a public leaderboard.
- Inspect simulated BTC futures decisions, risk reviews, and current plans.
- Follow selected traders through Telegram alerts.
- No exchange custody, no live order execution, no guaranteed performance, no financial advice.

Primary SEO keywords:

- English: `AI trader league`, `AI trading leaderboard`, `AI trading simulator`, `paper trading competition`, `BTC futures AI sentiment`, `Telegram trading alerts`, `simulated crypto futures trading`.
- Korean: `AI 트레이더 리그`, `AI 트레이딩 리더보드`, `AI 트레이딩 순위`, `암호화폐 모의투자`, `BTC 선물 시뮬레이션`, `비트코인 선물 센티멘트`.

## Technical SEO Now Implemented

- Canonical frontend domain is `https://aigentratrading.com`.
- Public pages have unique metadata, canonical tags, Open Graph tags, and `summary_large_image` Twitter/X cards.
- `/sitemap.xml` includes canonical public URLs for home, leaderboard, consensus, legal/trust pages, trader detail pages, the blog index, and all 60 blog articles.
- `/robots.txt` advertises the sitemap and disallows auth/admin/API/diagnostic/redirect-only surfaces.
- `/login` and `/tests` render `noindex, nofollow`; private and duplicate routes are also source-protected with noindex metadata.
- Homepage includes JSON-LD for Organization, WebSite, SoftwareApplication, and FAQPage using visible product claims only.
- Blog articles publish visible-source-aligned BlogPosting JSON-LD, ISO publication/update dates, an on-page research-desk byline, citations, methodology, risk disclosures, and semantic related-article links.
- Public legal/domain copy now uses `aigentratrading.com`; backend API fallback host remains intentionally unchanged.

## Search Operations

1. Add and verify `https://aigentratrading.com` in Google Search Console.
2. Submit `https://aigentratrading.com/sitemap.xml`.
3. Inspect `/`, `/leaderboard`, `/leaderboard/channel-rider`, `/consensus`, `/risk-disclosure`.
4. Request indexing only after production deployment and the canonical domain serve the same metadata verified locally.
5. Do not create thin keyword pages. Expand only when there is a real public use case, for example a real comparison page, monthly league archive, or methodology page.

References: [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls), [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Google robots.txt guidance](https://developers.google.com/search/docs/crawling-indexing/robots/intro), [Google robots meta guidance](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag), [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies), [Next.js metadata docs](https://nextjs.org/docs/app/api-reference/functions/generate-metadata).

## Social Preview Operations

Use the same canonical URL everywhere. Do not share Vercel preview URLs once the domain is live.

- Meta/Facebook/Instagram: validate with [Meta Sharing Debugger](https://developers.facebook.com/tools/debug/).
- LinkedIn: refresh previews with [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/).
- Telegram/Discord/X: manually paste the public URL after deployment and check title, description, image, and domain.
- Open Graph minimum: `og:title`, `og:type`, `og:image`, `og:url`; this is now covered by the app. Reference: [Open Graph protocol](https://ogp.me/).

## Channel Priority

1. Search foundation: Google Search Console, sitemap, branded queries, and public route indexing.
2. X and LinkedIn: build-in-public, strategy breakdowns, product clips, leaderboard snapshots.
3. YouTube Shorts, TikTok, Reels: vertical clips showing one specific trader scenario or leaderboard movement.
4. Product Hunt: only after the product is stable, social preview is polished, onboarding works, and maker profile is warmed up.
5. Hacker News: only as a genuine `Show HN` when there is a tryable product/demo and a concrete technical angle.
6. Reddit and Korean crypto/trading communities: selective, rule-aware, discussion-first participation.
7. Discord/Telegram: retention and support channels after demand exists; not cold acquisition spam.

## 30/60/90 Day Cadence

Days 1-30:

- Deploy canonical domain and submit sitemap.
- Publish 10 short posts: 4 leaderboard breakdowns, 3 trader profile explainers, 2 risk/methodology posts, 1 launch story.
- Warm up Product Hunt, HN, Reddit, and Korean community accounts by commenting/helping without links.
- Record 5 vertical clips: leaderboard overview, one trader profile, consensus page, Telegram alert flow, risk disclosure.

Days 31-60:

- Publish one useful long-form page: methodology, trader taxonomy, or monthly league archive.
- Launch Product Hunt if onboarding/payment/preview flow is stable.
- Test small paid retargeting only after landing page compliance and conversion tracking are ready.
- Start one opt-in community channel only if support burden is manageable.

Days 61-90:

- Build monthly SEO assets: `July AI trader league recap`, `BTC futures AI sentiment archive`, and trader-style explainers if real data supports them.
- Iterate paid ads with strict negative claim review.
- Run creator/community collaborations around analysis workflows, not profit promises.

## Community Rules

Product Hunt:

- Build presence before launch.
- Ask for feedback, not upvotes.
- Do not pay hunters, run upvote contests, or spam DMs.
- References: [Before launch](https://www.producthunt.com/launch/before-launch), [Sharing your launch](https://www.producthunt.com/launch/sharing-your-launch).

Hacker News:

- Use only if there is a real build/demo and a technical story.
- Do not solicit upvotes, comments, or submissions.
- Reference: [HN guidelines](https://news.ycombinator.com/newsguidelines.html).

Reddit:

- Read each subreddit rule first.
- Disclose affiliation.
- Post useful context even if the link is removed.
- Avoid repeated link drops, PM spam, hidden affiliation, and vote requests.
- References: [Reddit spam policy](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam), [Reddit self-promotion guide](https://www.reddit.com/r/reddit.com/wiki/selfpromotion/).

Korean communities:

- Treat Coinpan, DCInside, Ppomppu-style communities as high-risk for promotion.
- Ask moderators before posting links or recruitment.
- Prefer non-promotional analysis posts: "20개 AI 전략이 같은 구간을 다르게 보는 이유" style.

Discord/Telegram:

- Use for opt-in support, alerts, and community after users ask for it.
- Do not cold-DM or scrape users from other communities.

## Short-Form Creative System

Formats:

- 9:16 vertical.
- First 2 seconds show the concrete screen: leaderboard movement, trader detail, consensus, or Telegram alert.
- Keep finance disclaimer visible in caption or landing page: simulated data, no live execution, not financial advice.
- YouTube Shorts can now support up to 3 minutes, but first tests should stay 15-45 seconds. Reference: [YouTube Shorts Help](https://support.google.com/youtube/answer/15424877?hl=en).

Hooks:

- "20 AI traders watched the same BTC futures move. They did not agree."
- "This AI trader refused the breakout. Here is the risk reason."
- "Leaderboard rank alone is not enough. Check the current plan."
- "AI sentiment says mixed. Here is what changed."

Do not use:

- Guaranteed returns, zero-risk framing, passive income framing, copy-trading commands, "buy/sell now", "AI will make you money".
- Fake testimonials or unverifiable screenshots.
- Claims that imply Aigentra executes trades or manages user funds.

## Paid Ads Guardrails

Paid ads should wait until:

- Search Console is verified.
- Social preview debuggers show the correct image/title.
- Event tracking and UTMs are configured.
- Legal/risk pages are visible and linked.

Use clean canonical pages with UTMs:

```text
utm_source=tiktok|youtube|x|linkedin|reddit
utm_medium=paid_social|organic_social|community
utm_campaign=launch_2026_q3
utm_content=leaderboard_demo|trader_profile|consensus_clip
utm_term=ai_trader_league
```

Canonical remains the clean URL. Do not create indexed UTM variants.

Financial/crypto ad policies vary by market and can require approvals or restrictions. References: [Google Ads financial products policy](https://support.google.com/adspolicy/answer/2464998?hl=en), [TikTok landing page checklist](https://ads.tiktok.com/help/article/ad-review-checklist-landing-page?lang=en), [X financial services policy](https://business.x.com/en/help/ads-policies/ads-content-policies/financial-services), [Meta financial services policy](https://transparency.meta.com/policies/ad-standards/restricted-goods-services/financial-services/).

## First Post Templates

X / LinkedIn:

```text
I built Aigentra Trading: an AI trader league for simulated BTC futures.

It compares multiple AI trader styles side-by-side:
- leaderboard rank
- current simulated exposure
- risk review
- AI sentiment
- Telegram alerts for favorites

No live execution, no custody, no financial advice. Looking for feedback on the public leaderboard:
https://aigentratrading.com/leaderboard
```

Product Hunt:

```text
Hi Product Hunt. I made Aigentra Trading, a simulated BTC futures AI trader league.

The goal is not to send another buy/sell signal. It is to compare how different AI trader styles plan entries, reject setups, manage risk, and rank over time.

I would love feedback on whether the leaderboard and trader detail pages make the decision flow understandable.
```

HN:

```text
Show HN: Aigentra Trading - an AI trader league for simulated BTC futures

I built a public leaderboard that compares simulated AI trader strategies by plan, exposure, and risk review rather than only a signal output. The technical angle is making strategy state inspectable without connecting to an exchange account.

Feedback I am looking for: is the decision trace understandable before signup?
```

Reddit/community:

```text
Disclosure: I built this.

I am testing a public AI trader league for simulated BTC futures. The part I want feedback on is whether comparing multiple strategy styles is more useful than a single signal feed.

No live trading, no custody, no financial advice. If links are not allowed here, I can summarize the methodology instead.
```

## Asset Checklist

- `og-image.png` 1200x630.
- 5 vertical videos.
- 5 static screenshots: homepage, leaderboard, trader profile, consensus, Telegram alert.
- One pinned risk disclosure thread.
- One methodology post.
- One launch post per platform, rewritten per platform.
- UTM plan and analytics event map.

## Do Not Post

- "Guaranteed returns", zero-risk claims, "AI auto profit", copy-trading commands, regulated-advice framing.
- Same text across many communities.
- Any upvote request.
- Hidden founder affiliation.
- Invite links into Telegram/Discord where the community bans recruiting.
- Screenshots implying live user funds, brokerage execution, or historical returns that are not clearly simulated.
