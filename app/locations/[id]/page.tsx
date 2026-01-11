"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LocationPage() {
  const params = useParams();
  const locationId = params?.id as string;

  const [location, setLocation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("id", locationId)
        .maybeSingle();

      if (!error) setLocation(data);
      setLoading(false);
    }
    load();
  }, [locationId]);

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  if (!location)
    return <div style={{ padding: 24 }}>Location not found.</div>;

  return (
    <main style={{ padding: 24 }}>
      <h1>Location: {location.name}</h1>
      <p>ID: {location.id}</p>
    </main>
  );
}
