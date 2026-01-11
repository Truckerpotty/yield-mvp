"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type TrainingSession = {
  id: string;
  location_id: string;
  employee_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type TrainingSessionItem = {
  id: string;
  training_session_id: string;
  tracked_item_id: string;
  created_at: string;
};

type TrackedItem = {
  id: string;
  name: string;
  unit: string;
  sub_label: string | null;
};

type CalibrationStandard = {
  id: string;
  location_id: string;
  tracked_item_id: string;
  target_value: string;
  min_value: string;
  max_value: string;
  unit: string;
  active: boolean;
  updated_at: string;
};

type FeedbackState = "unknown" | "in_range" | "below_range" | "above_range";

function toNumberOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n;
}

function feedbackFor(value: number, min: number, max: number): FeedbackState {
  if (value < min) return "below_range";
  if (value > max) return "above_range";
  return "in_range";
}

export default function EmployeeTrainingSessionPage() {
  const router = useRouter();
  const params = useParams();

  const sessionId = useMemo(() => {
    const raw = (params as any)?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [items, setItems] = useState<TrainingSessionItem[]>([]);
  const [trackedById, setTrackedById] = useState<Record<string, TrackedItem>>({});
  const [calByTrackedId, setCalByTrackedId] = useState<Record<string, CalibrationStandard>>({});

  const [index, setIndex] = useState(0);
  const [inputText, setInputText] = useState("");
  const [lastFeedback, setLastFeedback] = useState<FeedbackState>("unknown");
  const [submittingCompletion, setSubmittingCompletion] = useState(false);
  const [statusText, setStatusText] = useState("");

  const currentItem = items[index] ?? null;
  const currentTracked = currentItem ? trackedById[currentItem.tracked_item_id] ?? null : null;
  const currentCal = currentItem ? calByTrackedId[currentItem.tracked_item_id] ?? null : null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorText("");
      setStatusText("");

      if (!sessionId) {
        setErrorText("Missing training session id.");
        setLoading(false);
        return;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const user = userData?.user;

      if (userErr || !user) {
        setErrorText("Not signed in. Please go to /login.");
        setLoading(false);
        return;
      }

      const { data: sessionRow, error: sessionErr } = await supabase
        .from("training_sessions")
        .select("id,location_id,employee_id,starts_at,ends_at,status")
        .eq("id", sessionId)
        .limit(1)
        .maybeSingle();

      if (sessionErr) {
        setErrorText("Failed to load session: " + sessionErr.message);
        setLoading(false);
        return;
      }

      if (!sessionRow) {
        setErrorText("Session not found or not accessible.");
        setLoading(false);
        return;
      }

      if (sessionRow.employee_id !== user.id) {
        setErrorText("Session not assigned to the signed in employee.");
        setLoading(false);
        return;
      }

      const { data: completionRows, error: completionErr } = await supabase
        .from("training_completions")
        .select("id")
        .eq("training_session_id", sessionId)
        .eq("employee_id", user.id)
        .limit(1);

      if (completionErr) {
        setErrorText("Failed to check completion: " + completionErr.message);
        setLoading(false);
        return;
      }

      if ((completionRows?.length ?? 0) > 0) {
        setStatusText("Training already completed. Returning to daily mode.");
        setLoading(false);
        if (!cancelled) router.replace("/employee");
        return;
      }

      const { data: itemRows, error: itemsErr } = await supabase
        .from("training_session_items")
        .select("id,training_session_id,tracked_item_id,created_at")
        .eq("training_session_id", sessionId)
        .order("created_at", { ascending: true });

      if (itemsErr) {
        setErrorText("Failed to load session items: " + itemsErr.message);
        setLoading(false);
        return;
      }

      const safeItems = (itemRows ?? []) as TrainingSessionItem[];
      const trackedIds = Array.from(new Set(safeItems.map((r) => r.tracked_item_id)));

      let trackedMap: Record<string, TrackedItem> = {};
      if (trackedIds.length > 0) {
        const { data: trackedRows, error: trackedErr } = await supabase
          .from("tracked_items")
          .select("id,name,unit,sub_label")
          .in("id", trackedIds);

        if (trackedErr) {
          setErrorText("Failed to load tracked items: " + trackedErr.message);
          setLoading(false);
          return;
        }

        for (const t of (trackedRows ?? []) as TrackedItem[]) {
          trackedMap[t.id] = t;
        }
      }

      let calMap: Record<string, CalibrationStandard> = {};
      if (trackedIds.length > 0) {
        const { data: calRows, error: calErr } = await supabase
          .from("calibration_standards")
          .select("id,location_id,tracked_item_id,target_value,min_value,max_value,unit,active,updated_at")
          .eq("location_id", sessionRow.location_id)
          .in("tracked_item_id", trackedIds)
          .eq("active", true);

        if (calErr) {
          setErrorText("Failed to load calibration standards: " + calErr.message);
          setLoading(false);
          return;
        }

        for (const c of (calRows ?? []) as CalibrationStandard[]) {
          calMap[c.tracked_item_id] = c;
        }
      }

      if (cancelled) return;

      setSession(sessionRow as TrainingSession);
      setItems(safeItems);
      setTrackedById(trackedMap);
      setCalByTrackedId(calMap);
      setIndex(0);
      setInputText("");
      setLastFeedback("unknown");
      setLoading(false);

      if (safeItems.length === 0) {
        setStatusText("This training session has no items.");
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [router, sessionId]);

  function onCheck() {
    setLastFeedback("unknown");

    if (!currentCal) {
      setStatusText("Calibration is not available for this item.");
      return;
    }

    const v = toNumberOrNull(inputText);
    if (v === null) {
      setStatusText("Enter a numeric value.");
      return;
    }

    const min = Number(currentCal.min_value);
    const max = Number(currentCal.max_value);

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      setStatusText("Calibration values are invalid.");
      return;
    }

    setStatusText("");
    setLastFeedback(feedbackFor(v, min, max));
  }

  function onNext() {
    setStatusText("");
    setInputText("");
    setLastFeedback("unknown");

    if (index + 1 < items.length) {
      setIndex(index + 1);
    }
  }

  function onPrev() {
    setStatusText("");
    setInputText("");
    setLastFeedback("unknown");

    if (index > 0) {
      setIndex(index - 1);
    }
  }

  async function onComplete() {
    setErrorText("");
    setStatusText("");

    if (!session) return;

    setSubmittingCompletion(true);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const user = userData?.user;

    if (userErr || !user) {
      setSubmittingCompletion(false);
      setErrorText("Not signed in. Please go to /login.");
      return;
    }

    const { error: insertErr } = await supabase.from("training_completions").insert({
      training_session_id: session.id,
      employee_id: user.id
    });

    if (insertErr) {
      setSubmittingCompletion(false);
      setErrorText("Failed to complete training: " + insertErr.message);
      return;
    }

    setSubmittingCompletion(false);
    router.replace("/employee");
  }

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Training Mode</div>
      <div style={{ fontSize: 13, opacity: 0.85 }}>
        Item {items.length === 0 ? 0 : index + 1} of {items.length}
      </div>
    </div>
  );

  const itemTitle = currentTracked ? currentTracked.name : currentItem ? currentItem.tracked_item_id : "No item";
  const subLabel = currentTracked?.sub_label ? ` ${currentTracked.sub_label}` : "";
  const calUnit = currentCal?.unit ?? currentTracked?.unit ?? "";

  let feedbackText = "";
  if (lastFeedback === "in_range") feedbackText = "Within range";
  if (lastFeedback === "below_range") feedbackText = "Below range";
  if (lastFeedback === "above_range") feedbackText = "Above range";

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      {header}

      {loading ? <div style={{ marginTop: 12 }}>Loading...</div> : null}

      {!loading && errorText ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ fontWeight: 700 }}>Error</div>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{errorText}</div>
        </div>
      ) : null}

      {!loading && !errorText ? (
        <>
          {statusText ? <div style={{ marginTop: 12, fontSize: 14, opacity: 0.85 }}>{statusText}</div> : null}

          <div style={{ marginTop: 16, padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {itemTitle}
              {subLabel}
            </div>

            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
              {currentCal ? (
                <>
                  Target {String(currentCal.target_value)} {calUnit} Range {String(currentCal.min_value)} to{" "}
                  {String(currentCal.max_value)} {calUnit}
                </>
              ) : (
                <>Calibration unavailable for this item</>
              )}
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={"Enter value"}
                inputMode="decimal"
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  minWidth: 220
                }}
              />

              <button
                onClick={onCheck}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "white",
                  cursor: "pointer"
                }}
              >
                Check
              </button>

              {feedbackText ? (
                <div style={{ padding: "8px 10px", border: "1px solid #ddd", borderRadius: 10 }}>{feedbackText}</div>
              ) : null}
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={onPrev}
                disabled={index === 0}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: index === 0 ? "#f3f3f3" : "white",
                  cursor: index === 0 ? "not-allowed" : "pointer"
                }}
              >
                Previous
              </button>

              <button
                onClick={onNext}
                disabled={index + 1 >= items.length}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: index + 1 >= items.length ? "#f3f3f3" : "white",
                  cursor: index + 1 >= items.length ? "not-allowed" : "pointer"
                }}
              >
                Next
              </button>

              <button
                onClick={onComplete}
                disabled={submittingCompletion || items.length === 0}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: submittingCompletion || items.length === 0 ? "#f3f3f3" : "white",
                  cursor: submittingCompletion || items.length === 0 ? "not-allowed" : "pointer",
                  marginLeft: "auto"
                }}
              >
                {submittingCompletion ? "Completing..." : "Complete training"}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.75 }}>
            Feedback is instant and local. No per attempt training data is stored.
          </div>
        </>
      ) : null}
    </div>
  );
}
