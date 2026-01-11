"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SafeDate from "@/lib/SafeDate";

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

export default function AdminCalibrationDetailPage() {
  const router = useRouter();
  const params = useParams();

  const standardId = useMemo(() => {
    const raw = (params as any)?.id;
    return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [statusText, setStatusText] = useState("");

  const [standard, setStandard] = useState<CalibrationStandard | null>(null);
  const [tracked, setTracked] = useState<TrackedItem | null>(null);

  const [targetValue, setTargetValue] = useState<string>("");
  const [minValue, setMinValue] = useState<string>("");
  const [maxValue, setMaxValue] = useState<string>("");
  const [active, setActive] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorText("");
      setStatusText("");

      if (!standardId) {
        setErrorText("Missing calibration standard id.");
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
        .from("calibration_standards")
        .select("id,location_id,tracked_item_id,target_value,min_value,max_value,unit,active,updated_by,updated_at")
        .eq("id", standardId)
        .maybeSingle();

      if (sErr) {
        setErrorText("Failed to load standard: " + sErr.message);
        setLoading(false);
        return;
      }

      if (!sRow) {
        setErrorText("Standard not found or not accessible.");
        setLoading(false);
        return;
      }

      const std = sRow as CalibrationStandard;

      const { data: tRow, error: tErr } = await supabase
        .from("tracked_items")
        .select("id,name,unit,sub_label")
        .eq("id", std.tracked_item_id)
        .maybeSingle();

      if (tErr) {
        setErrorText("Failed to load tracked item: " + tErr.message);
        setLoading(false);
        return;
      }

      if (cancelled) return;

      setStandard(std);
      setTracked((tRow ?? null) as TrackedItem | null);

      setTargetValue(String(std.target_value));
      setMinValue(String(std.min_value));
      setMaxValue(String(std.max_value));
      setActive(std.active);

      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [standardId]);

  async function onSave() {
    if (!standard) return;

    setErrorText("");
    setStatusText("");

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

    setStatusText("Saving...");

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      setErrorText("Not signed in. Go to /login.");
      setStatusText("");
      return;
    }

    const { data: updated, error } = await supabase
      .from("calibration_standards")
      .update({
        target_value: targetNum,
        min_value: minNum,
        max_value: maxNum,
        active,
        updated_by: userData.user.id,
      })
      .eq("id", standard.id)
      .select("id,location_id,tracked_item_id,target_value,min_value,max_value,unit,active,updated_by,updated_at")
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

    setStandard(updated as CalibrationStandard);
    setStatusText("Saved.");
  }

  async function onBackToList() {
    router.push("/admin/calibration");
  }

  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Calibration Standard</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
            <Link href="/admin/calibration">Back to list</Link>
          </div>
        </div>

        <button
          onClick={onBackToList}
          style={{ padding: "10px 14px", border: "1px solid #ccc", borderRadius: 10, background: "white" }}
        >
          Back
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

      {!loading && standard ? (
        <div style={{ marginTop: 16, padding: 14, border: "1px solid #ddd", borderRadius: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Standard info</div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
            <div>Standard id {standard.id}</div>
            <div>Location id {standard.location_id}</div>
            <div>
              Tracked item{" "}
              {tracked ? `${tracked.name} ${tracked.sub_label ? `(${tracked.sub_label})` : ""}` : standard.tracked_item_id}
            </div>
            <div>Unit {standard.unit}</div>
            <div>
              Updated <SafeDate value={standard.updated_at} />
            </div>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10, maxWidth: 520 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Target value</div>
              <input
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                style={{ marginTop: 6, padding: 10, width: "100%" }}
                inputMode="decimal"
              />
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Min value</div>
              <input
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
                style={{ marginTop: 6, padding: 10, width: "100%" }}
                inputMode="decimal"
              />
            </div>

            <div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Max value</div>
              <input
                value={maxValue}
                onChange={(e) => setMaxValue(e.target.value)}
                style={{ marginTop: 6, padding: 10, width: "100%" }}
                inputMode="decimal"
              />
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span style={{ fontSize: 12, opacity: 0.9 }}>Active</span>
            </label>
          </div>

          <div style={{ marginTop: 14 }}>
            <button
              onClick={onSave}
              style={{ padding: "10px 14px", border: "1px solid #ccc", borderRadius: 10, background: "white" }}
            >
              Save changes
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
