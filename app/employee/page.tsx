"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Location = {
  id: string;
  name: string;
};

type TrackedItem = {
  id: string;
  name: string;
  unit: string;
  location_id: string;
  sub_label?: string | null;
};

type InsertedEntry = {
  id: string;
  created_at: string;
  is_altered?: boolean | null;
};

type Group = {
  name: string;
  unit: string;
  items: TrackedItem[];
};

function normLabel(s: string | null | undefined) {
  const t = (s ?? "").trim();
  return t ? t : "default";
}

export default function EmployeePage() {
  const [loading, setLoading] = useState(true);
  const [authText, setAuthText] = useState<string>("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [status, setStatus] = useState<string>("");

  const [inputUsed, setInputUsed] = useState<Record<string, string>>({});
  const [outputCount, setOutputCount] = useState<Record<string, string>>({});
  const [lastSaved, setLastSaved] = useState<Record<string, string>>({});

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === selectedLocationId) ?? null,
    [locations, selectedLocationId]
  );

  useEffect(() => {
    const boot = async () => {
      setLoading(true);

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) {
        setAuthText("Not signed in. Go to /login");
        setLoading(false);
        return;
      }

      setAuthText(`Signed in as ${userData.user.email}`);

      const { data: locs, error: locErr } = await supabase
        .from("locations")
        .select("id,name")
        .order("name");

      if (locErr) {
        setStatus(`Failed to load locations: ${locErr.message}`);
        setLoading(false);
        return;
      }

      const safeLocs = (locs ?? []) as Location[];
      setLocations(safeLocs);

      if (safeLocs.length > 0) {
        setSelectedLocationId(safeLocs[0].id);
      } else {
        setStatus("No assigned locations available for this user.");
      }

      setLoading(false);
    };

    boot();
  }, []);

  useEffect(() => {
    const loadItems = async () => {
      if (!selectedLocationId) {
        setItems([]);
        return;
      }

      setStatus("Loading tracked items...");

      const { data, error } = await supabase
        .from("tracked_items")
        .select("id,name,unit,location_id,sub_label")
        .eq("location_id", selectedLocationId)
        .order("name");

      if (error) {
        setStatus(`Failed to load tracked items: ${error.message}`);
        setItems([]);
        return;
      }

      setItems((data ?? []) as TrackedItem[]);
      setStatus("");
    };

    loadItems();
  }, [selectedLocationId]);

  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();

    for (const ti of items) {
      const key = ti.name.trim().toLowerCase();
      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          name: ti.name,
          unit: ti.unit,
          items: [ti],
        });
      } else {
        existing.items.push(ti);
      }
    }

    const arr = Array.from(map.values());

    for (const g of arr) {
      g.items.sort((a, b) =>
        normLabel(a.sub_label).localeCompare(normLabel(b.sub_label))
      );
    }

    arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [items]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const saveEntry = async (trackedItemId: string) => {
    const inStr = (inputUsed[trackedItemId] ?? "").trim();
    const outStr = (outputCount[trackedItemId] ?? "").trim();

    const inputNum = Number(inStr);
    const outputNum = Number(outStr);

    if (!Number.isFinite(inputNum) || inputNum < 0) {
      setStatus("Input used must be a valid number.");
      return;
    }

    if (!Number.isFinite(outputNum) || outputNum < 0) {
      setStatus("Output count must be a valid number.");
      return;
    }

    setStatus("Saving...");

    const { data, error } = await supabase
      .from("entries")
      .insert({
        tracked_item_id: trackedItemId,
        input_used: inputNum,
        output_count: outputNum,
      })
      .select("id,created_at,is_altered")
      .single<InsertedEntry>();

    if (error) {
      setStatus(`Save failed: ${error.message}`);
      return;
    }

    const altered = data?.is_altered === true;
    const msg = altered ? `Saved at ${data.created_at} ALTERED` : `Saved at ${data.created_at}`;

    setLastSaved((prev) => ({
      ...prev,
      [trackedItemId]: msg,
    }));

    setStatus("Saved.");
  };

  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Employee Input</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{authText}</div>
        </div>

        <button onClick={signOut} style={{ padding: "10px 14px" }}>
          Sign out
        </button>
      </div>

      <div style={{ marginTop: 18 }}>
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

      {status ? (
        <div style={{ marginTop: 14, fontSize: 12, opacity: 0.9 }}>{status}</div>
      ) : null}

      <div style={{ marginTop: 18, fontSize: 12, opacity: 0.8 }}>
        {selectedLocation ? `Tracked items for ${selectedLocation.name}` : ""}
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 14 }}>
        {groups.map((g) => (
          <div
            key={g.name}
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              padding: 14,
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800 }}>{g.name}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
              Unit: {g.unit}
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {g.items.map((ti) => (
                <div
                  key={ti.id}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10,
                    padding: 12,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    Sub label: {normLabel(ti.sub_label)}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      marginTop: 10,
                      alignItems: "flex-end",
                    }}
                  >
                    <div style={{ flex: "1 1 220px" }}>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>Input used</div>
                      <input
                        value={inputUsed[ti.id] ?? ""}
                        onChange={(e) =>
                          setInputUsed((prev) => ({ ...prev, [ti.id]: e.target.value }))
                        }
                        placeholder="0"
                        style={{ width: "100%", padding: 10, marginTop: 6 }}
                        inputMode="decimal"
                      />
                    </div>

                    <div style={{ flex: "1 1 220px" }}>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>Output count</div>
                      <input
                        value={outputCount[ti.id] ?? ""}
                        onChange={(e) =>
                          setOutputCount((prev) => ({ ...prev, [ti.id]: e.target.value }))
                        }
                        placeholder="0"
                        style={{ width: "100%", padding: 10, marginTop: 6 }}
                        inputMode="decimal"
                      />
                    </div>

                    <button
                      onClick={() => saveEntry(ti.id)}
                      style={{ padding: "10px 14px", minWidth: 120 }}
                    >
                      Save
                    </button>
                  </div>

                  {lastSaved[ti.id] ? (
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                      {lastSaved[ti.id]}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}

        {!loading && selectedLocationId && groups.length === 0 ? (
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
            No tracked items found for this location.
          </div>
        ) : null}
      </div>
    </div>
  );
}
