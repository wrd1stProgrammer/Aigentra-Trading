import type { Locale } from "@/lib/i18n";

export const blogEditorialLabels: Record<Locale, { readonly analysis: string; readonly methodology: string; readonly sources: string }> = {
  en: { analysis: "What this means in practice", methodology: "How this article was prepared", sources: "Sources" },
  ko: { analysis: "실전에서 이해할 핵심", methodology: "작성 및 검토 방법", sources: "참고 자료" },
  ru: { analysis: "Что это означает на практике", methodology: "Как подготовлена статья", sources: "Источники" },
  "pt-BR": { analysis: "O que isso significa na prática", methodology: "Como este artigo foi preparado", sources: "Fontes" },
  tr: { analysis: "Pratikte ne anlama geliyor", methodology: "Bu yazı nasıl hazırlandı", sources: "Kaynaklar" },
};

export function copyTextWithSelection(text: string): boolean {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  textArea.remove();
  return copied;
}
