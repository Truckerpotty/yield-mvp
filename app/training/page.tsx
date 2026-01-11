"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type TrainingSessionRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  location_id: string;
  status: string;
};

export default function EmployeeTrainingIndexPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>("Checking for an active training session...");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setStatus("Checking for an active training session...");

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const user = userData?.user;

      if (userErr || !user) {
        setStatus("Not signed in. Please go to /login.");
        return;
      }

      const nowIso = new Date().toISOString();

      const { data: sessions, error: sessionErr } = await supabase
        .from("training_sessions")
        .select("id,starts_at,ends_at,location_id,status")
        .eq("employee_id", user.id)
        .lte("starts_at", nowIso)
        .gte("ends_at", nowIso)
        .order("starts_at", { ascending: false })
        .limit(1);

      if (sessionErr) {
        setStatus("Failed to check training session: " + sessionErr.message);
        return;
      }

      const session = (sessions?.[0] ?? null) as TrainingSessionRow | null;

      if (!session) {
        setStatus("No active training session right now. Returning to daily mode.");
        if (!cancelled) router.replace("/employee");
        return;
      }

      const { data: completionRows, error: completionErr } = await supabase
        .from("training_completions")
        .select("id")
        .eq("training_session_id", session.id)
        .eq("employee_id", user.id)
        .limit(1);

      if (completionErr) {
        setStatus("Failed to check completion status: " + completionErr.message);
        return;
      }

      const alreadyCompleted = (completionRows?.length ?? 0) > 0;

      if (alreadyCompleted) {
        setStatus("Training session already completed. Returning to daily mode.");
        if (!cancelled) router.replace("/employee");
        return;
      }

      setStatus("Active training session found. Entering training mode.");
      if (!cancelled) router.replace("/employee/training/" + session.id);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Training Mode</div>
      <div style={{ marginTop: 10, fontSize: 14, opacity: 0.85 }}>{status}</div>
    </div>
  );
}
