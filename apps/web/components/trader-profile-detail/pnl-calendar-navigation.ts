"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";
import {
  buildMonthlyPnlCalendar,
  normalizeEquitySnapshots,
  type MonthlyPnlCalendar
} from "@/components/trader-profile-detail/pnl-calendar";

type PnlCalendarNavigationInput = {
  readonly contextKey: string;
  readonly locale: Locale;
  readonly startingEquity: number;
  readonly snapshots: unknown;
  readonly dailyPnl: readonly { readonly date: string; readonly pnl: number }[];
};

export type PnlCalendarNavigation = {
  readonly calendar: MonthlyPnlCalendar;
  readonly canNextMonth: boolean;
  readonly onPreviousMonth: () => void;
  readonly onNextMonth: () => void;
};

export function usePnlCalendarNavigation(input: PnlCalendarNavigationInput): PnlCalendarNavigation {
  const [selectedMonth, setSelectedMonth] = useState(currentUtcMonth);
  const snapshots = useMemo(() => normalizeEquitySnapshots(input.snapshots), [input.snapshots]);

  useEffect(() => {
    setSelectedMonth(currentUtcMonth());
  }, [input.contextKey]);

  const calendar = useMemo(
    () => buildMonthlyPnlCalendar({
      now: selectedMonth,
      locale: input.locale,
      startingEquity: input.startingEquity,
      snapshots,
      dailyPnl: input.dailyPnl
    }),
    [input.dailyPnl, input.locale, input.startingEquity, selectedMonth, snapshots]
  );

  const currentMonth = currentUtcMonth();
  const canNextMonth = selectedMonth.getTime() < currentMonth.getTime();
  const onPreviousMonth = useCallback(() => {
    setSelectedMonth((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)));
  }, []);
  const onNextMonth = useCallback(() => {
    setSelectedMonth((month) => {
      const nextMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
      const latestMonth = currentUtcMonth();
      return nextMonth.getTime() > latestMonth.getTime() ? month : nextMonth;
    });
  }, []);

  return { calendar, canNextMonth, onPreviousMonth, onNextMonth };
}

function currentUtcMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
