'use client';

import { useCallback, useEffect, useState } from 'react';

// Per-event, per-tab navigation only: never persist credentials or unsaved form data.
export function useRememberedPage(eventId?: string) {
  const key = eventId ? `country-dance-judging:page:${eventId}` : null;
  const [view, setView] = useState<{ key: string | null; page: number }>({ key: null, page: 0 });
  useEffect(() => {
    let page = 0;
    try {
      const saved = key ? sessionStorage.getItem(key) : null;
      if (saved !== null && /^[0-3]$/.test(saved)) page = Number(saved);
    } catch { /* Navigation still works when browser storage is unavailable. */ }
    let active = true;
    queueMicrotask(() => { if (active) setView({ key, page }); });
    return () => { active = false; };
  }, [key]);
  const setPage = useCallback((page: number) => {
    if (!Number.isInteger(page) || page < 0 || page > 3) return;
    setView({ key, page });
    try { if (key) sessionStorage.setItem(key, String(page)); } catch { /* In-memory navigation remains available. */ }
  }, [key]);
  return [view.key === key ? view.page : 0, setPage] as const;
}
