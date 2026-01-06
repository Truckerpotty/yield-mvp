"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Role = "employee" | "local_admin" | "regional_admin" | "master_admin";

type Profile = {
  id: string;
  role: Role | string;
  location_id?: string | null;
  region_id?: string | null;
};

type Location = { id: string; name: string; region_id?: string | null };
type Region = { id: string; name: string };

type UserRow = {
  id: string;
  email: string;
  role: string;
  location_id: string | null;
  region_id: string | null;
  created_at: string;
  is_active?: boolean | null;
};

function isAdminRole(role: string) {
  return role === "local_admin" || role === "regional_admin" || role === "master_admin";
}

function normalizeRole(role: unknown): string {
  return String(role || "").trim();
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return "";
  return data.session?.access_token || "";
}

export default function AdminUsersPage() {
  const [authText, setAuthText] = useState("");
  const [status, setStatus] = useState("");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [blocked, setBlocked] = useState(false);

  const [locations, setLocations] = useState<Location[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);

  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newRole, setNewRole] = useState<Exclude<Role, "master_admin">>("employee");
  const [newLocationId, setNewLocationId] = useState<string>("");
  const [newRegionId, setNewRegionId] = useState<string>("");

  const myRole = normalizeRole(profile?.role);
  const myLocationId = profile?.location_id ? String(profile.location_id) : "";
  const myRegionId = profile?.region_id ? String(profile.region_id) : "";

  const locationsById = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of locations) m.set(l.id, l.name);
    return m;
  }, [locations]);

  const regionsById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of regions) m.set(r.id, r.name);
    return m;
  }, [regions]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      return (
        (r.email || "").toLowerCase().includes(s) ||
        (r.role || "").toLowerCase().includes(s) ||
        (r.id || "").toLowerCase().includes(s)
      );
    });
  }, [rows, q]);

  const loadRows = async () => {
    setStatus("");
    setLoading(true);

    const token = await getAccessToken();
    if (!token) {
      setStatus("Not signed in.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/admin/users/list", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const j = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setRows([]);
      setStatus(j.error || "Load failed");
      return;
    }

    setRows((j.rows ?? []) as UserRow[]);
  };

  useEffect(() => {
    let alive = true;

    const boot = async () => {
      setStatus("");
      setBlocked(false);

      const { data } = await supabase.auth.getUser();
      if (!alive) return;

      if (!data?.user) {
        setAuthText("Not signed in. Go to /login");
        setBlocked(true);
        return;
      }

      setAuthText(`Signed in as ${data.user.email}`);

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id,role,location_id,region_id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!alive) return;

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

      if (!isAdminRole(normalizeRole(p.role))) {
        setStatus("Access denied. Admin only.");
        setBlocked(true);
        return;
      }

      const { data: locs, error: locErr } = await supabase
        .from("locations")
        .select("id,name,region_id")
        .order("name");

      if (!alive) return;

      if (locErr) {
        setStatus(`Could not load locations: ${locErr.message}`);
        setBlocked(true);
        return;
      }

      setLocations((locs ?? []) as Location[]);

      const { data: regs, error: regErr } = await supabase
        .from("regions")
        .select("id,name")
        .order("name");

      if (!alive) return;

      if (regErr) {
        setStatus(`Could not load regions: ${regErr.message}`);
        setBlocked(true);
        return;
      }

      setRegions((regs ?? []) as Region[]);

      const role = normalizeRole(p.role);

      if (role === "local_admin" && p.location_id) {
        setNewRole("employee");
        setNewLocationId(String(p.location_id));
        setNewRegionId("");
      }

      if (role === "regional_admin" && p.region_id) {
        setNewRegionId(String(p.region_id));
      }

      await loadRows();
    };

    boot();

    return () => {
      alive = false;
    };
  }, []);

  const roleOptionsForCreator = () => {
    if (myRole === "master_admin") return ["employee", "local_admin", "regional_admin"] as const;
    if (myRole === "regional_admin") return ["employee", "local_admin"] as const;
    return ["employee"] as const;
  };

  const locationsForCreator = useMemo(() => {
    if (myRole === "master_admin") return locations;

    if (myRole === "regional_admin") {
      if (!myRegionId) return [];
      return locations.filter((l) => String(l.region_id || "") === myRegionId);
    }

    if (myRole === "local_admin") {
      if (!myLocationId) return [];
      return locations.filter((l) => l.id === myLocationId);
    }

    return [];
  }, [locations, myRole, myRegionId, myLocationId]);

  const validateCreateInputs = () => {
    const e = email.trim().toLowerCase();
    const p = password;

    if (!e) return "Email is required.";
    if (!p || p.trim().length < 8) return "Password must be at least 8 characters.";

    if (newRole === "regional_admin") {
      if (myRole !== "master_admin") return "Only master admin can create regional admins.";
      if (!newRegionId) return "Region is required for regional admin.";
    }

    if (newRole === "employee" || newRole === "local_admin") {
      if (!newLocationId) return "Location is required for employee or local admin.";
    }

    if (myRole === "local_admin") {
      if (newRole !== "employee") return "Local admin can only create employees.";
      if (!myLocationId) return "Your profile is missing location_id.";
      if (newLocationId !== myLocationId) return "Local admin must assign their own location.";
    }

    if (myRole === "regional_admin") {
      if (!myRegionId) return "Your profile is missing region_id.";
      if (newRole === "regional_admin") return "Regional admin cannot create regional admins.";
      if (!newLocationId) return "Location is required.";
      const loc = locations.find((l) => l.id === newLocationId);
      if (!loc) return "Selected location not found.";
      if (String(loc.region_id || "") !== myRegionId) return "Location is not in your region.";
    }

    return "";
  };

  const createUser = async () => {
    setStatus("");

    if (blocked) {
      setStatus("Access denied.");
      return;
    }

    const msg = validateCreateInputs();
    if (msg) {
      setStatus(msg);
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      setStatus("Not signed in.");
      return;
    }

    const payload = {
      email: email.trim().toLowerCase(),
      password: password,
      role: newRole,
      location_id: newLocationId || null,
      region_id: newRegionId || null,
    };

    setStatus("Creating user...");

    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(j.error || "Create failed");
      return;
    }

    setStatus("Created user.");
    setEmail("");
    setPassword("");
    await loadRows();
  };

  const canDeleteRow = (row: UserRow) => {
    const rowRole = normalizeRole(row.role);
    if (myRole === "local_admin") return false;
    if (rowRole === "master_admin") return false;

    if (myRole === "regional_admin") {
      if (!myRegionId) return false;
      return String(row.region_id || "") === myRegionId;
    }

    return myRole === "master_admin";
  };

  const deleteUser = async (id: string, emailLabel: string, roleLabel: string, rowRegionId: string | null) => {
    setStatus("");

    if (blocked) {
      setStatus("Access denied.");
      return;
    }

    if (myRole === "local_admin") {
      setStatus("Local admin cannot delete users.");
      return;
    }

    if (normalizeRole(roleLabel) === "master_admin") {
      setStatus("Deleting master admin is not allowed in app.");
      return;
    }

    if (profile?.id && id === profile.id) {
      setStatus("You cannot delete your own account in app.");
      return;
    }

    if (myRole === "regional_admin") {
      if (!myRegionId) {
        setStatus("Your profile is missing region_id.");
        return;
      }
      if (String(rowRegionId || "") !== myRegionId) {
        setStatus("Regional admin can only delete users inside their region.");
        return;
      }
    }

    const ok = window.confirm(`Deactivate user ${emailLabel || id} ? This will disable access and preserve history.`);
    if (!ok) return;

    const token = await getAccessToken();
    if (!token) {
      setStatus("Not signed in.");
      return;
    }

    setStatus("Deactivating user...");

    const res = await fetch(`/api/admin/users/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(j.error || "Deactivate failed");
      return;
    }

    setStatus("User deactivated.");
    await loadRows();
  };

  if (blocked) {
    return (
      <div style={{ padding: 24, maxWidth: 1000 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Admin Users</div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{authText}</div>
        <div style={{ marginTop: 14, fontSize: 12, opacity: 0.9 }}>{status || "Blocked"}</div>
      </div>
    );
  }

  const regionDisabled = myRole !== "master_admin" || newRole !== "regional_admin";
  const locationDisabled = myRole === "local_admin" || newRole === "regional_admin";
  const canDelete = myRole !== "local_admin";

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Admin Users</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{authText}</div>
      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
        {profile ? `Role: ${normalizeRole(profile.role)}` : ""}
      </div>

      <div style={{ marginTop: 18, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Create user</div>

        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
          Master admin cannot be created in app. It must be assigned out of band by the developer.
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
              autoComplete="off"
              inputMode="email"
            />
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Temporary password</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", padding: 10, marginTop: 6 }}
              type="password"
              autoComplete="new-password"
            />
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Use at least 8 characters.</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px" }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Role</div>
              <select
                value={newRole}
                onChange={(e) => {
                  const v = e.target.value as Exclude<Role, "master_admin">;
                  setNewRole(v);

                  if (v === "regional_admin") {
                    setNewLocationId("");
                    if (myRole === "master_admin") {
                      if (!newRegionId && regions.length > 0) setNewRegionId(regions[0].id);
                    } else {
                      setNewRegionId(myRegionId || "");
                    }
                  } else {
                    if (myRole === "local_admin" && myLocationId) setNewLocationId(myLocationId);
                    if (myRole !== "master_admin") setNewRegionId(myRegionId || "");
                  }
                }}
                style={{ marginTop: 6, padding: 10, width: "100%" }}
              >
                {roleOptionsForCreator().map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                Local admin can only create employees. Regional admin can create employee and local admin. Master admin can create employee, local admin, regional admin.
              </div>
            </div>

            <div style={{ flex: "1 1 320px" }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Location</div>
              <select
                value={newLocationId}
                onChange={(e) => setNewLocationId(e.target.value)}
                style={{ marginTop: 6, padding: 10, width: "100%" }}
                disabled={locationDisabled}
              >
                <option value="">Select location</option>
                {locationsForCreator.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                Required for employee and local admin. Regional admin is scoped by region, not location.
              </div>
            </div>

            <div style={{ flex: "1 1 240px" }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Region</div>
              <select
                value={newRegionId}
                onChange={(e) => setNewRegionId(e.target.value)}
                style={{ marginTop: 6, padding: 10, width: "100%" }}
                disabled={regionDisabled}
              >
                <option value="">Select region</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                Required only for regional admin. Only master admin can choose it.
              </div>
            </div>
          </div>

          <div>
            <button onClick={createUser} style={{ padding: "10px 14px" }}>
              Create user
            </button>
          </div>

          {status ? <div style={{ fontSize: 12, opacity: 0.9 }}>{status}</div> : null}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Users in scope</div>
          <button onClick={loadRows} style={{ padding: "8px 12px" }}>
            Refresh
          </button>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email or role"
            style={{ padding: 10, minWidth: 260 }}
          />
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            {loading ? "Loading..." : `Showing ${filtered.length} of ${rows.length}`}
          </div>
        </div>

        <div style={{ marginTop: 10, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: canDelete ? "2fr 1fr 1fr 1fr 140px" : "2fr 1fr 1fr 1fr",
              gap: 10,
              padding: 10,
              fontSize: 12,
              fontWeight: 700,
              opacity: 0.9,
            }}
          >
            <div>Email</div>
            <div>Role</div>
            <div>Location</div>
            <div>Region</div>
            {canDelete ? <div>Actions</div> : null}
          </div>

          <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)" }} />

          {filtered.slice(0, 300).map((r) => {
            const loc = r.location_id ? locationsById.get(r.location_id) || r.location_id : "";
            const reg = r.region_id ? regionsById.get(r.region_id) || r.region_id : "";
            const allowDelete = canDeleteRow(r);

            return (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: canDelete ? "2fr 1fr 1fr 1fr 140px" : "2fr 1fr 1fr 1fr",
                  gap: 10,
                  padding: 10,
                  fontSize: 12,
                  borderTop: "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <div style={{ fontWeight: 600 }}>{r.email || r.id}</div>
                <div>{normalizeRole(r.role)}</div>
                <div>{loc}</div>
                <div>{reg}</div>
                {canDelete ? (
                  <div>
                    <button
                      onClick={() => deleteUser(r.id, r.email, r.role, r.region_id)}
                      disabled={!allowDelete}
                      style={{ padding: "6px 10px", opacity: allowDelete ? 1 : 0.5 }}
                      title={allowDelete ? "Deactivate user" : "Not allowed"}
                    >
                      Deactivate
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
          Local admin cannot deactivate users. Regional admin can deactivate only inside their region. Master admin can deactivate any non master admin.
        </div>
      </div>
    </div>
  );
}
