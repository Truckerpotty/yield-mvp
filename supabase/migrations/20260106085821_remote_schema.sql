


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_repack" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "address_standardizer" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "autoinc" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_jsonschema" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "plpgsql_check" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."audit_tracked_items_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid uuid;
  v_role text;
begin
  v_uid := auth.uid();
  v_role := public.current_role();

  if tg_op = 'INSERT' then
    insert into public.tracked_items_audit (
      tracked_item_id,
      location_id,
      action,
      changed_by,
      changed_by_role,
      changed_at,
      old_row,
      new_row
    ) values (
      new.id,
      new.location_id,
      'INSERT',
      v_uid,
      v_role,
      now(),
      null,
      to_jsonb(new)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    insert into public.tracked_items_audit (
      tracked_item_id,
      location_id,
      action,
      changed_by,
      changed_by_role,
      changed_at,
      old_row,
      new_row
    ) values (
      new.id,
      new.location_id,
      'UPDATE',
      v_uid,
      v_role,
      now(),
      to_jsonb(old),
      to_jsonb(new)
    );
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.tracked_items_audit (
      tracked_item_id,
      location_id,
      action,
      changed_by,
      changed_by_role,
      changed_at,
      old_row,
      new_row
    ) values (
      old.id,
      old.location_id,
      'DELETE',
      v_uid,
      v_role,
      now(),
      to_jsonb(old),
      null
    );
    return old;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."audit_tracked_items_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_location_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select (select location_id from public.profiles where id = auth.uid());
$$;


ALTER FUNCTION "public"."current_location_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_region_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select (select region_id from public.profiles where id = auth.uid());
$$;


ALTER FUNCTION "public"."current_region_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'employee');
$$;


ALTER FUNCTION "public"."current_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.employees (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name',''))
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'employee')
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_active_assignment"("loc" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.location_assignments la
    where la.user_id = auth.uid()
      and la.location_id = loc
      and la.revoked_at is null
  )
$$;


ALTER FUNCTION "public"."has_active_assignment"("loc" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.employee_location_assignments ela
    where ela.employee_id = public.request_uid()
      and ela.role in ('admin_master','admin_regional','admin_local')
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_privileged"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce(public.current_role() in ('lead','manager','regional','admin','master_admin'), false)
$$;


ALTER FUNCTION "public"."is_privileged"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_uid"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;


ALTER FUNCTION "public"."request_uid"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_daily_entry_derived_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  ti_location uuid;
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  select t.location_id into ti_location
  from public.tracked_items t
  where t.id = new.tracked_item_id;

  if ti_location is null then
    raise exception 'tracked_item_id not found or has no location';
  end if;

  new.location_id := ti_location;

  if new.entry_date is null then
    new.entry_date := (now() at time zone 'utc')::date;
  end if;

  return new;
end $$;


ALTER FUNCTION "public"."set_daily_entry_derived_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_entry_altered_flag"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  prior_id uuid;
  prior_employee_id uuid;
begin
  prior_id := null;
  prior_employee_id := null;

  select e.id, e.employee_id
    into prior_id, prior_employee_id
  from public.entries e
  where e.tracked_item_id = new.tracked_item_id
    and e.location_id = new.location_id
    and e.entry_date = new.entry_date
  order by e.created_at desc
  limit 1;

  if prior_id is not null then
    new.is_altered := true;
    new.altered_from_entry_id := prior_id;
    new.altered_at := now();

    if new.employee_id is not null
       and prior_employee_id is not null
       and new.employee_id <> prior_employee_id then
      new.altered_by_other_employee := true;
    else
      new.altered_by_other_employee := false;
    end if;
  else
    new.is_altered := false;
    new.altered_from_entry_id := null;
    new.altered_at := null;
    new.altered_by_other_employee := false;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_entry_altered_flag"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_entry_creator"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_entry_creator"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tp_has_assignment"("loc_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.employee_location_assignments ela
    where ela.employee_id = auth.uid()
      and ela.location_id = loc_id
  );
$$;


ALTER FUNCTION "public"."tp_has_assignment"("loc_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tp_is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.employee_location_assignments ela
    where ela.employee_id = auth.uid()
      and ela.role in ('admin_master','admin_regional','admin_local')
  );
$$;


ALTER FUNCTION "public"."tp_is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tp_request_uid"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;


ALTER FUNCTION "public"."tp_request_uid"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tracked_items_set_norm_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.name_norm := lower(trim(new.name));

  new.sub_label_norm := case
    when new.sub_label is null then ''
    when trim(new.sub_label) = '' then ''
    else lower(trim(new.sub_label))
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."tracked_items_set_norm_fields"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."employee_location_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_location_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tracked_item_id" "uuid" NOT NULL,
    "entry_date" "date" NOT NULL,
    "input_used" numeric NOT NULL,
    "output_count" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "period_label" "text",
    "period_start" "date",
    "period_end" "date",
    "created_by" "uuid",
    "location_id" "uuid",
    "employee_id" "uuid",
    "entry_mode" "text" DEFAULT 'ops'::"text" NOT NULL,
    "source_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "confidence" numeric DEFAULT 0.5 NOT NULL,
    "notes" "text",
    "is_altered" boolean DEFAULT false NOT NULL,
    "altered_from_entry_id" "uuid",
    "altered_at" timestamp with time zone,
    "altered_by_other_employee" boolean DEFAULT false NOT NULL,
    CONSTRAINT "entries_entry_mode_check" CHECK (("entry_mode" = ANY (ARRAY['ops'::"text", 'training'::"text", 'verification'::"text"]))),
    CONSTRAINT "entries_source_type_check" CHECK (("source_type" = ANY (ARRAY['manual'::"text", 'pos'::"text", 'weight'::"text", 'count'::"text", 'sensor'::"text", 'estimate'::"text"])))
);


