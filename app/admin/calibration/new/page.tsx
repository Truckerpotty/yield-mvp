"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Location = {
  id: string;
  name: string;
};

type TrackedItem = {
  id: string;
  name: string;
  unit: string;
  sub_label: string | null;
};

export default function AdminCalibrationNewPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [statusText, setStatusText] = useState("");

  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>([]);
  const [selectedTrackedId, setSelectedTrackedId] = useState<string>("");

  const [unit, setUnit] = useState<string>("");

  const [targetValue, setTargetValue] = useState<string>("");
  const [minValue, setMinValue] = useState<string>("");
  const [maxValue, setMaxValue] = useState<string>("");

  const [active, setActive] = useState<boolean>(true);

  const selectedTracked = useMemo(
    () => trackedItems.find((t) => t.id === selectedTrackedId) ?? null,
    [trackedItems, selectedTrackedId]
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
        setTrackedItems([]);
        setSelectedTrackedId("");
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

      if (cancelled) return;

      setLocations(safeLocs);
      setSelectedLocationId(safeLocs[0]?.id ?? "");
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
        setSelectedTrackedId("");
        return;
      }

      setErrorText("");
      setStatusText("Loading tracked items...");

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
        setSelectedTrackedId("");
        return;
      }

      const safe = (data ?? []) as TrackedItem[];

      if (cancelled) return;

      setTrackedItems(safe);
      setSelectedTrackedId(safe[0]?.id ?? "");
      setUnit(safe[0]?.unit ?? "");
      setStatusText("");
    }

    loadTrackedItems();

    return () => {
      cancelled = true;
    };
  }, [selectedLocationId]);

  useEffect(() => {
    if (selectedTracked) {
      setUnit(selectedTracked.unit);
    }
  }, [selectedTracked]);

  async function onCreate() {
    setErrorText("");
    setStatusText("");

    if (!selectedLocationId) {
      setErrorText("Select a location.");
      return;
    }

    if (!selectedTrackedId) {
      setErrorText("Select a tracked item.");
      return;
    }

    const targetNum = Number(targetValue);
    const minNum = Number(minValue);
    const maxNum = Number(maxValue);

    if (!Number.isFinite(targetNum)) {
      setErrorText("Target value must be a number.");
      return;
    }

    if (!Number.isFinite(minNum)) {
      setErrorText("Min value must be a number.");
      return;
    }

    if (!Number.isFinite(maxNum)) {
      setErrorText("Max value must be a number.");
      return;
    }

    if (minNum > targetNum || targetNum > maxNum) {
      setErrorText("Must satisfy min <= target <= max.");
      return;
    }

    setStatusText("Creating...");

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      setErrorText("Not signed in. Go to /login.");
      setStatusText("");
      return;
    }

    const { data: inserted, error } = await supabase
      .from("calibration_standards")
      .insert({
        location_id: selectedLocationId,
        tracked_item_id: selectedTrackedId,
        target_value: targetNum,
        min_value: minNum,
        max_value: maxNum,
        unit,
        active,
        updated_by: userData.user.id,
      })
      .select("id")
      .single();

    if (error) {
      setErrorText("Create failed: " + error.message);
      setStatusText("");
      return;
    }

    const id = inserted?.id as string;
    setStatusText("Created.");
    router.replace("/admin/calibration/" + id);
  }

  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>New Calibration Standard</div>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
        Create a target and acceptable range for a tracked item
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
        <div style={{ fontSize: 12, opacity: 0.8 }}>Tracked item</div>
        <select
          value={selectedTrackedId}
          onChange={(e) => setSelectedTrackedId(e.target.value)}
          style={{ marginTop: 6, padding: 10, width: "100%", maxWidth: 520 }}
          disabled={loading || trackedItems.length === 0}
        >
          {trackedItems.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.sub_label ? `(${t.sub_label})` : ""} [{t.unit}]
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 14, maxWidth: 520 }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>Unit</div>
        <input value={unit} readOnly style={{ marginTop: 6, padding: 10, width: "100%" }} />
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 10, maxWidth: 520 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Target value</div>
          <input
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            style={{ marginTop: 6, padding: 10, width: "100%" }}
            inputMode="decimal"
            placeholder="0"
          />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Min value</div>
          <input
            value={minValue}
            onChange={(e) => setMinValue(e.target.value)}
            style={{ marginTop: 6, padding: 10, width: "100%" }}
            inputMode="decimal"
            placeholder="0"
          />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Max value</div>
          <input
            value={maxValue}
            onChange={(e) => setMaxValue(e.target.value)}
            style={{ marginTop: 6, padding: 10, width: "100%" }}
            inputMode="decimal"
            placeholder="0"
          />
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span style={{ fontSize: 12, opacity: 0.9 }}>Active</span>
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={onCreate}
          style={{ padding: "10px 14px", border: "1px solid #ccc", borderRadius: 10, background: "white" }}
          disabled={loading}
        >
          Create standard
        </button>
      </div>
    </div>
  );
}
