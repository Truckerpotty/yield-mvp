"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import SafeDate from "@/lib/SafeDate";

type TrainingSessionRow = {
  id: string;
  location_id: string;
  employee_id: string;
  assigned_by: string;
  starts_at: string;
  ends_at: string;
  status: string;
  created_at: string;
};

type Location = {
  id: string;
  name: string;
};

type Employee = {
  id: string;
  display_name: string;
  email: string;
};

export default function AdminTrainingListPage() {
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [statusText, setStatusText] = useState("");

  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  const [sessions, setSessions] = useState<TrainingSessionRow[]>([]);
  const [employeeMap, setEmployeeMap] = useState<Record<string, Employee>>({});
  const [locationMap, setLocationMap] = useState<Record<string, Location>>({});

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === selectedLocationId) ?? null,
    [locations, selectedLocationId]
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
        setSessions([]);
        setStatusText("No assigned locations for this admin.");
        setLoading(false);
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
      const locMap: Record<string, Location> = {};
      for (const l of safeLocs) locMap[l.id] = l;

      if (cancelled) return;

      setLocations(safeLocs);
      setLocationMap(locMap);
      setSelectedLocationId((prev) => prev || safeLocs[0]?.id || "");

      setLoading(false);
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      if (!selectedLocationId) return;

      setStatusText("Loading training sessions...");
      setErrorText("");

      const { data: rows, error } = await supabase
        .from("training_sessions")
        .select("id,location_id,employee_id,assigned_by,starts_at,ends_at,status,created_at")
        .eq("location_id", selectedLocationId)
        .order("starts_at", { ascending: false })
        .limit(100);

      if (error) {
        setErrorText("Failed to load sessions: " + error.message);
        setStatusText("");
        return;
      }

      const safe = (rows ?? []) as TrainingSessionRow[];
      const employeeIds = Array.from(
        new Set(
          safe
            .flatMap((s) => [s.employee_id, s.assigned_by])
            .filter((x) => typeof x === "string" && x.length > 0)
        )
      ) as string[];

      let empMap: Record<string, Employee> = {};

      if (employeeIds.length > 0) {
        const { data: emps, error: empErr } = await supabase
          .from("employees")
          .select("id,display_name,email")
          .in("id", employeeIds);

        if (empErr) {
          setErrorText("Failed to load employees: " + empErr.message);
          setStatusText("");
          return;
        }

        for (const e of (emps ?? []) as Employee[]) empMap[e.id] = e;
      }

      if (cancelled) return;

      setEmployeeMap(empMap);
      setSessions(safe);
      setStatusText("");
    }

    loadSessions();

    return () => {
      cancelled = true;
    };
  }, [selectedLocationId]);

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Training Sessions</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
            Create and manage training sessions for assigned locations
          </div>
        </div>

        <Link href="/admin/training/new" style={{ padding: "10px 14px", border: "1px solid #ccc", borderRadius: 10 }}>
          New session
        </Link>
      </div>

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

      {selectedLocation ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>Showing sessions for {selectedLocation.name}</div>
      ) : null}

      {statusText ? <div style={{ marginTop: 12, fontSize: 12, opacity: 0.9 }}>{statusText}</div> : null}

      {errorText ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ fontWeight: 800 }}>Error</div>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{errorText}</div>
        </div>
      ) : null}

      <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.5fr 1fr 1fr 1fr", gap: 0 }}>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Employee</div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Window</div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Status</div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Assigned by</div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Open</div>

          {sessions.map((s) => {
            const emp = employeeMap[s.employee_id];
            const asg = employeeMap[s.assigned_by];

            return (
              <React.Fragment key={s.id}>
                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                  {emp ? `${emp.display_name} (${emp.email})` : s.employee_id}
                </div>

                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                  <div>
                    <SafeDate value={s.starts_at} />
                  </div>
                  <div style={{ opacity: 0.8 }}>
                    to <SafeDate value={s.ends_at} />
                  </div>
                </div>

                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>{s.status}</div>

                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                  {asg ? `${asg.display_name}` : s.assigned_by}
                </div>

                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                  <Link href={`/admin/training/${s.id}`}>Open</Link>
                </div>
              </React.Fragment>
            );
          })}

          {sessions.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, opacity: 0.8, gridColumn: "1 / -1" }}>
              No training sessions found for this location.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
