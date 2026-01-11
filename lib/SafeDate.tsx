"use client";

import React, { useEffect, useMemo, useState } from "react";

type Props = {
  value: string | null | undefined;
  fallback?: string;
};

function safeParse(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function SafeDate({ value, fallback = "" }: Props) {
  const raw = (value ?? "").trim();

  const parsed = useMemo(() => {
    if (!raw) return null;
    return safeParse(raw);
  }, [raw]);

  const stableText = useMemo(() => {
    if (!raw) return fallback;
    if (!parsed) return raw;
    return parsed.toISOString();
  }, [raw, parsed, fallback]);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const pretty = useMemo(() => {
    if (!parsed) return stableText;
    return parsed.toLocaleString();
  }, [parsed, stableText]);

  return <span suppressHydrationWarning>{mounted ? pretty : stableText}</span>;
}
