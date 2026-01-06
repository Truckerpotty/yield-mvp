import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7);
  return "";
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    const admin = adminClient();

    const { data: userData, error: userErr } =
      await admin.auth.getUser(token);

    if (userErr || !userData?.user?.id) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const callerId = userData.user.id;

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();

    if (profileErr) {
      return NextResponse.json(
        { error: profileErr.message },
        { status: 500 }
      );
    }

    if (profile?.role !== "master_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: deactivateErr } = await admin
      .from("employees")
      .update({ is_active: false })
      .eq("id", id);

    if (deactivateErr) {
      return NextResponse.json(
        { error: deactivateErr.message },
        { status: 400 }
      );
    }

    await admin
      .from("employee_location_assignments")
      .delete()
      .eq("employee_id", id);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
