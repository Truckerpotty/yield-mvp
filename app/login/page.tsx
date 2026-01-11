"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;

        if (data?.session) {
          router.replace("/employee");
          return;
        }
      } catch (e: any) {
        if (!cancelled) {
          setErrorText(e?.message || "Unable to load auth session.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setErrorText("");
    setSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setErrorText(error.message || "Login failed.");
        return;
      }

      router.replace("/employee");
    } catch (err: any) {
      setErrorText(err?.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ marginBottom: 8 }}>Login</h1>
        <div>Loading</div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1 style={{ marginBottom: 12 }}>Login</h1>

      {errorText ? (
        <div style={{ marginBottom: 12, color: "salmon" }}>{errorText}</div>
      ) : null}

      <form onSubmit={signIn}>
        <label style={{ display: "block", marginBottom: 6 }}>Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          style={{ width: "100%", padding: 10, marginBottom: 12 }}
          required
        />

        <label style={{ display: "block", marginBottom: 6 }}>Password</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          style={{ width: "100%", padding: 10, marginBottom: 12 }}
          required
        />

        <button
          type="submit"
          disabled={submitting}
          style={{ padding: "10px 14px", cursor: "pointer" }}
        >
          {submitting ? "Signing in" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
