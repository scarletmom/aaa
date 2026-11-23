'use client';

import { useEffect, useState } from 'react';
import { formatLongDate } from '@/lib/format';

// Filled in by the browser: the prerendered HTML can't know today's date.
export default function TodayDate() {
  const [today, setToday] = useState('');
  useEffect(() => setToday(formatLongDate(new Date())), []);
  return <span>{today}</span>;
}
