import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "employee" | "local_admin" | "regional_admin" | "master_admin";

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export async function GET(req: Request) {
  try {
    const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearer(req);
    if (!token) {
      return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
    }

    const admin = createClient(url, service, { auth: { persistSession: false } });

    const authed = await admin.auth.getUser(token);
    const user = authed.data.user;
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: me, error: meErr } = await admin
      .from("profiles")
      .select("id,role,location_id,region_id")
      .eq("id", user.id)
      .maybeSingle();

    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
    if (!me) return NextResponse.json({ error: "No profile for requester" }, { status: 403 });

    const myRole = String(me.role || "") as Role;
    const isAdmin =
      myRole === "local_admin" || myRole === "regional_admin" || myRole === "master_admin";
    if (!isAdmin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    let allowedLocationIds: string[] | null = null;

    if (myRole === "local_admin") {
      if (!me.location_id) {
        return NextResponse.json({ error: "Requester missing location_id" }, { status: 400 });
      }
    }

    if (myRole === "regional_admin") {
      if (!me.region_id) {
        return NextResponse.json({ error: "Requester missing region_id" }, { status: 400 });
      }

      const { data: locs, error: locErr } = await admin
        .from("locations")
        .select("id")
        .eq("region_id", me.region_id);

      if (locErr) return NextResponse.json({ error: locErr.message }, { status: 400 });

      allowedLocationIds = (locs ?? []).map((x: any) => x.id).filter(Boolean);
    }

    let q = admin
      .from("profiles")
      .select("id,role,location_id,region_id,created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (myRole === "local_admin") {
      q = q.eq("location_id", me.location_id);
    } else if (myRole === "regional_admin") {
      const regionId = String(me.region_id || "");
      if (!regionId) {
        return NextResponse.json({ error: "Requester missing region_id" }, { status: 400 });
      }

      const locIds = allowedLocationIds ?? [];
      if (locIds.length > 0) {
        q = q.or(`region_id.eq.${regionId},location_id.in.(${locIds.join(",")})`);
      } else {
        q = q.eq("region_id", regionId);
      }
    }

    const { data: profRows, error: profErr } = await q;
    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 400 });

    const ids = (profRows ?? []).map((r: any) => r.id).filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ rows: [] });
    }

    const { data: empRows, error: empErr } = await admin
      .from("employees")
      .select("id,email,is_active")
      .in("id", ids)
      .eq("is_active", true);

    if (empErr) return NextResponse.json({ error: empErr.message }, { status: 400 });

    const emailById: Record<string, string> = {};
    const activeSet = new Set<string>();

    for (const e of empRows ?? []) {
      if (e?.id) {
        activeSet.add(String(e.id));
        emailById[String(e.id)] = String(e.email || "");
      }
    }

    const rows = (profRows ?? [])
      .filter((r: any) => activeSet.has(String(r.id)))
      .map((r: any) => ({
        id: r.id,
        email: emailById[r.id] || "",
        role: r.role,
        location_id: r.location_id,
        region_id: r.region_id,
        created_at: r.created_at,
      }));

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