ALTER TABLE "public"."entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracked_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "value_per_unit" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "baseline_input" numeric,
    "baseline_output" numeric,
    "tolerance_green" numeric DEFAULT 0.03 NOT NULL,
    "tolerance_yellow" numeric DEFAULT 0.06 NOT NULL,
    "baseline_locked" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "baseline_set_by" "uuid",
    "baseline_set_at" timestamp with time zone,
    "sub_label" "text",
    "name_norm" "text" NOT NULL,
    "sub_label_norm" "text" NOT NULL
);


ALTER TABLE "public"."tracked_items" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."entry_status" AS
 SELECT "e"."id",
    "e"."tracked_item_id",
    "e"."entry_date",
    "e"."input_used",
    "e"."output_count",
    "e"."created_at",
    "e"."period_label",
    "e"."period_start",
    "e"."period_end",
    "e"."created_by",
    "e"."location_id",
    "e"."employee_id",
    "e"."entry_mode",
    "e"."source_type",
    "e"."confidence",
    "e"."notes",
    "ti"."location_id" AS "tracked_item_location_id",
    "ti"."unit",
    "ti"."value_per_unit",
    "ti"."baseline_input",
    "ti"."baseline_output",
    "ti"."tolerance_green",
    "ti"."tolerance_yellow",
        CASE
            WHEN ("e"."entry_mode" = 'training'::"text") THEN 'white'::"text"
            WHEN (("ti"."baseline_input" IS NULL) OR ("ti"."baseline_output" IS NULL)) THEN 'white'::"text"
            WHEN (("e"."input_used" IS NULL) OR ("e"."input_used" = (0)::numeric)) THEN 'white'::"text"
            ELSE
            CASE
                WHEN ("abs"(((("e"."output_count" / NULLIF("e"."input_used", (0)::numeric)) - ("ti"."baseline_output" / NULLIF("ti"."baseline_input", (0)::numeric))) / NULLIF(("ti"."baseline_output" / NULLIF("ti"."baseline_input", (0)::numeric)), (0)::numeric))) <= ("ti"."tolerance_green" / 100.0)) THEN 'green'::"text"
                WHEN ("abs"(((("e"."output_count" / NULLIF("e"."input_used", (0)::numeric)) - ("ti"."baseline_output" / NULLIF("ti"."baseline_input", (0)::numeric))) / NULLIF(("ti"."baseline_output" / NULLIF("ti"."baseline_input", (0)::numeric)), (0)::numeric))) <= ("ti"."tolerance_yellow" / 100.0)) THEN 'yellow'::"text"
                ELSE 'red'::"text"
            END
        END AS "status_color"
   FROM ("public"."entries" "e"
     JOIN "public"."tracked_items" "ti" ON (("ti"."id" = "e"."tracked_item_id")));


ALTER VIEW "public"."entry_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "assigned_by" "uuid" NOT NULL,
    "assigned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "note" "text"
);


