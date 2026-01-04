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

  value_per_unit: number; // cost per input unit
  baseline_input: number | null;
  baseline_output: number | null;
  tolerance_green: number;
  tolerance_yellow: number;
  baseline_locked: boolean;

  created_at?: string;
};

type Entry = {
  id: string;
  tracked_item_id: string;
  input_used: number;
  output_count: number;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

function toNumberOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  if (Number.isNaN(n)) return null;
  return n;
}

function computeExpectedOutput(
  item: TrackedItem,
  inputUsed: number
): number | null {
  if (item.baseline_input == null) return null;
  if (item.baseline_output == null) return null;
  if (item.baseline_input === 0) return null;
  return (inputUsed * item.baseline_output) / item.baseline_input;
}

function computeWasteCost(
  item: TrackedItem,
  expectedOutput: number,
  actualOutput: number
): number | null {
  if (item.baseline_input == null) return null;
  if (item.baseline_output == null) return null;
  if (item.baseline_output === 0) return null;

  const shortOutput = expectedOutput - actualOutput;
  if (shortOutput <= 0) return 0;

  const wastedInput = shortOutput * (item.baseline_input / item.baseline_output);
  return wastedInput * (item.value_per_unit ?? 0);
}

function classify(
  item: TrackedItem,
  expectedOutput: number,
  actualOutput: number
): { label: string; state: "green" | "yellow" | "red" } {
  if (expectedOutput <= 0) return { label: "Unknown", state: "yellow" };

  const short = expectedOutput - actualOutput;
  const lossPct = short / expectedOutput;

  const absLoss = Math.max(0, lossPct);

  if (absLoss <= (item.tolerance_green ?? 0.03)) {
    return { label: "Green", state: "green" };
  }
  if (absLoss <= (item.tolerance_yellow ?? 0.06)) {
    return { label: "Yellow", state: "yellow" };
  }
  return { label: "Red", state: "red" };
}

