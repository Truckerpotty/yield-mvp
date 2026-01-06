"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Role = "employee" | "local_admin" | "regional_admin" | "master_admin";

type Profile = {
  id: string;
  role: string;
};

function isAdminRole(role: string) {
  return role === "local_admin" || role === "regional_admin" || role === "master_admin";
}

export default function LoginPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string>("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [status, setStatus] = useState("");

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      setStatus("");
      setLoading(true);

      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error) {
        setSessionEmail("");
        setLoading(false);
        return;
      }

      const sess = data.session;
      if (!sess?.user) {
        setSessionEmail("");
        setLoading(false);
        return;
      }

      setSessionEmail(sess.user.email || "");

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id,role")
        .eq("id", sess.user.id)
        .maybeSingle();

      if (profErr) {
        setStatus(`Could not load profile: ${profErr.message}`);
        setLoading(false);
        return;
      }

      if (!prof) {
        setStatus("No profile found for this user.");
        setLoading(false);
        return;
      }

      const role = String((prof as Profile).role || "") as Role;

      if (isAdminRole(role)) {
        router.replace("/admin/users");
        return;
      }

      router.replace("/employee");
    };

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (!session?.user) {
        setSessionEmail("");
        setLoading(false);
        return;
      }

      setSessionEmail(session.user.email || "");
      void (async () => {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id,role")
          .eq("id", session.user.id)
          .maybeSingle();

        const role = String((prof as Profile | null)?.role || "") as Role;

        if (isAdminRole(role)) {
          router.replace("/admin/users");
          return;
        }

        router.replace("/employee");
      })();
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [router]);

  const signIn = async () => {
    setStatus("");

    const e = email.trim().toLowerCase();
    const p = password;

    if (!e) {
      setStatus("Email is required.");
      return;
    }

    if (!p) {
      setStatus("Password is required.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: e,
      password: p,
    });

    if (error) {
      setStatus(error.message);
      setLoading(false);
      return;
    }

    setStatus("Signed in.");
  };

  const signOut = async () => {
    setStatus("");
    setLoading(true);
    await supabase.auth.signOut();
    setEmail("");
    setPassword("");
    setSessionEmail("");
    setLoading(false);
  };

  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 520 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Login</div>
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>Loading</div>
      </div>
    );
  }

  if (sessionEmail) {
    return (
      <div style={{ padding: 24, maxWidth: 520 }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Login</div>
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
          Signed in as {sessionEmail}
        </div>

        <div style={{ marginTop: 14 }}>
          <button onClick={signOut} style={{ padding: "10px 14px" }}>
            Sign out
          </button>
        </div>

        {status ? <div style={{ marginTop: 12, fontSize: 12 }}>{status}</div> : null}
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 520 }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Login</div>

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            autoComplete="email"
          />
        </div>

        <div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Password</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            type="password"
            autoComplete="current-password"
          />
        </div>

        <div>
          <button onClick={signIn} style={{ padding: "10px 14px" }}>
            Sign in
          </button>
        </div>

        {status ? <div style={{ fontSize: 12, opacity: 0.9 }}>{status}</div> : null}
      </div>
    </div>
  );
}