ALTER TABLE "public"."location_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "region_id" "uuid"
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "location_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "region_id" "uuid",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['employee'::"text", 'local_admin'::"text", 'regional_admin'::"text", 'master_admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."regions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."regions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tracked_items_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tracked_item_id" "uuid",
    "location_id" "uuid",
    "action" "text" NOT NULL,
    "changed_by" "uuid",
    "changed_by_role" "text",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "old_row" "jsonb",
    "new_row" "jsonb",
    CONSTRAINT "tracked_items_audit_action_check" CHECK (("action" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text", 'DELETE'::"text"])))
);


ALTER TABLE "public"."tracked_items_audit" OWNER TO "postgres";


ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "daily_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_location_assignments"
    ADD CONSTRAINT "employee_location_assignments_employee_id_location_id_role_key" UNIQUE ("employee_id", "location_id", "role");



ALTER TABLE ONLY "public"."employee_location_assignments"
    ADD CONSTRAINT "employee_location_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_assignments"
    ADD CONSTRAINT "location_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."regions"
    ADD CONSTRAINT "regions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."regions"
    ADD CONSTRAINT "regions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracked_items_audit"
    ADD CONSTRAINT "tracked_items_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tracked_items"
    ADD CONSTRAINT "tracked_items_pkey" PRIMARY KEY ("id");



CREATE INDEX "entries_altered_by_other_employee_idx" ON "public"."entries" USING "btree" ("altered_by_other_employee");



CREATE INDEX "entries_altered_from_entry_id_idx" ON "public"."entries" USING "btree" ("altered_from_entry_id");



CREATE INDEX "entries_created_at_idx" ON "public"."entries" USING "btree" ("created_at");



CREATE INDEX "entries_created_by_idx" ON "public"."entries" USING "btree" ("created_by");



CREATE INDEX "entries_is_altered_idx" ON "public"."entries" USING "btree" ("is_altered");



CREATE INDEX "entries_location_id_idx" ON "public"."entries" USING "btree" ("location_id");



CREATE INDEX "idx_ela_employee_location" ON "public"."employee_location_assignments" USING "btree" ("employee_id", "location_id");



CREATE INDEX "idx_entries_tracked_item" ON "public"."entries" USING "btree" ("tracked_item_id");



CREATE INDEX "idx_tracked_items_location" ON "public"."tracked_items" USING "btree" ("location_id");



CREATE INDEX "location_assignments_active_idx" ON "public"."location_assignments" USING "btree" ("user_id", "location_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "location_assignments_location_id_idx" ON "public"."location_assignments" USING "btree" ("location_id");



CREATE INDEX "location_assignments_user_id_idx" ON "public"."location_assignments" USING "btree" ("user_id");



CREATE INDEX "locations_region_id_idx" ON "public"."locations" USING "btree" ("region_id");



CREATE INDEX "profiles_location_id_idx" ON "public"."profiles" USING "btree" ("location_id");



CREATE INDEX "profiles_region_id_idx" ON "public"."profiles" USING "btree" ("region_id");



CREATE INDEX "tracked_items_audit_changed_at_idx" ON "public"."tracked_items_audit" USING "btree" ("changed_at");



CREATE INDEX "tracked_items_audit_location_id_idx" ON "public"."tracked_items_audit" USING "btree" ("location_id");



CREATE INDEX "tracked_items_audit_tracked_item_id_idx" ON "public"."tracked_items_audit" USING "btree" ("tracked_item_id");



CREATE INDEX "tracked_items_location_created_at_idx" ON "public"."tracked_items" USING "btree" ("location_id", "created_at");



CREATE INDEX "tracked_items_location_name_norm_idx" ON "public"."tracked_items" USING "btree" ("location_id", "name_norm");



CREATE UNIQUE INDEX "tracked_items_location_name_sublabel_norm_unique" ON "public"."tracked_items" USING "btree" ("location_id", "name_norm", "sub_label_norm");



CREATE OR REPLACE TRIGGER "trg_audit_tracked_items_changes" AFTER INSERT OR DELETE OR UPDATE ON "public"."tracked_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_tracked_items_changes"();



CREATE OR REPLACE TRIGGER "trg_set_entry_altered_flag" BEFORE INSERT ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_entry_altered_flag"();



CREATE OR REPLACE TRIGGER "trg_set_entry_creator" BEFORE INSERT ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_entry_creator"();



CREATE OR REPLACE TRIGGER "trg_set_entry_derived_fields" BEFORE INSERT ON "public"."entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_daily_entry_derived_fields"();



CREATE OR REPLACE TRIGGER "trg_tracked_items_set_norm_fields" BEFORE INSERT OR UPDATE ON "public"."tracked_items" FOR EACH ROW EXECUTE FUNCTION "public"."tracked_items_set_norm_fields"();



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "daily_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "daily_entries_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "daily_entries_tracked_item_id_fkey" FOREIGN KEY ("tracked_item_id") REFERENCES "public"."tracked_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_location_assignments"
    ADD CONSTRAINT "employee_location_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_location_assignments"
    ADD CONSTRAINT "employee_location_assignments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_altered_from_entry_fk" FOREIGN KEY ("altered_from_entry_id") REFERENCES "public"."entries"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."entries"
    ADD CONSTRAINT "entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."location_assignments"
    ADD CONSTRAINT "location_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."location_assignments"
    ADD CONSTRAINT "location_assignments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_assignments"
    ADD CONSTRAINT "location_assignments_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."location_assignments"
    ADD CONSTRAINT "location_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tracked_items"
    ADD CONSTRAINT "tracked_items_baseline_set_by_fkey" FOREIGN KEY ("baseline_set_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."tracked_items"
    ADD CONSTRAINT "tracked_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



CREATE POLICY "Employees read tracked items for their location" ON "public"."tracked_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."location_id" = "tracked_items"."location_id")))));



CREATE POLICY "Users can read own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "assignments_master_delete" ON "public"."employee_location_assignments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."employee_location_assignments" "ela"
  WHERE (("ela"."employee_id" = "auth"."uid"()) AND ("ela"."role" = 'admin_master'::"text")))));



