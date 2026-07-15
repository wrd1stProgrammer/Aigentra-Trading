import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found",
  description: "The requested Aigentra Trading page does not exist.",
  alternates: { canonical: null },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function NotFound() {
  return (
    <main className="panel p-8">
      <h1 className="text-2xl font-semibold tracking-tight">404 · Page not found</h1>
      <p className="mt-2 text-zinc-500">요청한 페이지를 찾을 수 없습니다. 주소를 확인하거나 공개 리더보드로 이동하세요.</p>
      <Link href="/leaderboard" className="ghost-button mt-5">
        AI 트레이더 리그 보기
      </Link>
    </main>
  );
}
