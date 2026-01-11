"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Location = {
  id: string;
  name: string;
};

export default function CreateEmployeeSection() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");

  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadLocations() {
      const { data, error } = await supabase
        .from("locations")
        .select("id,name")
        .order("name");

      if (!error) {
        setLocations((data ?? []) as Location[]);
      }
    }

    loadLocations();
  }, []);

  async function createEmployee() {
    setStatus("");

    if (!email.trim() || !password.trim()) {
      setStatus("Email and password are required");
      return;
    }

    if (!locationId) {
      setStatus("Select a location");
      return;
    }

    setCreating(true);

    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    if (!token) {
      setCreating(false);
      setStatus("Not authenticated");
      return;
    }

    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
        role: "employee",
        location_id: locationId,
      }),
    });

    setCreating(false);

    if (!res.ok) {
      const txt = await res.text();
      setStatus(txt || "Failed to create employee");
      return;
    }

    setEmail("");
    setPassword("");
    setLocationId("");
    setStatus("Employee created");
  }

  return (
    <div style={{ marginTop: 18, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>Create employee</div>

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <input
          placeholder="Employee email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10 }}
        />

        <input
          placeholder="Temporary password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: 10 }}
        />

        <select
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          style={{ padding: 10 }}
        >
          <option value="">Select location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        <button onClick={createEmployee} disabled={creating}>
          {creating ? "Creating" : "Create employee"}
        </button>

        {status ? <div style={{ fontSize: 12 }}>{status}</div> : null}
      </div>
    </div>
  );
}
