"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function run() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        router.replace("/login?next=" + encodeURIComponent(pathname || "/employee"));
        return;
      }

      if (mounted) setReady(true);
    }

    run();

    return () => {
      mounted = false;
    };
  }, [router, pathname]);

  if (!ready) return null;
  return <>{children}</>;
}
