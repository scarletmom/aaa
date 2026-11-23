'use client';

import { useMemo } from 'react';
import { describeGate, type Gate } from '@/lib/linkGate';
import { useCurrentPage, useLinkQuery } from '@/lib/linkQuery';
import type { LinkGateSettings } from '@/lib/types';

export type PageGate = Gate & { path: string };

/** The gate for the current page, or null when its link carries no ?token=. */
export default function useLinkGate(settings?: LinkGateSettings): PageGate | null {
  const { path } = useCurrentPage();
  const token = useLinkQuery().get('token');
  return useMemo(() => (token ? { ...describeGate(token, settings), path } : null), [token, settings, path]);
}
