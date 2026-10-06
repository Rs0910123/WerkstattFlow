-- ============================================================================
-- WerkstattFlow — NUR FÜR LOKALE PRÜFUNG: Supabase nachbauen (Shim)
-- ============================================================================
-- !!! Diese Datei gehört NICHT in ein Supabase-Projekt. !!!
--
-- Sie ist kein Teil der Migrationen und wird nirgends deployt. Sie existiert
-- allein, damit die Migrationen und die RLS-Policies auch auf einem normalen
-- PostgreSQL — ohne Supabase-Cloud — wirklich ausgeführt und geprüft werden
-- können (siehe scripts/rls-check.sh).
--
-- Nachgebaut werden genau die Teile von Supabase, auf die unsere Migrationen
-- sich stützen:
--   * die Rollen anon / authenticated / service_role
--   * das Schema auth mit auth.users, auth.identities und auth.uid()
--   * das Schema storage mit storage.buckets, storage.objects und
--     storage.foldername()
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Rollen (in Supabase von Haus aus vorhanden)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Schema auth
-- ---------------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  instance_id              uuid,
  id                       uuid primary key,
  aud                      varchar(255),
  role                     varchar(255),
  email                    varchar(255) unique,
  encrypted_password       varchar(255),
  email_confirmed_at       timestamptz,
  invited_at               timestamptz,
  confirmation_token       varchar(255) default '',
  confirmation_sent_at     timestamptz,
  recovery_token           varchar(255) default '',
  recovery_sent_at         timestamptz,
  email_change_token_new   varchar(255) default '',
  email_change             varchar(255) default '',
  email_change_sent_at     timestamptz,
  last_sign_in_at          timestamptz,
  raw_app_meta_data        jsonb,
  raw_user_meta_data       jsonb,
  is_super_admin           boolean,
  created_at               timestamptz,
  updated_at               timestamptz,
  phone                    text,
  phone_confirmed_at       timestamptz,
  banned_until             timestamptz,
  is_anonymous             boolean not null default false
);

create table if not exists auth.identities (
  id              uuid primary key default gen_random_uuid(),
  provider_id     text,
  user_id         uuid not null references auth.users (id) on delete cascade,
  identity_data   jsonb not null default '{}'::jsonb,
  provider        text not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  unique (provider, provider_id)
);

-- Wie in Supabase: der angemeldete Benutzer steckt in den JWT-Claims.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select case
    when nullif(current_setting('request.jwt.claims', true), '') is null then null
    else nullif(
      (current_setting('request.jwt.claims', true)::jsonb ->> 'sub'),
      ''
    )::uuid
  end;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select case
    when nullif(current_setting('request.jwt.claims', true), '') is null then null
    else current_setting('request.jwt.claims', true)::jsonb ->> 'role'
  end;
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

grant usage on schema auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Schema storage
-- ---------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  public             boolean not null default false,
  avif_autodetection boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets (id),
  name             text,
  owner            uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_accessed_at timestamptz,
  metadata         jsonb,
  unique (bucket_id, name)
);

-- In Supabase ist RLS auf storage.objects standardmäßig aktiv.
alter table storage.objects enable row level security;

-- Liefert die Ordnerbestandteile eines Pfades (ohne Dateinamen).
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  if parts is null or array_length(parts, 1) is null or array_length(parts, 1) < 2 then
    return array[]::text[];
  end if;
  return parts[1 : array_length(parts, 1) - 1];
end;
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
