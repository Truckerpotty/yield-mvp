"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Role = "employee" | "local_admin" | "regional_admin" | "master_admin";

type Tab = {
  label: string;
  href: string;
  active: (path: string) => boolean;
};

export default function BottomTabsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session ?? null;

      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (cancelled) return;

      if (error) {
        setRole("employee");
        setLoading(false);
        return;
      }

      setRole((profile?.role as Role) ?? "employee");
      setLoading(false);
    }

    loadRole();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading || !role) {
    return <div />;
  }

  const tabs = getTabsForRole(role);

  return (
    <>
      <main style={{ paddingBottom: 64 }}>{children}</main>

      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 64,
          display: "flex",
          borderTop: "1px solid #e5e5e5",
          background: "#ffffff",
        }}
      >
        {tabs.map((tab) => {
          const active = tab.active(pathname);

          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              style={{
                flex: 1,
                border: "none",
                background: "none",
                fontSize: 12,
                color: active ? "#000000" : "#9ca3af",
              }}
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}

function getTabsForRole(role: Role): Tab[] {
  if (role === "employee") {
    return [
      { label: "Home", href: "/employee", active: (p) => p === "/employee" },
      { label: "Log", href: "/employee/daily", active: (p) => p.startsWith("/employee/daily") },
      { label: "Alerts", href: "/employee/alerts", active: (p) => p.startsWith("/employee/alerts") },
      { label: "Settings", href: "/employee/settings", active: (p) => p.startsWith("/employee/settings") },
    ];
  }

  if (role === "local_admin") {
    return [
      { label: "Log", href: "/employee/daily", active: (p) => p.startsWith("/employee/daily") },
      { label: "Items", href: "/admin/tracked-items", active: (p) => p.startsWith("/admin/tracked-items") },
      { label: "Training", href: "/admin/training", active: (p) => p.startsWith("/admin/training") },
      { label: "Calibration", href: "/admin/calibration", active: (p) => p.startsWith("/admin/calibration") },
      { label: "Alerts", href: "/admin/alerts", active: (p) => p.startsWith("/admin/alerts") },
    ];
  }

  return [
    { label: "Items", href: "/admin/tracked-items", active: (p) => p.startsWith("/admin/tracked-items") },
    { label: "Training", href: "/admin/training", active: (p) => p.startsWith("/admin/training") },
    { label: "Calibration", href: "/admin/calibration", active: (p) => p.startsWith("/admin/calibration") },
    { label: "Users", href: "/admin/users", active: (p) => p.startsWith("/admin/users") },
    { label: "Audit", href: "/admin/audit", active: (p) => p.startsWith("/admin/audit") },
  ];
}