export default function LocationPage({ params }: { params: { id: string } }) {
  const [location, setLocation] = useState<Location | null>(null);
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  const [newItemName, setNewItemName] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newValue, setNewValue] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingUnit, setEditingUnit] = useState("");
  const [editingValue, setEditingValue] = useState("");

  const [baselineInput, setBaselineInput] = useState("");
  const [baselineOutput, setBaselineOutput] = useState("");
  const [tolGreen, setTolGreen] = useState("0.03");
  const [tolYellow, setTolYellow] = useState("0.06");

  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [entryPeriodLabelByItem, setEntryPeriodLabelByItem] = useState<Record<string, string>>({});
  const [entryStartByItem, setEntryStartByItem] = useState<Record<string, string>>({});
  const [entryEndByItem, setEntryEndByItem] = useState<Record<string, string>>({});
  const [entryInputByItem, setEntryInputByItem] = useState<Record<string, string>>({});
  const [entryOutputByItem, setEntryOutputByItem] = useState<Record<string, string>>({});
  const [addingEntryId, setAddingEntryId] = useState<string | null>(null);

  const entriesByItem = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    for (const e of entries) {
      if (!map[e.tracked_item_id]) map[e.tracked_item_id] = [];
      map[e.tracked_item_id].push(e);
    }
    return map;
  }, [entries]);

  const fetchData = async () => {
    const { data: locationData, error: locErr } = await supabase
      .from("locations")
      .select("id, name")
      .eq("id", params.id)
      .single();

    if (locErr) {
      setLocation(null);
      setItems([]);
      setEntries([]);
      setLoading(false);
      return;
    }

    const { data: itemsData } = await supabase
      .from("tracked_items")
      .select("*")
      .eq("location_id", params.id)
      .order("created_at", { ascending: false });

    const safeItems = (itemsData ?? []) as TrackedItem[];
    setItems(safeItems);

    if (safeItems.length > 0) {
      const ids = safeItems.map((x) => x.id);
      const { data: entriesData } = await supabase
        .from("daily_entries")
        .select("*")
        .in("tracked_item_id", ids)
        .order("created_at", { ascending: false });

      setEntries((entriesData ?? []) as Entry[]);
    } else {
      setEntries([]);
    }

    setLocation(locationData ?? null);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [params.id]);

  const addItem = async () => {
    const name = newItemName.trim();
    const unit = newUnit.trim();
    const value = Number(newValue);

    if (!name || !unit || Number.isNaN(value)) return;

    const { error } = await supabase.from("tracked_items").insert({
      location_id: params.id,
      name,
      unit,
      value_per_unit: value,
    });

    if (error) {
      window.alert("Add failed: " + error.message);
      return;
    }

    setNewItemName("");
    setNewUnit("");
    setNewValue("");
    fetchData();
  };

  const startEdit = (item: TrackedItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
    setEditingUnit(item.unit);
    setEditingValue(String(item.value_per_unit));

    setBaselineInput(item.baseline_input == null ? "" : String(item.baseline_input));
    setBaselineOutput(item.baseline_output == null ? "" : String(item.baseline_output));
    setTolGreen(String(item.tolerance_green ?? 0.03));
    setTolYellow(String(item.tolerance_yellow ?? 0.06));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingUnit("");
    setEditingValue("");
    setBaselineInput("");
    setBaselineOutput("");
    setTolGreen("0.03");
    setTolYellow("0.06");
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const name = editingName.trim();
    const unit = editingUnit.trim();
    const value = Number(editingValue);

    const bIn = baselineInput.trim() === "" ? null : Number(baselineInput);
    const bOut = baselineOutput.trim() === "" ? null : Number(baselineOutput);
    const tg = Number(tolGreen);
    const ty = Number(tolYellow);

    if (!name || !unit || Number.isNaN(value)) return;
    if (bIn !== null && Number.isNaN(bIn)) return;
    if (bOut !== null && Number.isNaN(bOut)) return;
    if (Number.isNaN(tg) || Number.isNaN(ty)) return;

    setSavingId(editingId);

    const { error } = await supabase
      .from("tracked_items")
      .update({
        name,
        unit,
        value_per_unit: value,
        baseline_input: bIn,
        baseline_output: bOut,
        tolerance_green: tg,
        tolerance_yellow: ty,
      })
      .eq("id", editingId);

    setSavingId(null);

    if (error) {
      window.alert("Save failed: " + error.message);
      return;
    }

    cancelEdit();
    fetchData();
  };

  const lockBaseline = async () => {
    if (!editingId) return;

    const bIn = Number(baselineInput);
    const bOut = Number(baselineOutput);

    if (Number.isNaN(bIn) || Number.isNaN(bOut)) return;

    setSavingId(editingId);

    const { error } = await supabase
      .from("tracked_items")
      .update({
        baseline_input: bIn,
        baseline_output: bOut,
        baseline_locked: true,
      })
      .eq("id", editingId);

    setSavingId(null);

    if (error) {
      window.alert("Lock failed: " + error.message);
      return;
    }

    fetchData();
  };

  const deleteItem = async (id: string) => {
    const ok = window.confirm("Delete this tracked item? This cannot be undone.");
    if (!ok) return;

    setDeletingId(id);

    const { error } = await supabase.from("tracked_items").delete().eq("id", id);

    setDeletingId(null);

    if (error) {
      window.alert("Delete failed: " + error.message);
      return;
    }

    if (editingId === id) cancelEdit();
    fetchData();
  };

  const addEntry = async (item: TrackedItem) => {
    const inputUsed = toNumberOrNull(entryInputByItem[item.id] ?? "");
    const outputCount = toNumberOrNull(entryOutputByItem[item.id] ?? "");

    if (inputUsed == null || outputCount == null) return;

    const periodLabel = (entryPeriodLabelByItem[item.id] ?? "").trim() || null;
    const periodStart = (entryStartByItem[item.id] ?? "").trim() || null;
    const periodEnd = (entryEndByItem[item.id] ?? "").trim() || null;

    setAddingEntryId(item.id);

    const { error } = await supabase.from("daily_entries").insert({
      tracked_item_id: item.id,
      input_used: inputUsed,
      output_count: outputCount,
      period_label: periodLabel,
      period_start: periodStart,
      period_end: periodEnd,
      entry_date: new Date().toISOString().slice(0, 10),
    });

    setAddingEntryId(null);

    if (error) {
      window.alert("Entry add failed: " + error.message);
      return;
    }

    setEntryInputByItem((p) => ({ ...p, [item.id]: "" }));
    setEntryOutputByItem((p) => ({ ...p, [item.id]: "" }));
    setEntryPeriodLabelByItem((p) => ({ ...p, [item.id]: "" }));
    setEntryStartByItem((p) => ({ ...p, [item.id]: "" }));
    setEntryEndByItem((p) => ({ ...p, [item.id]: "" }));

    fetchData();
  };

  return (
    <main className="p-6 max-w-4xl mx-auto">
      {loading && <p>Loading...</p>}

      {!loading && !location && <p>Location not found</p>}

      {!loading && location && (
        <>
          <h1 className="text-2xl font-bold mb-6">{location.name}</h1>

          <h2 className="text-xl font-semibold mb-2">Tracked Items</h2>

          <div className="grid grid-cols-4 gap-2 mb-4">
            <input
              className="border px-2 py-1 text-black bg-white"
              placeholder="Name"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
            />
            <input
              className="border px-2 py-1 text-black bg-white"
              placeholder="Unit"
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
            />
            <input
              className="border px-2 py-1 text-black bg-white"
              placeholder="Cost per input unit"
              type="number"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
            <button onClick={addItem} className="bg-black text-white px-3 py-1">
              Add
            </button>
          </div>

          {items.length === 0 && <p>No tracked items yet</p>}

          <ul className="space-y-3">
            {items.map((item) => {
              const isEditing = editingId === item.id;
              const isSaving = savingId === item.id;
              const isDeleting = deletingId === item.id;

              const hasBaseline =
                item.baseline_input != null &&
                item.baseline_output != null &&
                item.baseline_input !== 0 &&
                item.baseline_output !== 0;

              return (
                <li key={item.id} className="border rounded px-3 py-3">
                  {!isEditing && (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-semibold">
                          {item.name} ({item.unit})
                        </div>
                        <div className="text-sm opacity-70">
                          Cost per input unit: ${item.value_per_unit}
                        </div>
                        <div className="text-sm opacity-70">
                          Baseline:{" "}
                          {item.baseline_input != null && item.baseline_output != null
                            ? `${item.baseline_input} input → ${item.baseline_output} output`
                            : "Not set"}
                          {item.baseline_locked ? " (locked)" : ""}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          className="border rounded px-3 py-1"
                          onClick={() => startEdit(item)}
                        >
                          Edit
                        </button>
                        <button
                          className="border rounded px-3 py-1"
                          onClick={() => deleteItem(item.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  )}

                  {isEditing && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          className="border px-2 py-1 text-black bg-white"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          placeholder="Name"
                        />
                        <input
                          className="border px-2 py-1 text-black bg-white"
                          value={editingUnit}
                          onChange={(e) => setEditingUnit(e.target.value)}
                          placeholder="Unit"
                        />
                        <input
                          className="border px-2 py-1 text-black bg-white"
                          type="number"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          placeholder="Cost per input unit"
                        />
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        <input
                          className="border px-2 py-1 text-black bg-white"
                          type="number"
                          value={baselineInput}
                          onChange={(e) => setBaselineInput(e.target.value)}
                          placeholder="Baseline input"
                          disabled={items.find((x) => x.id === editingId)?.baseline_locked}
                        />
                        <input
                          className="border px-2 py-1 text-black bg-white"
                          type="number"
                          value={baselineOutput}
                          onChange={(e) => setBaselineOutput(e.target.value)}
                          placeholder="Baseline output"
                          disabled={items.find((x) => x.id === editingId)?.baseline_locked}
                        />
                        <input
                          className="border px-2 py-1 text-black bg-white"
                          type="number"
                          step="0.01"
                          value={tolGreen}
                          onChange={(e) => setTolGreen(e.target.value)}
                          placeholder="Tol green"
                        />
                        <input
                          className="border px-2 py-1 text-black bg-white"
                          type="number"
                          step="0.01"
                          value={tolYellow}
                          onChange={(e) => setTolYellow(e.target.value)}
                          placeholder="Tol yellow"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          className="bg-black text-white rounded px-3 py-1"
                          onClick={saveEdit}
                          disabled={isSaving}
                        >
                          {isSaving ? "Saving..." : "Save"}
                        </button>

                        <button
                          className="border rounded px-3 py-1"
                          onClick={() => {
                            cancelEdit();
                          }}
                          disabled={isSaving}
                        >
                          Cancel
                        </button>

                        <button
                          className="border rounded px-3 py-1"
                          onClick={lockBaseline}
                          disabled={
                            isSaving ||
                            items.find((x) => x.id === editingId)?.baseline_locked ||
                            !baselineInput.trim() ||
                            !baselineOutput.trim()
                          }
                        >
                          Lock baseline
                        </button>
                      </div>

                      <div className="text-sm opacity-70">
                        Baseline lock prevents editing baseline numbers (MVP behavior).
                      </div>
                    </div>
                  )}

                  {!isEditing && (
                    <div className="mt-4 border-t pt-4">
                      <div className="font-semibold mb-2">Entries</div>

                      {!hasBaseline && (
                        <div className="text-sm opacity-70">
                          Set baseline input and baseline output to enable expected output and variance.
                        </div>
                      )}

                      <div className="grid grid-cols-5 gap-2 mb-2">
                        <input
                          className="border px-2 py-1 text-black bg-white"
                          placeholder="Period label (optional)"
                          value={entryPeriodLabelByItem[item.id] ?? ""}
                          onChange={(e) =>
                            setEntryPeriodLabelByItem((p) => ({ ...p, [item.id]: e.target.value }))
                          }
                        />
                        <input
                          className="border px-2 py-1 text-black bg-white"
                          type="date"
                          value={entryStartByItem[item.id] ?? ""}
                          onChange={(e) =>
                            setEntryStartByItem((p) => ({ ...p, [item.id]: e.target.value }))
                          }
                        />
                        <input
                          className="border px-2 py-1 text-black bg-white"
                          type="date"
                          value={entryEndByItem[item.id] ?? ""}
                          onChange={(e) =>
                            setEntryEndByItem((p) => ({ ...p, [item.id]: e.target.value }))
                          }
                        />
                        <input
                          className="border px-2 py-1 text-black bg-white"
                          placeholder="Input used"
                          type="number"
                          value={entryInputByItem[item.id] ?? ""}
                          onChange={(e) =>
                            setEntryInputByItem((p) => ({ ...p, [item.id]: e.target.value }))
                          }
                        />
                        <input
                          className="border px-2 py-1 text-black bg-white"
                          placeholder="Output produced"
                          type="number"
                          value={entryOutputByItem[item.id] ?? ""}
                          onChange={(e) =>
                            setEntryOutputByItem((p) => ({ ...p, [item.id]: e.target.value }))
                          }
                        />
                      </div>

                      <button
                        className="bg-black text-white px-3 py-1 rounded"
                        onClick={() => addEntry(item)}
                        disabled={addingEntryId === item.id}
                      >
                        {addingEntryId === item.id ? "Adding..." : "Add entry"}
                      </button>

                      <div className="mt-3 space-y-2">
                        {(entriesByItem[item.id] ?? []).length === 0 && (
                          <div className="text-sm opacity-70">No entries yet</div>
                        )}

                        {(entriesByItem[item.id] ?? []).slice(0, 5).map((e) => {
                          const expected = computeExpectedOutput(item, e.input_used);
                          const status =
                            expected == null ? null : classify(item, expected, e.output_count);
                          const cost =
                            expected == null ? null : computeWasteCost(item, expected, e.output_count);

                          const stateText =
                            status == null ? "Baseline needed" : status.label;

                          return (
                            <div key={e.id} className="border rounded px-3 py-2">
                              <div className="text-sm opacity-80">
                                {e.period_label ? e.period_label : "Entry"}{" "}
                                {e.period_start || e.period_end
                                  ? `(${e.period_start ?? "?"} to ${e.period_end ?? "?"})`
                                  : ""}
                              </div>

                              <div className="text-sm">
                                Input used: {e.input_used}{" "}
                                {item.unit}{" "}
                                Output: {e.output_count}
                              </div>

                              <div className="text-sm">
                                Expected:{" "}
                                {expected == null ? "Unknown" : expected.toFixed(2)}
                                {" "}
                                Status: {stateText}
                                {" "}
                                Impact:{" "}
                                {cost == null ? "Unknown" : `$${cost.toFixed(2)}`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
