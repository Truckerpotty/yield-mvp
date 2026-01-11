"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Location = {
  id: string;
  name: string;
  parent_id: string | null;
  kind: string;
  active: boolean;
};

type Role = "employee" | "local_admin" | "regional_admin" | "master_admin";

export default function CreateEmployeeSection() {
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role>("employee");
  const [callerLocationId, setCallerLocationId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [sublocationId, setSublocationId] = useState("");

  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, location_id")
        .eq("id", session.user.id)
        .single();

      const r = (profile?.role || "employee") as Role;
      setRole(r);
      setCallerLocationId(profile?.location_id ?? null);

      if (r === "employee") {
        setReady(true);
        return;
      }

      const { data: locs } = await supabase
        .from("locations")
        .select("id, name, parent_id, kind, active")
        .eq("active", true)
        .order("name");

      setLocations((locs || []) as Location[]);

      if (r === "local_admin" && profile?.location_id) {
        setLocationId(profile.location_id);
      }

      setReady(true);
    }

    load();
  }, []);

  const topLevelSites = useMemo(() => {
    return locations.filter((l) => !l.parent_id && l.kind === "site");
  }, [locations]);

  const sublocationsForSelected = useMemo(() => {
    if (!locationId) return [];
    return locations.filter(
      (l) => l.parent_id === locationId && l.kind === "vehicle"
    );
  }, [locations, locationId]);

  if (!ready) return null;
  if (role === "employee") return null;

  async function onCreate() {
    setStatus("");

    if (!email.trim()) {
      setStatus("Email required");
      return;
    }

    if (password.trim().length < 8) {
      setStatus("Password min 8");
      return;
    }

    if (!locationId) {
      setStatus("Location required");
      return;
    }

    setSubmitting(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const token = session?.access_token || "";

    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password: password.trim(),
        role: "employee",
        location_id: locationId,
        sublocation_id: sublocationId || null,
      }),
    });

    const json = await res.json().catch(() => null);
    setSubmitting(false);

    if (!res.ok || !json?.ok) {
      setStatus(json?.error || "Create failed");
      return;
    }

    setStatus(`Created ${json.email}`);
    setEmail("");
    setPassword("");
    setSublocationId("");
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #e5e5e5", borderRadius: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Team</div>

      <input
        placeholder="Employee email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        placeholder="Temporary password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <select
        value={locationId}
        onChange={(e) => {
          setLocationId(e.target.value);
          setSublocationId("");
        }}
        disabled={role === "local_admin"}
      >
        <option value="">Select location</option>
        {topLevelSites.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>

      <select
        value={sublocationId}
        onChange={(e) => setSublocationId(e.target.value)}
        disabled={!locationId}
      >
        <option value="">Optional sub location</option>
        {sublocationsForSelected.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>

      <button onClick={onCreate} disabled={submitting}>
        {submitting ? "Creating" : "Create employee"}
      </button>

      {status && <div>{status}</div>}
    </section>
  );
}
