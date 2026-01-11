"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Role = "employee" | "local_admin" | "regional_admin" | "master_admin";

type Profile = {
  id: string;
  role: Role | string;
  location_id: string | null;
  region_id: string | null;
};

type Location = {
  id: string;
  name: string;
  region_id: string | null;
};

type VehicleType = {
  id: string;
  name: string;
};

type VehicleUnit = {
  id: string;
  name: string;
  operational_status: string;
  status_note: string | null;
  status_changed_at: string;
};

function roleRank(role: string) {
  if (role === "employee") return 0;
  if (role === "local_admin") return 1;
  if (role === "regional_admin") return 2;
  if (role === "master_admin") return 3;
  return 0;
}

function isAdmin(role: string) {
  return role === "local_admin" || role === "regional_admin" || role === "master_admin";
}

export default function AdminVehiclesPage() {
  const router = useRouter();

  const [authText, setAuthText] = useState("");
  const [status, setStatus] = useState("");

  const [profile, setProfile] = useState<Profile | null>(null);

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");

  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [vehicleTypeId, setVehicleTypeId] = useState("");

  const [vehicleUnits, setVehicleUnits] = useState<VehicleUnit[]>([]);
  const [loading, setLoading] = useState(false);

  const [newTypeName, setNewTypeName] = useState("Delivery Van");
  const [creatingUnit, setCreatingUnit] = useState(false);

  const myRole = String(profile?.role || "");
  const myLocationId = profile?.location_id ? String(profile.location_id) : "";
  const myRegionId = profile?.region_id ? String(profile.region_id) : "";

  const isMaster = myRole === "master_admin";
  const canRegional = roleRank(myRole) >= roleRank("regional_admin");

  const locationsInScope = useMemo(() => {
    if (!profile) return [];
    if (isMaster) return locations;
    if (myRole === "regional_admin") return locations.filter((l) => String(l.region_id || "") === myRegionId);
    if (myRole === "local_admin") return locations.filter((l) => l.id === myLocationId);
    return [];
  }, [locations, profile, isMaster, myRole, myRegionId, myLocationId]);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setStatus("");

      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        if (!cancelled) router.replace("/login?next=" + encodeURIComponent("/admin/vehicles"));
        return;
      }

      if (!cancelled) setAuthText(`Signed in as ${data.user.email || data.user.id}`);

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id,role,location_id,region_id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profErr || !prof) {
        if (!cancelled) setStatus(profErr?.message || "Could not load profile");
        return;
      }

      const p = prof as Profile;

      if (!isAdmin(String(p.role || ""))) {
        if (!cancelled) router.replace("/employee");
        return;
      }

      if (!cancelled) setProfile(p);

      const { data: locs, error: locErr } = await supabase
        .from("locations")
        .select("id,name,region_id")
        .eq("kind", "site")
        .eq("active", true)
        .order("name");

      if (locErr) {
        if (!cancelled) setStatus(locErr.message);
        return;
      }

      const allLocs = (locs ?? []) as Location[];
      if (!cancelled) setLocations(allLocs);

      let defaultLocationId = "";

      if (String(p.role) === "master_admin") defaultLocationId = allLocs[0]?.id || "";
      if (String(p.role) === "regional_admin") defaultLocationId = allLocs.find((l) => String(l.region_id || "") === String(p.region_id || ""))?.id || "";
      if (String(p.role) === "local_admin") defaultLocationId = String(p.location_id || "");

      if (!cancelled) setLocationId(defaultLocationId);
    }

    boot();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!locationId) return;

    async function loadTypes() {
      setStatus("");

      const { data, error } = await supabase
        .from("locations")
        .select("id,name")
        .eq("parent_id", locationId)
        .eq("kind", "vehicle_type")
        .eq("active", true)
        .order("name");

      if (error) {
        setVehicleTypes([]);
        setStatus(error.message);
        return;
      }

      const list = (data ?? []) as VehicleType[];
      setVehicleTypes(list);
      setVehicleTypeId(list[0]?.id || "");
    }

    loadTypes();
  }, [locationId]);

  useEffect(() => {
    if (!vehicleTypeId) {
      setVehicleUnits([]);
      return;
    }

    async function loadUnits() {
      setLoading(true);
      setStatus("");

      const { data, error } = await supabase
        .from("locations")
        .select("id,name,operational_status,status_note,status_changed_at")
        .eq("parent_id", vehicleTypeId)
        .eq("kind", "vehicle_unit")
        .eq("active", true)
        .order("sequence_number", { ascending: true });

      setLoading(false);

      if (error) {
        setVehicleUnits([]);
        setStatus(error.message);
        return;
      }

      setVehicleUnits((data ?? []) as VehicleUnit[]);
    }

    loadUnits();
  }, [vehicleTypeId]);

  async function createNextUnit() {
    setStatus("");

    if (!locationId) {
      setStatus("Select a location");
      return;
    }

    const nm = newTypeName.trim();
    if (!nm) {
      setStatus("Vehicle type name is required");
      return;
    }

    setCreatingUnit(true);

    const { data, error } = await supabase.rpc("create_next_vehicle_unit", {
      site_id: locationId,
      vehicle_type_name: nm,
    });

    setCreatingUnit(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Vehicle unit created");

    const createdId = String(data || "");

    const { data: types } = await supabase
      .from("locations")
      .select("id,name")
      .eq("parent_id", locationId)
      .eq("kind", "vehicle_type")
      .eq("active", true)
      .order("name");

    const list = (types ?? []) as VehicleType[];
    setVehicleTypes(list);

    const typeRow = list.find((t) => t.name.toLowerCase() === nm.toLowerCase()) || list[0];
    setVehicleTypeId(typeRow?.id || "");

    if (createdId && typeRow?.id) {
      const { data: units } = await supabase
        .from("locations")
        .select("id,name,operational_status,status_note,status_changed_at")
        .eq("parent_id", typeRow.id)
        .eq("kind", "vehicle_unit")
        .eq("active", true)
        .order("sequence_number", { ascending: true });

      setVehicleUnits((units ?? []) as VehicleUnit[]);
    }
  }

  async function setStatusForUnit(unitId: string, nextStatus: string) {
    setStatus("");

    if (!canRegional) {
      setStatus("Only regional admin and master admin can change vehicle status");
      return;
    }

    const note = window.prompt("Optional note for this status change") || "";

    const { data: u } = await supabase.auth.getUser();
    const actorId = u.user?.id;
    if (!actorId) {
      setStatus("Not authenticated");
      return;
    }

    const { error } = await supabase.rpc("set_vehicle_unit_status", {
      vehicle_unit_id: unitId,
      new_status: nextStatus,
      note,
      actor_id: actorId,
    });

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus("Updated vehicle status");

    const { data } = await supabase
      .from("locations")
      .select("id,name,operational_status,status_note,status_changed_at")
      .eq("parent_id", vehicleTypeId)
      .eq("kind", "vehicle_unit")
      .eq("active", true)
      .order("sequence_number", { ascending: true });

    setVehicleUnits((data ?? []) as VehicleUnit[]);
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ fontSize: 20, fontWeight: 700 }}>Vehicles</div>
      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>{authText}</div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Location</div>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            disabled={myRole === "local_admin"}
            style={{ marginTop: 6, padding: 10, width: "100%" }}
          >
            {locationsInScope.length === 0 ? <option value="">No locations in scope</option> : null}
            {locationsInScope.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Create vehicle unit</div>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <input
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              style={{ padding: 10 }}
              placeholder="Example Delivery Van"
            />
            <button onClick={createNextUnit} disabled={creatingUnit}>
              {creatingUnit ? "Creating" : "Create next numbered unit"}
            </button>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              This will create Delivery Van 1, Delivery Van 2, and so on under the selected location.
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Vehicle type</div>
          <select
            value={vehicleTypeId}
            onChange={(e) => setVehicleTypeId(e.target.value)}
            style={{ marginTop: 6, padding: 10, width: "100%" }}
          >
            {vehicleTypes.length === 0 ? <option value="">No vehicle types</option> : null}
            {vehicleTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: 12, fontSize: 12, fontWeight: 700, background: "rgba(0,0,0,0.03)" }}>
            {loading ? "Loading" : "Vehicle units"}
          </div>

          {vehicleUnits.length === 0 ? (
            <div style={{ padding: 12, fontSize: 12, opacity: 0.8 }}>No units</div>
          ) : null}

          {vehicleUnits.map((u) => (
            <div key={u.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)", padding: 12, fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{u.name}</div>
                  <div style={{ opacity: 0.8, marginTop: 4 }}>
                    Status {u.operational_status}
                    {u.status_note ? `  Note ${u.status_note}` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setStatusForUnit(u.id, "in_service")}
                    disabled={!canRegional}
                    style={{ padding: "8px 10px" }}
                  >
                    In service
                  </button>
                  <button
                    onClick={() => setStatusForUnit(u.id, "out_of_commission")}
                    disabled={!canRegional}
                    style={{ padding: "8px 10px" }}
                  >
                    Out of commission
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {status ? <div style={{ fontSize: 12, opacity: 0.9 }}>{status}</div> : null}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
        When a unit is marked out of commission, an alert is created and higher admins can clear it in Alerts.
      </div>
    </div>
  );
}
