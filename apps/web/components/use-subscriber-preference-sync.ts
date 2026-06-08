"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { SubscriberPreferences } from "@/lib/subscriber-preferences";

type SaveState = "idle" | "saving" | "saved" | "failed";

export function useSubscriberPreferenceSync(preferences: SubscriberPreferences, locale: Locale) {
  const didMount = useRef(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }

    const abortController = new AbortController();
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const response = await fetch("/api/subscriber/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...preferences, locale }),
          signal: abortController.signal,
        });
        if (!response.ok) {
          setSaveState("failed");
          return;
        }
        setSavedAt(new Date());
        setSaveState("saved");
      } catch (error) {
        if (!abortController.signal.aborted) {
          setSaveState("failed");
        }
      }
    }, 450);

    return () => {
      abortController.abort();
      window.clearTimeout(timer);
    };
  }, [locale, preferences]);

  return { savedAt, saveState };
}