CREATE POLICY "assignments_master_update" ON "public"."employee_location_assignments" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."employee_location_assignments" "ela"
  WHERE (("ela"."employee_id" = "auth"."uid"()) AND ("ela"."role" = 'admin_master'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employee_location_assignments" "ela"
  WHERE (("ela"."employee_id" = "auth"."uid"()) AND ("ela"."role" = 'admin_master'::"text")))));



CREATE POLICY "assignments_master_write" ON "public"."employee_location_assignments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."employee_location_assignments" "ela"
  WHERE (("ela"."employee_id" = "auth"."uid"()) AND ("ela"."role" = 'admin_master'::"text")))));



ALTER TABLE "public"."employee_location_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_deactivate_guard" ON "public"."employees" FOR UPDATE TO "authenticated" USING (("is_active" = true)) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'master_admin'::"text")))) AND ("id" <> "auth"."uid"()) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."profiles" "target"
  WHERE (("target"."id" = "employees"."id") AND ("target"."role" = 'master_admin'::"text")))))));



ALTER TABLE "public"."entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entries_admin_select" ON "public"."entries" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = 'master_admin'::"text") OR (("p"."role" = 'local_admin'::"text") AND ("p"."location_id" IS NOT NULL) AND ("entries"."location_id" = "p"."location_id")) OR (("p"."role" = 'regional_admin'::"text") AND ("p"."region_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."locations" "l"
          WHERE (("l"."id" = "entries"."location_id") AND ("l"."region_id" = "p"."region_id"))))))))));



CREATE POLICY "entries_employee_insert_own" ON "public"."entries" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'employee'::"text")))) AND ("employee_id" = "auth"."uid"()) AND ("location_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."employee_location_assignments" "ela"
  WHERE (("ela"."employee_id" = "entries"."employee_id") AND ("ela"."location_id" = "entries"."location_id") AND ("ela"."role" = 'employee'::"text"))))));



CREATE POLICY "entries_employee_select_none" ON "public"."entries" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'employee'::"text")))) AND false));



CREATE POLICY "entries_insert_assigned" ON "public"."entries" FOR INSERT WITH CHECK (("public"."tp_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."tracked_items" "ti"
  WHERE (("ti"."id" = "entries"."tracked_item_id") AND "public"."tp_has_assignment"("ti"."location_id"))))));



CREATE POLICY "entries_select_recent_own" ON "public"."entries" FOR SELECT USING (("public"."tp_is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."tracked_items" "ti"
  WHERE (("ti"."id" = "entries"."tracked_item_id") AND "public"."tp_has_assignment"("ti"."location_id"))))));



ALTER TABLE "public"."location_assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_assignments_manage_privileged" ON "public"."location_assignments" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_privileged"() AND ("assigned_by" = "auth"."uid"())));



