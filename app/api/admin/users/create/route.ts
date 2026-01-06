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

function isValidRole(r: string): r is Role {
  return r === "employee" || r === "local_admin" || r === "regional_admin" || r === "master_admin";
}

export async function POST(req: Request) {
  try {
    const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
    const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearer(req);
    if (!token) return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });

    const admin = createClient(url, service, { auth: { persistSession: false } });

    const authed = await admin.auth.getUser(token);
    const requester = authed.data.user;
    if (!requester) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "").trim();
    const role = String(body.role || "employee").trim();
    const location_id = body.location_id ? String(body.location_id) : null;
    const region_id = body.region_id ? String(body.region_id) : null;

    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password required, 8 chars minimum" }, { status: 400 });
    }
    if (!isValidRole(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

    if (role === "master_admin") {
      return NextResponse.json(
        { error: "Creating master admin is not allowed in app. Assign master admin out of band." },
        { status: 403 }
      );
    }

    const { data: me, error: meErr } = await admin
      .from("profiles")
      .select("id,role,location_id,region_id")
      .eq("id", requester.id)
      .maybeSingle();

    if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
    if (!me) return NextResponse.json({ error: "No profile for requester" }, { status: 403 });

    const myRole = String(me.role || "") as Role;

    const isAdmin =
      myRole === "local_admin" || myRole === "regional_admin" || myRole === "master_admin";
    if (!isAdmin) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    if (myRole === "local_admin") {
      if (role !== "employee") {
        return NextResponse.json({ error: "Local admin can only create employees" }, { status: 403 });
      }
      if (!me.location_id) {
        return NextResponse.json({ error: "Requester missing location_id" }, { status: 400 });
      }
      if (!location_id || location_id !== me.location_id) {
        return NextResponse.json({ error: "Local admin must assign their own location" }, { status: 403 });
      }
    }

    if (myRole === "regional_admin") {
      if (role === "regional_admin") {
        return NextResponse.json({ error: "Regional admin cannot create regional admins" }, { status: 403 });
      }
      if (!me.region_id) {
        return NextResponse.json({ error: "Requester missing region_id" }, { status: 400 });
      }
      if (!location_id) {
        return NextResponse.json({ error: "Location required for this role" }, { status: 400 });
      }

      const { data: loc, error: locErr } = await admin
        .from("locations")
        .select("id,region_id")
        .eq("id", location_id)
        .maybeSingle();

      if (locErr) return NextResponse.json({ error: locErr.message }, { status: 400 });
      if (!loc) return NextResponse.json({ error: "Location not found" }, { status: 400 });

      if (String(loc.region_id || "") !== String(me.region_id)) {
        return NextResponse.json({ error: "Location not in your region" }, { status: 403 });
      }
    }

    if (myRole === "master_admin") {
      if (role === "employee" || role === "local_admin") {
        if (!location_id) {
          return NextResponse.json(
            { error: "Location required for employee or local admin" },
            { status: 400 }
          );
        }
      }
      if (role === "regional_admin") {
        if (!region_id) {
          return NextResponse.json({ error: "Region required for regional admin" }, { status: 400 });
        }
      }
    }

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 400 });

    const newUser = created.data.user;
    if (!newUser?.id) return NextResponse.json({ error: "Create failed" }, { status: 400 });

    let finalRegionId: string | null = region_id;

    if (!finalRegionId && location_id) {
      const { data: loc } = await admin
        .from("locations")
        .select("region_id")
        .eq("id", location_id)
        .maybeSingle();

      finalRegionId = loc?.region_id ? String(loc.region_id) : null;
    }

    await admin
      .from("profiles")
      .upsert(
        {
          id: newUser.id,
          role,
          location_id: location_id || null,
          region_id: finalRegionId || null,
        },
        { onConflict: "id" }
      );

    return NextResponse.json({ ok: true, id: newUser.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
