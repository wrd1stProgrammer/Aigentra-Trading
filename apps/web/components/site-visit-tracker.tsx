"use client";

import { useEffect } from "react";

export function SiteVisitTracker() {
  useEffect(() => {
    navigator.sendBeacon("/api/analytics/visit");
  }, []);

  return null;
}
