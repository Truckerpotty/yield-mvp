"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Location = {
  id: string;
  name: string;
};

type CalibrationStandard = {
  id: string;
  location_id: string;
  tracked_item_id: string;
  target_value: number;
  min_value: number;
  max_value: number;
  unit: string;
  active: boolean;
  updated_by: string | null;
  updated_at: string;
};

type TrackedItem = {
  id: string;
  name: string;
  unit: string;
  sub_label: string | null;
};

function normLabel(s: string | null | undefined) {
  const t = (s ?? "").trim();
  return t ? t : "default";
}

export default function AdminCalibrationListPage() {
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [statusText, setStatusText] = useState("");

  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  const [standards, setStandards] = useState<CalibrationStandard[]>([]);
  const [trackedMap, setTrackedMap] = useState<Record<string, TrackedItem>>({});

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

      const locationIds = Array.from(
        new Set((assigned ?? []).map((r: any) => r.location_id).filter(Boolean))
      );

      if (locationIds.length === 0) {
        setLocations([]);
        setSelectedLocationId("");
        setStandards([]);
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

      if (cancelled) return;

      setLocations(safeLocs);
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

    async function loadForLocation() {
      if (!selectedLocationId) return;

      setErrorText("");
      setStatusText("Loading calibration standards...");

      const { data: sRows, error: sErr } = await supabase
        .from("calibration_standards")
        .select("id,location_id,tracked_item_id,target_value,min_value,max_value,unit,active,updated_by,updated_at")
        .eq("location_id", selectedLocationId)
        .order("updated_at", { ascending: false });

      if (sErr) {
        setErrorText("Failed to load standards: " + sErr.message);
        setStatusText("");
        setStandards([]);
        return;
      }

      const safeStandards = (sRows ?? []) as CalibrationStandard[];
      const trackedIds = Array.from(new Set(safeStandards.map((s) => s.tracked_item_id)));

      let tMap: Record<string, TrackedItem> = {};

      if (trackedIds.length > 0) {
        const { data: tRows, error: tErr } = await supabase
          .from("tracked_items")
          .select("id,name,unit,sub_label")
          .in("id", trackedIds);

        if (tErr) {
          setErrorText("Failed to load tracked items: " + tErr.message);
          setStatusText("");
          setStandards([]);
          return;
        }

        for (const t of (tRows ?? []) as TrackedItem[]) tMap[t.id] = t;
      }

      if (cancelled) return;

      setTrackedMap(tMap);
      setStandards(safeStandards);
      setStatusText("");
    }

    loadForLocation();

    return () => {
      cancelled = true;
    };
  }, [selectedLocationId]);

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Calibration Standards</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
            Manage target, min, and max values per tracked item
          </div>
        </div>

        <Link
          href="/admin/calibration/new"
          style={{ padding: "10px 14px", border: "1px solid #ccc", borderRadius: 10 }}
        >
          New standard
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
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
          Showing standards for {selectedLocation.name}
        </div>
      ) : null}

      {statusText ? <div style={{ marginTop: 12, fontSize: 12, opacity: 0.9 }}>{statusText}</div> : null}

      {errorText ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <div style={{ fontWeight: 800 }}>Error</div>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{errorText}</div>
        </div>
      ) : null}

      <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.8fr 0.8fr", gap: 0 }}>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>
            Tracked item
          </div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Target</div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Min</div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Max</div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Active</div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Open</div>

          {standards.map((s) => {
            const t = trackedMap[s.tracked_item_id];

            return (
              <React.Fragment key={s.id}>
                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                  {t ? (
                    <>
                      <div style={{ fontWeight: 700 }}>{t.name}</div>
                      <div style={{ opacity: 0.8 }}>
                        Unit {s.unit} Sub label {normLabel(t.sub_label)}
                      </div>
                    </>
                  ) : (
                    s.tracked_item_id
                  )}
                </div>

                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>{String(s.target_value)}</div>
                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>{String(s.min_value)}</div>
                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>{String(s.max_value)}</div>
                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>{s.active ? "Yes" : "No"}</div>

                <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                  <Link href={`/admin/calibration/${s.id}`}>Open</Link>
                </div>
              </React.Fragment>
            );
          })}

          {standards.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, opacity: 0.8, gridColumn: "1 / -1" }}>
              No calibration standards found for this location.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
