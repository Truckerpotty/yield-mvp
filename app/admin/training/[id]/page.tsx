"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SafeDate from "@/lib/SafeDate";

type TrainingSession = {
  id: string;
  location_id: string;
  employee_id: string;
  assigned_by: string;
  starts_at: string;
  ends_at: string;
  status: string;
  created_at: string;
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

type Employee = {
  id: string;
  display_name: string;
  email: string;
};

type Completion = {
  id: string;
  employee_id: string;
  completed_at: string;
};

function isoToDateValue(iso: string) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function isoToTimeValue(iso: string) {
  if (!iso) return "";
  return iso.slice(11, 16);
}

function combineDateTimeToIso(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return "";
  const local = new Date(`${dateValue}T${timeValue}:00`);
  return local.toISOString();
}

export default function AdminTrainingSessionDetailPage() {
  const router = useRouter();
  const params = useParams();

  const sessionId = useMemo(() => {
    const raw = (params as any)?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [statusText, setStatusText] = useState("");

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [items, setItems] = useState<TrainingSessionItem[]>([]);
  const [trackedMap, setTrackedMap] = useState<Record<string, TrackedItem>>({});
  const [employeesMap, setEmployeesMap] = useState<Record<string, Employee>>({});
  const [completions, setCompletions] = useState<Completion[]>([]);

  const [editStatus, setEditStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");

  const [allTrackedForLocation, setAllTrackedForLocation] = useState<TrackedItem[]>([]);
  const [addTrackedId, setAddTrackedId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorText("");
      setStatusText("");

      if (!sessionId) {
        setErrorText("Missing session id.");
        setLoading(false);
        return;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) {
        setErrorText("Not signed in. Go to login.");
        setLoading(false);
        return;
      }

      const { data: sRow, error: sErr } = await supabase
        .from("training_sessions")
        .select("id,location_id,employee_id,assigned_by,starts_at,ends_at,status,created_at")
        .eq("id", sessionId)
        .maybeSingle();

      if (sErr) {
        setErrorText("Failed to load session: " + sErr.message);
        setLoading(false);
        return;
      }

      if (!sRow) {
        setErrorText("Session not found or not accessible.");
        setLoading(false);
        return;
      }

      const sessionRow = sRow as TrainingSession;

      const { data: itemRows, error: itemErr } = await supabase
        .from("training_session_items")
        .select("id,training_session_id,tracked_item_id,created_at")
        .eq("training_session_id", sessionRow.id)
        .order("created_at", { ascending: true });

      if (itemErr) {
        setErrorText("Failed to load items: " + itemErr.message);
        setLoading(false);
        return;
      }

      const safeItems = (itemRows ?? []) as TrainingSessionItem[];
      const trackedIds = Array.from(new Set(safeItems.map((r) => r.tracked_item_id)));

      let tMap: Record<string, TrackedItem> = {};
      if (trackedIds.length > 0) {
        const { data: tRows, error: tErr } = await supabase
          .from("tracked_items")
          .select("id,name,unit,sub_label")
          .in("id", trackedIds);

        if (tErr) {
          setErrorText("Failed to load tracked items: " + tErr.message);
          setLoading(false);
          return;
        }

        for (const t of (tRows ?? []) as TrackedItem[]) tMap[t.id] = t;
      }

      const employeeIds = Array.from(new Set([sessionRow.employee_id, sessionRow.assigned_by].filter(Boolean)));

      let eMap: Record<string, Employee> = {};
      if (employeeIds.length > 0) {
        const { data: eRows, error: eErr } = await supabase
          .from("employees")
          .select("id,display_name,email")
          .in("id", employeeIds);

        if (eErr) {
          setErrorText("Failed to load employees: " + eErr.message);
          setLoading(false);
          return;
        }

        for (const e of (eRows ?? []) as Employee[]) eMap[e.id] = e;
      }

      const { data: cRows, error: cErr } = await supabase
        .from("training_completions")
        .select("id,employee_id,completed_at")
        .eq("training_session_id", sessionRow.id)
        .order("completed_at", { ascending: false });

      if (cErr) {
        setErrorText("Failed to load completions: " + cErr.message);
        setLoading(false);
        return;
      }

      const { data: allTracked, error: allTrackedErr } = await supabase
        .from("tracked_items")
        .select("id,name,unit,sub_label")
        .eq("location_id", sessionRow.location_id)
        .eq("active", true)
        .order("name");

      if (allTrackedErr) {
        setErrorText("Failed to load tracked items for location: " + allTrackedErr.message);
        setLoading(false);
        return;
      }

      if (cancelled) return;

      setSession(sessionRow);
      setItems(safeItems);
      setTrackedMap(tMap);
      setEmployeesMap(eMap);
      setCompletions((cRows ?? []) as Completion[]);
      setAllTrackedForLocation((allTracked ?? []) as TrackedItem[]);

      setEditStatus(sessionRow.status ?? "");
      setStartDate(isoToDateValue(sessionRow.starts_at));
      setStartTime(isoToTimeValue(sessionRow.starts_at));
      setEndDate(isoToDateValue(sessionRow.ends_at));
      setEndTime(isoToTimeValue(sessionRow.ends_at));

      const firstAdd = ((allTracked ?? []) as TrackedItem[])[0]?.id ?? "";
      setAddTrackedId(firstAdd);

      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function onSaveSession() {
    if (!session) return;

    setErrorText("");
    setStatusText("Saving...");

    const nextStartsIso = combineDateTimeToIso(startDate, startTime) || session.starts_at;
    const nextEndsIso = combineDateTimeToIso(endDate, endTime) || session.ends_at;

    if (new Date(nextEndsIso).getTime() <= new Date(nextStartsIso).getTime()) {
      setErrorText("End must be after start.");
      setStatusText("");
      return;
    }

    const { data: updated, error } = await supabase
      .from("training_sessions")
      .update({
        starts_at: nextStartsIso,
        ends_at: nextEndsIso,
        status: editStatus,
      })
      .eq("id", session.id)
      .select("id,location_id,employee_id,assigned_by,starts_at,ends_at,status,created_at")
      .maybeSingle();

    if (error) {
      setErrorText("Save failed: " + error.message);
      setStatusText("");
      return;
    }

    if (!updated) {
      setErrorText("Save failed. No row returned.");
      setStatusText("");
      return;
    }

    setSession(updated as TrainingSession);
    setStatusText("Saved.");
  }

  async function onRemoveItem(itemId: string) {
    setErrorText("");
    setStatusText("Removing item...");

    const { error } = await supabase.from("training_session_items").delete().eq("id", itemId);

    if (error) {
      setErrorText("Remove failed: " + error.message);
      setStatusText("");
      return;
    }

    setItems((prev) => prev.filter((x) => x.id !== itemId));
    setStatusText("Removed.");
  }

  async function onAddItem() {
    if (!session) return;
    if (!addTrackedId) return;

    const already = items.some((x) => x.tracked_item_id === addTrackedId);
    if (already) {
      setStatusText("Item already included.");
      return;
    }

    setErrorText("");
    setStatusText("Adding item...");

    const { data: inserted, error } = await supabase
      .from("training_session_items")
      .insert({
        training_session_id: session.id,
        tracked_item_id: addTrackedId,
      })
      .select("id,training_session_id,tracked_item_id,created_at")
      .maybeSingle();

    if (error) {
      setErrorText("Add failed: " + error.message);
      setStatusText("");
      return;
    }

    if (!inserted) {
      setErrorText("Add failed. No row returned.");
      setStatusText("");
      return;
    }

    const ti = allTrackedForLocation.find((t) => t.id === addTrackedId) ?? null;
    if (ti) {
      setTrackedMap((prev) => ({ ...prev, [ti.id]: ti }));
    }

    setItems((prev) => [...prev, inserted as TrainingSessionItem]);
    setStatusText("Added.");
  }

  async function onDeleteSession() {
    if (!session) return;

    const ok = window.confirm("Delete this training session?");
    if (!ok) return;

    setErrorText("");
    setStatusText("Deleting...");

    const { error } = await supabase.from("training_sessions").delete().eq("id", session.id);

    if (error) {
      setErrorText("Delete failed: " + error.message);
      setStatusText("");
      return;
    }

    router.replace("/admin/training");
  }

  const employeeLabel = session ? employeesMap[session.employee_id] : null;
  const assignedByLabel = session ? employeesMap[session.assigned_by] : null;

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Training Session</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
            <Link href="/admin/training">Back to list</Link>
          </div>
        </div>

        <button
          onClick={onDeleteSession}
          style={{ padding: "10px 14px", border: "1px solid #ccc", borderRadius: 10, background: "white" }}
          disabled={loading || !session}
        >
          Delete session
        </button>
      </div>

      {loading ? <div style={{ marginTop: 12 }}>Loading...</div> : null}

      {errorText ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ fontWeight: 800 }}>Error</div>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{errorText}</div>
        </div>
      ) : null}

      {statusText ? <div style={{ marginTop: 12, fontSize: 12, opacity: 0.9 }}>{statusText}</div> : null}

      {!loading && session ? (
        <>
          <div style={{ marginTop: 16, padding: 14, border: "1px solid #ddd", borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Session info</div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
              <div>Session id {session.id}</div>
              <div>Location id {session.location_id}</div>
              <div>
                Employee{" "}
                {employeeLabel ? `${employeeLabel.display_name} (${employeeLabel.email})` : session.employee_id}
              </div>
              <div>
                Assigned by{" "}
                {assignedByLabel ? `${assignedByLabel.display_name} (${assignedByLabel.email})` : session.assigned_by}
              </div>
              <div>
                Created <SafeDate value={session.created_at} />
              </div>
              <div>
                Current window <SafeDate value={session.starts_at} /> to <SafeDate value={session.ends_at} />
              </div>
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 720 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Start date</div>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ marginTop: 6, padding: 10, width: "100%" }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Start time</div>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{ marginTop: 6, padding: 10, width: "100%" }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>End date</div>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{ marginTop: 6, padding: 10, width: "100%" }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>End time</div>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{ marginTop: 6, padding: 10, width: "100%" }}
                />
              </div>
            </div>

            <div style={{ marginTop: 12, maxWidth: 520 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Status</div>
              <input
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                style={{ marginTop: 6, padding: 10, width: "100%" }}
                placeholder="Enter status text"
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <button
                onClick={onSaveSession}
                style={{ padding: "10px 14px", border: "1px solid #ccc", borderRadius: 10, background: "white" }}
              >
                Save changes
              </button>
            </div>
          </div>

          <div style={{ marginTop: 16, padding: 14, border: "1px solid #ddd", borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Included tracked items</div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <select
                value={addTrackedId}
                onChange={(e) => setAddTrackedId(e.target.value)}
                style={{ padding: 10, maxWidth: 520, width: "100%" }}
              >
                {allTrackedForLocation.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.sub_label ? `(${t.sub_label})` : ""} [{t.unit}]
                  </option>
                ))}
              </select>

              <button
                onClick={onAddItem}
                style={{ padding: "10px 14px", border: "1px solid #ccc", borderRadius: 10, background: "white" }}
                disabled={!addTrackedId}
              >
                Add item
              </button>
            </div>

            <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 0 }}>
                <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Name</div>
                <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Unit</div>
                <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>
                  Remove
                </div>

                {items.map((it) => {
                  const t = trackedMap[it.tracked_item_id];
                  return (
                    <React.Fragment key={it.id}>
                      <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                        {t ? (
                          <>
                            <div style={{ fontWeight: 700 }}>{t.name}</div>
                            {t.sub_label ? <div style={{ opacity: 0.8 }}>Sub label {t.sub_label}</div> : null}
                          </>
                        ) : (
                          it.tracked_item_id
                        )}
                      </div>

                      <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                        {t ? t.unit : ""}
                      </div>

                      <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                        <button
                          onClick={() => onRemoveItem(it.id)}
                          style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 10, background: "white" }}
                        >
                          Remove
                        </button>
                      </div>
                    </React.Fragment>
                  );
                })}

                {items.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12, opacity: 0.8, gridColumn: "1 / -1" }}>
                    No items in this session.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, padding: 14, border: "1px solid #ddd", borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Completion</div>
            {completions.length === 0 ? (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>No completion record.</div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
                {completions.map((c) => (
                  <div key={c.id}>
                    Completed <SafeDate value={c.completed_at} /> by {c.employee_id}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