CREATE POLICY "location_assignments_select_own" ON "public"."location_assignments" FOR SELECT TO "authenticated" USING (("public"."is_privileged"() OR ("user_id" = "auth"."uid"())));



CREATE POLICY "location_assignments_update_privileged" ON "public"."location_assignments" FOR UPDATE TO "authenticated" USING ("public"."is_privileged"()) WITH CHECK ("public"."is_privileged"());



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations_delete_master" ON "public"."locations" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'master_admin'::"text")))));



CREATE POLICY "locations_insert_master" ON "public"."locations" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'master_admin'::"text")))));



CREATE POLICY "locations_select_assigned" ON "public"."locations" FOR SELECT USING (("public"."tp_is_admin"() OR "public"."tp_has_assignment"("id")));



CREATE POLICY "locations_select_scoped" ON "public"."locations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = 'master_admin'::"text") OR (("p"."role" = 'regional_admin'::"text") AND ("p"."region_id" IS NOT NULL) AND ("locations"."region_id" = "p"."region_id")) OR (("p"."role" = 'local_admin'::"text") AND ("p"."location_id" IS NOT NULL) AND ("locations"."id" = "p"."location_id")))))));



CREATE POLICY "locations_update_master" ON "public"."locations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'master_admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'master_admin'::"text")))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_master_manage" ON "public"."profiles" TO "authenticated" USING (("public"."current_role"() = 'master_admin'::"text")) WITH CHECK (("public"."current_role"() = 'master_admin'::"text"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."regions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "regions_select_master" ON "public"."regions" FOR SELECT TO "authenticated" USING (("public"."current_role"() = 'master_admin'::"text"));



CREATE POLICY "regions_select_scoped" ON "public"."regions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = 'master_admin'::"text") OR (("p"."role" = 'regional_admin'::"text") AND ("p"."region_id" IS NOT NULL) AND ("regions"."id" = "p"."region_id")) OR (("p"."role" = 'local_admin'::"text") AND ("p"."location_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."locations" "l"
          WHERE (("l"."id" = "p"."location_id") AND ("l"."region_id" = "regions"."id"))))))))));



ALTER TABLE "public"."tracked_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tracked_items_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tracked_items_audit_select_scoped" ON "public"."tracked_items_audit" FOR SELECT TO "authenticated" USING ((("public"."current_role"() = 'master_admin'::"text") OR (("public"."current_role"() = 'regional_admin'::"text") AND ("location_id" IN ( SELECT "locations"."id"
   FROM "public"."locations"
  WHERE ("locations"."region_id" = "public"."current_region_id"()))))));



CREATE POLICY "tracked_items_delete_scoped" ON "public"."tracked_items" FOR DELETE TO "authenticated" USING ((("public"."current_role"() = 'master_admin'::"text") OR (("public"."current_role"() = 'regional_admin'::"text") AND ("location_id" IN ( SELECT "locations"."id"
   FROM "public"."locations"
  WHERE ("locations"."region_id" = "public"."current_region_id"())))) OR (("public"."current_role"() = 'local_admin'::"text") AND ("location_id" = "public"."current_location_id"()))));



CREATE POLICY "tracked_items_insert_admin" ON "public"."tracked_items" FOR INSERT WITH CHECK ("public"."tp_is_admin"());



CREATE POLICY "tracked_items_insert_scoped" ON "public"."tracked_items" FOR INSERT TO "authenticated" WITH CHECK ((("public"."current_role"() = 'master_admin'::"text") OR (("public"."current_role"() = 'regional_admin'::"text") AND ("location_id" IN ( SELECT "locations"."id"
   FROM "public"."locations"
  WHERE ("locations"."region_id" = "public"."current_region_id"())))) OR (("public"."current_role"() = 'local_admin'::"text") AND ("location_id" = "public"."current_location_id"()))));



CREATE POLICY "tracked_items_select_assigned" ON "public"."tracked_items" FOR SELECT USING (("public"."tp_is_admin"() OR "public"."tp_has_assignment"("location_id")));



CREATE POLICY "tracked_items_select_scoped" ON "public"."tracked_items" FOR SELECT TO "authenticated" USING ((("public"."current_role"() = 'master_admin'::"text") OR (("public"."current_role"() = 'regional_admin'::"text") AND ("location_id" IN ( SELECT "locations"."id"
   FROM "public"."locations"
  WHERE ("locations"."region_id" = "public"."current_region_id"())))) OR (("public"."current_role"() = 'local_admin'::"text") AND ("location_id" = "public"."current_location_id"()))));



