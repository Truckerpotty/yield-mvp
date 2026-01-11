import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "employee" | "local_admin" | "regional_admin" | "master_admin";

type Body = {
  email: string;
  password: string;
  role?: Role;
  location_id: string;
  sublocation_id?: string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function writeAudit(
  serviceClient: any,
  payload: {
    actor_user_id: string | null;
    actor_role: string | null;
    action: string;
    target_user_id: string | null;
    location_id: string | null;
    sublocation_id: string | null;
    ok: boolean;
    error_text: string | null;
    metadata: any;
  }
) {
  await serviceClient.from("audit_log").insert({
    actor_user_id: payload.actor_user_id,
    actor_role: payload.actor_role,
    action: payload.action,
    target_user_id: payload.target_user_id,
    location_id: payload.location_id,
    sublocation_id: payload.sublocation_id,
    ok: payload.ok,
    error_text: payload.error_text,
    metadata: payload.metadata ?? {},
  });
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) return jsonError("Missing authorization token", 401);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anon || !service) {
      return jsonError("Server env missing Supabase keys", 500);
    }

    const callerClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const {
      data: { user: callerUser },
      error: callerErr,
    } = await callerClient.auth.getUser();

    if (callerErr || !callerUser) return jsonError("Invalid session", 401);

    const { data: callerProfile, error: callerProfileErr } = await callerClient
      .from("profiles")
      .select("role, location_id")
      .eq("id", callerUser.id)
      .single();

    if (callerProfileErr || !callerProfile) {
      return jsonError("Caller profile not found", 403);
    }

    const callerRole = (callerProfile.role || "employee") as Role;

    if (
      callerRole !== "local_admin" &&
      callerRole !== "regional_admin" &&
      callerRole !== "master_admin"
    ) {
      return jsonError("Not authorized", 403);
    }

    const body = (await req.json()) as Body;

    const email = (body.email || "").trim().toLowerCase();
    const password = (body.password || "").trim();
    const role: Role = (body.role || "employee") as Role;
    const locationId = (body.location_id || "").trim();
    const sublocationIdRaw = body.sublocation_id ? String(body.sublocation_id).trim() : "";
    const sublocationId = sublocationIdRaw ? sublocationIdRaw : null;

    if (!email) return jsonError("Email required", 400);
    if (!password || password.length < 8) return jsonError("Password min 8", 400);
    if (!locationId) return jsonError("Location required", 400);

    if (role !== "employee") {
      return jsonError("Only employee creation allowed here", 400);
    }

    if (callerRole === "local_admin") {
      if (!callerProfile.location_id) {
        return jsonError("Local admin missing location assignment", 403);
      }
      if (callerProfile.location_id !== locationId) {
        return jsonError("Local admin can only assign within their location", 403);
      }
    }

    const serviceClient = createClient(url, service, {
      auth: { persistSession: false },
    });

    const auditBase = {
      actor_user_id: callerUser.id,
      actor_role: callerRole,
      action: "create_employee",
      target_user_id: null as string | null,
      location_id: locationId,
      sublocation_id: sublocationId,
      ok: false,
      error_text: null as string | null,
      metadata: { email },
    };

    const { data: created, error: createErr } =
      await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createErr || !created.user) {
      await writeAudit(serviceClient, {
        ...auditBase,
        ok: false,
        error_text: createErr?.message || "User create failed",
      });
      return jsonError(createErr?.message || "User create failed", 400);
    }

    const newUserId = created.user.id;
    auditBase.target_user_id = newUserId;

    const profilePayload: Record<string, any> = {
      id: newUserId,
      role: "employee",
      location_id: locationId,
      sublocation_id: sublocationId,
      created_by: callerUser.id,
      created_by_role: callerRole,
    };

    const { error: upsertErr } = await serviceClient
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });

    if (upsertErr) {
      await writeAudit(serviceClient, {
        ...auditBase,
        ok: false,
        error_text: upsertErr.message,
      });
      return jsonError(upsertErr.message, 400);
    }

    await writeAudit(serviceClient, {
      ...auditBase,
      ok: true,
      error_text: null,
    });

    return NextResponse.json({
      ok: true,
      user_id: newUserId,
      email,
    });
  } catch (e: any) {
    return jsonError(e?.message || "Unexpected error", 500);
  }
}
