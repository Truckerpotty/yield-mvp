"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function RlsTestPage() {
  const [who, setWho] = useState<string>("checking...");

  useEffect(() => {
    const run = async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      console.log("AUTH GETUSER", { authData, authError });

      const uid = authData?.user?.id ?? null;
      const email = authData?.user?.email ?? null;

      setWho(uid ? `signed in as ${email} uid ${uid}` : "NOT signed in");

      const { data, error, status } = await supabase
        .from("locations")
        .select("id,name")
        .order("name");

      console.log("RLS TEST RESULT", { uid, email, status, data, error });
    };

    run();
  }, []);

  return <div style={{ padding: 24 }}>{who}</div>;
}