CREATE POLICY "tracked_items_update_scoped" ON "public"."tracked_items" FOR UPDATE TO "authenticated" USING ((("public"."current_role"() = 'master_admin'::"text") OR (("public"."current_role"() = 'regional_admin'::"text") AND ("location_id" IN ( SELECT "locations"."id"
   FROM "public"."locations"
  WHERE ("locations"."region_id" = "public"."current_region_id"())))) OR (("public"."current_role"() = 'local_admin'::"text") AND ("location_id" = "public"."current_location_id"())))) WITH CHECK ((("public"."current_role"() = 'master_admin'::"text") OR (("public"."current_role"() = 'regional_admin'::"text") AND ("location_id" IN ( SELECT "locations"."id"
   FROM "public"."locations"
  WHERE ("locations"."region_id" = "public"."current_region_id"())))) OR (("public"."current_role"() = 'local_admin'::"text") AND ("location_id" = "public"."current_location_id"()))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
















































































































































































































































































































































































































































GRANT ALL ON FUNCTION "public"."audit_tracked_items_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_tracked_items_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_tracked_items_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_location_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_location_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_location_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_region_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_region_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_region_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_profile"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_active_assignment"("loc" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_active_assignment"("loc" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_active_assignment"("loc" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_privileged"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_privileged"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_privileged"() TO "service_role";



GRANT ALL ON FUNCTION "public"."request_uid"() TO "anon";
GRANT ALL ON FUNCTION "public"."request_uid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_uid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_daily_entry_derived_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_daily_entry_derived_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_daily_entry_derived_fields"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_entry_altered_flag"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_entry_altered_flag"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_entry_altered_flag"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_entry_creator"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_entry_creator"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_entry_creator"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tp_has_assignment"("loc_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."tp_has_assignment"("loc_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tp_has_assignment"("loc_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."tp_is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."tp_is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tp_is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tp_request_uid"() TO "anon";
GRANT ALL ON FUNCTION "public"."tp_request_uid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tp_request_uid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tracked_items_set_norm_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."tracked_items_set_norm_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tracked_items_set_norm_fields"() TO "service_role";







































GRANT ALL ON TABLE "public"."employee_location_assignments" TO "anon";
GRANT ALL ON TABLE "public"."employee_location_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_location_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."entries" TO "anon";
GRANT ALL ON TABLE "public"."entries" TO "authenticated";
GRANT ALL ON TABLE "public"."entries" TO "service_role";



GRANT ALL ON TABLE "public"."tracked_items" TO "anon";
GRANT ALL ON TABLE "public"."tracked_items" TO "authenticated";
GRANT ALL ON TABLE "public"."tracked_items" TO "service_role";



GRANT ALL ON TABLE "public"."entry_status" TO "anon";
GRANT ALL ON TABLE "public"."entry_status" TO "authenticated";
GRANT ALL ON TABLE "public"."entry_status" TO "service_role";



GRANT ALL ON TABLE "public"."location_assignments" TO "anon";
GRANT ALL ON TABLE "public"."location_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."location_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."regions" TO "anon";
GRANT ALL ON TABLE "public"."regions" TO "authenticated";
GRANT ALL ON TABLE "public"."regions" TO "service_role";



GRANT ALL ON TABLE "public"."tracked_items_audit" TO "service_role";
GRANT SELECT ON TABLE "public"."tracked_items_audit" TO "authenticated";















ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

revoke update on table "public"."employees" from "authenticated";

revoke delete on table "public"."tracked_items_audit" from "anon";

revoke insert on table "public"."tracked_items_audit" from "anon";

revoke references on table "public"."tracked_items_audit" from "anon";

revoke select on table "public"."tracked_items_audit" from "anon";

revoke trigger on table "public"."tracked_items_audit" from "anon";

revoke truncate on table "public"."tracked_items_audit" from "anon";

revoke update on table "public"."tracked_items_audit" from "anon";

revoke delete on table "public"."tracked_items_audit" from "authenticated";

revoke insert on table "public"."tracked_items_audit" from "authenticated";

revoke references on table "public"."tracked_items_audit" from "authenticated";

revoke trigger on table "public"."tracked_items_audit" from "authenticated";

revoke truncate on table "public"."tracked_items_audit" from "authenticated";

revoke update on table "public"."tracked_items_audit" from "authenticated";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();


