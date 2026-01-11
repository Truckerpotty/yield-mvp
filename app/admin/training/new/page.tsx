"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Location = {
  id: string;
  name: string;
};

type Employee = {
  id: string;
  display_name: string;
  email: string;
};

type TrackedItem = {
  id: string;
  name: string;
  unit: string;
  sub_label: string | null;
};

function toIsoLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromIsoLocalInputToIso(s: string) {
  const dt = new Date(s);
  return dt.toISOString();
}

export default function AdminTrainingNewPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [statusText, setStatusText] = useState("");

  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>([]);
  const [selectedTrackedIds, setSelectedTrackedIds] = useState<Record<string, boolean>>({});

  const [startsLocal, setStartsLocal] = useState(() => toIsoLocalInput(new Date(Date.now() + 5 * 60 * 1000)));
  const [endsLocal, setEndsLocal] = useState(() => toIsoLocalInput(new Date(Date.now() + 35 * 60 * 1000)));

  const selectedCount = useMemo(
    () => Object.values(selectedTrackedIds).filter(Boolean).length,
    [selectedTrackedIds]
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);
      setErrorText("");
      setStatusText("");

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) {
        setErrorText("Not signed in. Go to /login.");
        setLoading(false);
        return;
      }

      const { data: assigned, error: asgErr } = await supabase
        .from("employee_location_assignments")
        .select("location_id")
        .eq("employee_id", userData.user.id);

      if (asgErr) {
        setErrorText("Failed to load assignments: " + asgErr.message);
        setLoading(false);
        return;
      }

      const locationIds = Array.from(new Set((assigned ?? []).map((r: any) => r.location_id).filter(Boolean)));

      if (locationIds.length === 0) {
        setLocations([]);
        setSelectedLocationId("");
        setLoading(false);
        setStatusText("No assigned locations for this admin.");
        return;
      }

      const { data: locRows, error: locErr } = await supabase
        .from("locations")
        .select("id,name")
        .in("id", locationIds)
        .order("name");

      if (locErr) {
        setErrorText("Failed to load locations: " + locErr.message);
        setLoading(false);
        return;
      }

      const safeLocs = (locRows ?? []) as Location[];

      const { data: empRows, error: empErr } = await supabase
        .from("employees")
        .select("id,display_name,email")
        .eq("is_active", true)
        .order("display_name");

      if (empErr) {
        setErrorText("Failed to load employees: " + empErr.message);
        setLoading(false);
        return;
      }

      if (cancelled) return;

      setLocations(safeLocs);
      setEmployees((empRows ?? []) as Employee[]);
      setSelectedLocationId(safeLocs[0]?.id ?? "");
      setSelectedEmployeeId(((empRows ?? []) as Employee[])[0]?.id ?? "");

      setLoading(false);
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTrackedItems() {
      if (!selectedLocationId) {
        setTrackedItems([]);
        setSelectedTrackedIds({});
        return;
      }

      setStatusText("Loading tracked items...");
      setErrorText("");

      const { data, error } = await supabase
        .from("tracked_items")
        .select("id,name,unit,sub_label")
        .eq("location_id", selectedLocationId)
        .eq("active", true)
        .order("name");

      if (error) {
        setErrorText("Failed to load tracked items: " + error.message);
        setStatusText("");
        setTrackedItems([]);
        return;
      }

      if (cancelled) return;

      const safe = (data ?? []) as TrackedItem[];
      setTrackedItems(safe);

      const init: Record<string, boolean> = {};
      for (const t of safe) init[t.id] = false;
      setSelectedTrackedIds(init);

      setStatusText("");
    }

    loadTrackedItems();

    return () => {
      cancelled = true;
    };
  }, [selectedLocationId]);

  function toggleTracked(id: string) {
    setSelectedTrackedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function selectAll(on: boolean) {
    const next: Record<string, boolean> = {};
    for (const t of trackedItems) next[t.id] = on;
    setSelectedTrackedIds(next);
  }

  async function onCreate() {
    setErrorText("");
    setStatusText("");

    if (!selectedLocationId) {
      setErrorText("Select a location.");
      return;
    }
    if (!selectedEmployeeId) {
      setErrorText("Select an employee.");
      return;
    }
    if (selectedCount === 0) {
      setErrorText("Select at least one tracked item.");
      return;
    }

    const startsAtIso = fromIsoLocalInputToIso(startsLocal);
    const endsAtIso = fromIsoLocalInputToIso(endsLocal);

    if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
      setErrorText("End time must be after start time.");
      return;
    }

    setStatusText("Creating training session...");

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      setErrorText("Not signed in. Go to /login.");
      setStatusText("");
      return;
    }

    const { data: inserted, error: insErr } = await supabase
      .from("training_sessions")
      .insert({
        location_id: selectedLocationId,
        employee_id: selectedEmployeeId,
        assigned_by: userData.user.id,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        status: "assigned",
      })
      .select("id")
      .single();

    if (insErr) {
      setErrorText("Failed to create session: " + insErr.message);
      setStatusText("");
      return;
    }

    const sessionId = inserted?.id as string;

    const itemRows = Object.entries(selectedTrackedIds)
      .filter(([, v]) => v)
      .map(([tracked_item_id]) => ({
        training_session_id: sessionId,
        tracked_item_id,
      }));

    const { error: itemErr } = await supabase.from("training_session_items").insert(itemRows);

    if (itemErr) {
      setErrorText("Session created but failed to add items: " + itemErr.message);
      setStatusText("");
      return;
    }

    setStatusText("Created.");
    router.replace("/admin/training/" + sessionId);
  }

  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>New Training Session</div>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
        Assign a session window and select tracked items included in the training
      </div>

      {errorText ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ fontWeight: 800 }}>Error</div>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{errorText}</div>
        </div>
      ) : null}

      {statusText ? <div style={{ marginTop: 12, fontSize: 12, opacity: 0.9 }}>{statusText}</div> : null}

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Location</div>
        <select
          value={selectedLocationId}
          onChange={(e) => setSelectedLocationId(e.target.value)}
          style={{ marginTop: 6, padding: 10, width: "100%", maxWidth: 520 }}
          disabled={loading || locations.length === 0}
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Employee</div>
        <select
          value={selectedEmployeeId}
          onChange={(e) => setSelectedEmployeeId(e.target.value)}
          style={{ marginTop: 6, padding: 10, width: "100%", maxWidth: 520 }}
          disabled={loading || employees.length === 0}
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.display_name} {e.email ? `(${e.email})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 10, maxWidth: 520 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Starts at</div>
          <input
            type="datetime-local"
            value={startsLocal}
            onChange={(e) => setStartsLocal(e.target.value)}
            style={{ marginTop: 6, padding: 10, width: "100%" }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Ends at</div>
          <input
            type="datetime-local"
            value={endsLocal}
            onChange={(e) => setEndsLocal(e.target.value)}
            style={{ marginTop: 6, padding: 10, width: "100%" }}
          />
        </div>
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>Tracked items ({selectedCount} selected)</div>

        <button
          onClick={() => selectAll(true)}
          style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 10, background: "white" }}
          disabled={trackedItems.length === 0}
        >
          Select all
        </button>

        <button
          onClick={() => selectAll(false)}
          style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 10, background: "white" }}
          disabled={trackedItems.length === 0}
        >
          Clear
        </button>
      </div>

      <div style={{ marginTop: 10, border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
        {trackedItems.length === 0 ? (
          <div style={{ padding: 12, fontSize: 12, opacity: 0.8 }}>No active tracked items for this location.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "40px 1.5fr 1fr", gap: 0 }}>
            <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }} />
            <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Name</div>
            <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Unit</div>

            {trackedItems.map((t) => (
              <React.Fragment key={t.id}>
                <div style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                  <input type="checkbox" checked={!!selectedTrackedIds[t.id]} onChange={() => toggleTracked(t.id)} />
                </div>

                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                  <div style={{ fontWeight: 700 }}>{t.name}</div>
                  {t.sub_label ? <div style={{ opacity: 0.8 }}>Sub label {t.sub_label}</div> : null}
                </div>

                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>{t.unit}</div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={onCreate}
          style={{ padding: "10px 14px", border: "1px solid #ccc", borderRadius: 10, background: "white" }}
          disabled={loading}
        >
          Create session
        </button>
      </div>
    </div>
  );
}
