"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import SafeDate from "@/lib/SafeDate";

type Role = "employee" | "local_admin" | "regional_admin" | "master_admin";

type AlertRow = {
  id: string;
  created_at: string;

  severity: string;
  category: string;
  status: string;

  message: string;
  metadata: any;

  location_id: string | null;
  vehicle_unit_id: string | null;
  employee_id: string | null;

  acknowledged_at: string | null;
  acknowledged_by: string | null;
  acknowledged_note: string | null;
};

function isHigherRole(role: string) {
  return role === "regional_admin" || role === "master_admin";
}

function shortId(id: string | null) {
  if (!id) return "";
  if (id.length <= 12) return id;
  return id.slice(0, 8) + "…" + id.slice(-4);
}

export default function AdminAlertsPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [role, setRole] = useState<Role>("employee");
  const [authText, setAuthText] = useState("");
  const [statusText, setStatusText] = useState("");

  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [tab, setTab] = useState<"open" | "acknowledged">("open");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");

  const [ackId, setAckId] = useState<string | null>(null);
  const [ackNote, setAckNote] = useState("");
  const [acking, setAcking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setStatusText("");
      const { data } = await supabase.auth.getUser();

      if (!data?.user) {
        if (!cancelled) router.replace("/login?next=" + encodeURIComponent("/admin/alerts"));
        return;
      }

      if (!cancelled) setAuthText(`Signed in as ${data.user.email || data.user.id}`);

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profErr || !prof) {
        if (!cancelled) {
          setStatusText(profErr?.message || "Could not load profile");
          router.replace("/login");
        }
        return;
      }

      const r = String((prof as any).role || "employee") as Role;

      if (r === "employee") {
        if (!cancelled) router.replace("/employee");
        return;
      }

      if (!cancelled) {
        setRole(r);
        setReady(true);
      }
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function loadAlerts(nextTab: "open" | "acknowledged", nextCategory: string, nextQ: string) {
    setStatusText("");
    setLoading(true);

    const wantStatus = nextTab === "open" ? "open" : "acknowledged";

    let query = supabase
      .from("alerts")
      .select(
        "id,created_at,severity,category,status,message,metadata,location_id,vehicle_unit_id,employee_id,acknowledged_at,acknowledged_by,acknowledged_note"
      )
      .eq("status", wantStatus)
      .order("created_at", { ascending: false })
      .limit(200);

    const c = nextCategory.trim();
    if (c) query = query.eq("category", c);

    const { data, error } = await query;

    setLoading(false);

    if (error) {
      setRows([]);
      setStatusText(error.message);
      return;
    }

    const all = (data ?? []) as AlertRow[];

    const s = nextQ.trim().toLowerCase();
    if (!s) {
      setRows(all);
      return;
    }

    setRows(
      all.filter((a) => {
        const m = (a.message || "").toLowerCase();
        const cat2 = (a.category || "").toLowerCase();
        const sev = (a.severity || "").toLowerCase();
        const id = (a.id || "").toLowerCase();
        return m.includes(s) || cat2.includes(s) || sev.includes(s) || id.includes(s);
      })
    );
  }

  useEffect(() => {
    if (!ready) return;
    loadAlerts(tab, category, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const canSeeBoard = useMemo(() => isHigherRole(role), [role]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.category) set.add(r.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  async function acknowledge(id: string) {
    setStatusText("");

    if (!canSeeBoard) {
      setStatusText("Access denied");
      return;
    }

    setAcking(true);

    const { error } = await supabase.rpc("acknowledge_alert", {
      alert_id: id,
      note: ackNote || null,
    });

    setAcking(false);

    if (error) {
      setStatusText(error.message);
      return;
    }

    setAckId(null);
    setAckNote("");
    await loadAlerts(tab, category, q);
  }

  if (!ready) return null;

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Alerts</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{authText}</div>
      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>Role: {role}</div>

      {!canSeeBoard ? (
        <div style={{ marginTop: 18, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Message board</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8 }}>
            This message board is available to regional admin and master admin.
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              setTab("open");
              loadAlerts("open", category, q);
            }}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              background: tab === "open" ? "#000000" : "#ffffff",
              color: tab === "open" ? "#ffffff" : "#111827",
              fontSize: 12,
            }}
          >
            Open
          </button>

          <button
            type="button"
            onClick={() => {
              setTab("acknowledged");
              loadAlerts("acknowledged", category, q);
            }}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.15)",
              background: tab === "acknowledged" ? "#000000" : "#ffffff",
              color: tab === "acknowledged" ? "#ffffff" : "#111827",
              fontSize: 12,
            }}
          >
            Acknowledged
          </button>
        </div>

        <div style={{ flex: "1 1 280px" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Search</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search message, category, severity, id"
            style={{ marginTop: 6, padding: 10, width: "100%", maxWidth: 520 }}
          />
        </div>

        <div style={{ flex: "1 1 240px" }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Category</div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ marginTop: 6, padding: 10, width: "100%", maxWidth: 320 }}
          >
            <option value="">All</option>
            {uniqueCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => loadAlerts(tab, category, q)}
          style={{ padding: "10px 14px", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, background: "#fff" }}
        >
          Refresh
        </button>
      </div>

      {statusText ? <div style={{ marginTop: 12, fontSize: 12, opacity: 0.9 }}>{statusText}</div> : null}

      <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.7fr 0.9fr 3fr 1fr", gap: 0 }}>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Created</div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Severity</div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Category</div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Message</div>
          <div style={{ padding: 10, fontSize: 12, fontWeight: 800, borderBottom: "1px solid #ddd" }}>Action</div>

          {rows.map((r) => (
            <React.Fragment key={r.id}>
              <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                <SafeDate value={r.created_at} />
                <div style={{ opacity: 0.7, marginTop: 4 }}>{shortId(r.id)}</div>
              </div>

              <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>{r.severity}</div>

              <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>{r.category}</div>

              <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                <div style={{ fontWeight: 700 }}>{r.message}</div>
                <div style={{ opacity: 0.75, marginTop: 6 }}>
                  Location {shortId(r.location_id)} Vehicle {shortId(r.vehicle_unit_id)} Employee {shortId(r.employee_id)}
                </div>

                {r.acknowledged_at ? (
                  <div style={{ opacity: 0.75, marginTop: 6 }}>
                    Acknowledged <SafeDate value={r.acknowledged_at} /> by {shortId(r.acknowledged_by)}
                    {r.acknowledged_note ? <div style={{ marginTop: 4 }}>Note: {r.acknowledged_note}</div> : null}
                  </div>
                ) : null}
              </div>

              <div style={{ padding: 10, borderBottom: "1px solid #eee", fontSize: 12 }}>
                {!canSeeBoard ? (
                  <span style={{ opacity: 0.7 }}>None</span>
                ) : r.status === "open" ? (
                  ackId === r.id ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <input
                        value={ackNote}
                        onChange={(e) => setAckNote(e.target.value)}
                        placeholder="Optional note"
                        style={{ padding: 8, width: "100%" }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          disabled={acking}
                          onClick={() => acknowledge(r.id)}
                          style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 10, background: "#fff" }}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAckId(null);
                            setAckNote("");
                          }}
                          style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 10, background: "#fff" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAckId(r.id);
                        setAckNote("");
                      }}
                      style={{ padding: "8px 10px", border: "1px solid #ccc", borderRadius: 10, background: "#fff" }}
                    >
                      Acknowledge
                    </button>
                  )
                ) : (
                  <span style={{ opacity: 0.7 }}>Done</span>
                )}
              </div>
            </React.Fragment>
          ))}

          {rows.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, opacity: 0.8, gridColumn: "1 / -1" }}>
              {loading ? "Loading..." : "No alerts found."}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
