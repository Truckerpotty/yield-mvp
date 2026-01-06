"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Profile = {
  id: string;
  role: "employee" | "local_admin" | "regional_admin" | "master_admin" | string;
};

type Location = { id: string; name: string };

type AuditRow = {
  id: string;
  tracked_item_id: string | null;
  location_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE" | string;
  changed_by: string | null;
  changed_by_role: string | null;
  changed_at: string;
  old_row: any | null;
  new_row: any | null;
};

function fmtIso(s: string) {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function jsonPretty(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function AdminAuditPage() {
  const [authText, setAuthText] = useState("");
  const [status, setStatus] = useState("");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [blocked, setBlocked] = useState(false);

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string>("");

  const [action, setAction] = useState<string>("ALL");
  const [query, setQuery] = useState<string>("");

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [limit, setLimit] = useState<number>(50);
  const [showRowId, setShowRowId] = useState<string>("");

  const locationsById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of locations) m.set(l.id, l.name);
    return m;
  }, [locations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const a = (r.action ?? "").toLowerCase();
      const b = (r.changed_by_role ?? "").toLowerCase();
      const c = (r.changed_by ?? "").toLowerCase();
      const d = (r.location_id ?? "").toLowerCase();
      const e = (r.tracked_item_id ?? "").toLowerCase();
      return a.includes(q) || b.includes(q) || c.includes(q) || d.includes(q) || e.includes(q);
    });
  }, [rows, query]);

  useEffect(() => {
    const boot = async () => {
      setStatus("");
      setBlocked(false);

      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        setAuthText("Not signed in. Go to /login");
        setBlocked(true);
        return;
      }

      setAuthText(`Signed in as ${data.user.email}`);

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id,role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profErr) {
        setStatus(`Could not load profile: ${profErr.message}`);
        setBlocked(true);
        return;
      }

      if (!prof) {
        setStatus("No profile row found for this user.");
        setBlocked(true);
        return;
      }

      const p = prof as Profile;
      setProfile(p);

      if (String(p.role) !== "master_admin") {
        setStatus("Access denied. Master admin only.");
        setBlocked(true);
        return;
      }

      const { data: locs, error: locErr } = await supabase
        .from("locations")
        .select("id,name")
        .order("name");

      if (locErr) {
        setStatus(`Failed to load locations: ${locErr.message}`);
        return;
      }

      setLocations((locs ?? []) as Location[]);
    };

    boot();
  }, []);

  const load = async () => {
    setStatus("");
    setLoading(true);

    let q = supabase
      .from("tracked_items_audit")
      .select(
        "id,tracked_item_id,location_id,action,changed_by,changed_by_role,changed_at,old_row,new_row"
      )
      .order("changed_at", { ascending: false })
      .limit(limit);

    if (locationId) q = q.eq("location_id", locationId);
    if (action !== "ALL") q = q.eq("action", action);

    const { data, error } = await q;

    setLoading(false);

    if (error) {
      setStatus(`Load failed: ${error.message}`);
      setRows([]);
      return;
    }

    setRows((data ?? []) as AuditRow[]);
  };

  useEffect(() => {
    if (blocked) return;
    if (!profile) return;
    if (String(profile.role) !== "master_admin") return;
    load();
  }, [blocked, profile, locationId, action, limit]);

  if (blocked) {
    return (
      <div style={{ padding: 24, maxWidth: 1100 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Admin Audit</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{authText}</div>
        <div style={{ marginTop: 14, fontSize: 12, opacity: 0.9 }}>{status || "Blocked"}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Admin Audit</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{authText}</div>
      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
        {profile ? `Role: ${String(profile.role)}` : ""}
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 260, flex: "1 1 260px" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Location filter</div>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            style={{ marginTop: 6, padding: 10, width: "100%" }}
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ minWidth: 200, flex: "0 1 200px" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Action</div>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            style={{ marginTop: 6, padding: 10, width: "100%" }}
          >
            <option value="ALL">ALL</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>

        <div style={{ minWidth: 160, flex: "0 1 160px" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Rows</div>
          <select
            value={String(limit)}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ marginTop: 6, padding: 10, width: "100%" }}
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="250">250</option>
          </select>
        </div>

        <div style={{ minWidth: 260, flex: "1 1 260px" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Search</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter within loaded rows"
            style={{ marginTop: 6, padding: 10, width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "end" }}>
          <button onClick={load} style={{ padding: "10px 14px" }}>
            Refresh
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.85 }}>
        {loading ? "Loading..." : `Showing ${filtered.length} of ${rows.length}`}
      </div>

      {status ? (
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>{status}</div>
      ) : null}

      <div style={{ marginTop: 12, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "160px 90px 220px 1fr 90px",
            gap: 10,
            padding: 10,
            fontSize: 12,
            fontWeight: 700,
            opacity: 0.9,
          }}
        >
          <div>When</div>
          <div>Action</div>
          <div>Location</div>
          <div>Who</div>
          <div>Details</div>
        </div>

        <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)" }} />

        {filtered.map((r) => {
          const locName = r.location_id ? locationsById.get(r.location_id) || r.location_id : "";
          const who = `${r.changed_by_role || ""} ${r.changed_by || ""}`.trim();
          const open = showRowId === r.id;

          return (
            <div key={r.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "160px 90px 220px 1fr 90px",
                  gap: 10,
                  padding: 10,
                  fontSize: 12,
                  alignItems: "center",
                }}
              >
                <div>{fmtIso(r.changed_at)}</div>
                <div style={{ fontWeight: 700 }}>{r.action}</div>
                <div>{locName}</div>
                <div style={{ opacity: 0.9 }}>{who}</div>
                <div>
                  <button
                    onClick={() => setShowRowId(open ? "" : r.id)}
                    style={{ padding: "6px 10px" }}
                  >
                    {open ? "Hide" : "View"}
                  </button>
                </div>
              </div>

              {open ? (
                <div style={{ padding: 10, paddingTop: 0 }}>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Audit id: {r.id}
                    <br />
                    Tracked item id: {r.tracked_item_id || ""}
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 8 }}>
                      <div style={{ padding: 10, fontSize: 12, fontWeight: 700 }}>Old</div>
                      <pre style={{ margin: 0, padding: 10, fontSize: 12, overflowX: "auto" }}>
                        {r.old_row ? jsonPretty(r.old_row) : ""}
                      </pre>
                    </div>

                    <div style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 8 }}>
                      <div style={{ padding: 10, fontSize: 12, fontWeight: 700 }}>New</div>
                      <pre style={{ margin: 0, padding: 10, fontSize: 12, overflowX: "auto" }}>
                        {r.new_row ? jsonPretty(r.new_row) : ""}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7 }}>
        Note: This page is master admin only. RLS enforces it on the audit table.
      </div>
    </div>
  );
}
