import { supabase } from "@/lib/supabaseClient";

export type Role = "employee" | "local_admin" | "regional_admin" | "master_admin";

export async function getMyRole(): Promise<Role | null> {
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) return null;

  const { data: prof, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !prof?.role) return null;

  return String(prof.role) as Role;
}

export function roleRank(role: Role): number {
  if (role === "employee") return 0;
  if (role === "local_admin") return 1;
  if (role === "regional_admin") return 2;
  return 3;
}

export function hasAtLeast(role: Role, minRole: Role): boolean {
  return roleRank(role) >= roleRank(minRole);
}
