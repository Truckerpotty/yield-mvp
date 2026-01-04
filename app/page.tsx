"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Location = {
  id: string;
  name: string;
  created_at: string;
};

export default function Home() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchLocations = async () => {
    const { data } = await supabase
      .from("locations")
      .select("*")
      .order("created_at", { ascending: false });

    setLocations(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const addLocation = async () => {
    const name = newName.trim();
    if (!name) return;

    setCreating(true);
    await supabase.from("locations").insert({ name });
    setNewName("");
    setCreating(false);
    fetchLocations();
  };

  const startEdit = (loc: Location) => {
    setEditingId(loc.id);
    setEditingName(loc.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) return;

    setSavingId(editingId);
    await supabase.from("locations").update({ name }).eq("id", editingId);
    setSavingId(null);
    cancelEdit();
    fetchLocations();
  };

  const deleteLocation = async (id: string) => {
    const ok = window.confirm("Delete this location? This cannot be undone.");
    if (!ok) return;

    setDeletingId(id);
    await supabase.from("locations").delete().eq("id", id);
    setDeletingId(null);

    if (editingId === id) cancelEdit();
    fetchLocations();
  };

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Locations</h1>

      <div className="flex gap-2 mb-6">
        <input
          className="border rounded px-3 py-2 flex-1 text-black bg-white"
          placeholder="Location name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button
          onClick={addLocation}
          disabled={creating}
          className="bg-black text-white px-4 py-2 rounded"
        >
          {creating ? "Saving..." : "Add"}
        </button>
      </div>

      {loading && <p>Loading...</p>}

      {!loading && locations.length === 0 && <p>No locations yet</p>}

      <ul className="space-y-2">
        {locations.map((loc) => {
          const isEditing = editingId === loc.id;
          const isSaving = savingId === loc.id;
          const isDeleting = deletingId === loc.id;

          return (
            <li key={loc.id} className="border rounded px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  {!isEditing && (
                    <Link href={`/locations/${loc.id}`} className="underline">
                      {loc.name}
                    </Link>
                  )}

                  {isEditing && (
                    <input
                      className="border rounded px-2 py-1 w-full text-black bg-white"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                    />
                  )}
                </div>

                {!isEditing && (
                  <div className="flex gap-2">
                    <button
                      className="border rounded px-3 py-1"
                      onClick={() => startEdit(loc)}
                    >
                      Rename
                    </button>
                    <button
                      className="border rounded px-3 py-1"
                      onClick={() => deleteLocation(loc.id)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                )}

                {isEditing && (
                  <div className="flex gap-2">
                    <button
                      className="bg-black text-white rounded px-3 py-1"
                      onClick={saveEdit}
                      disabled={isSaving}
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      className="border rounded px-3 py-1"
                      onClick={cancelEdit}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
