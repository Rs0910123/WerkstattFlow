-- ============================================================================
-- WerkstattFlow — Migration 4/4: Supabase Storage (Dateien je Mandant)
-- ============================================================================
-- Dateien liegen in einem privaten Bucket. Pfad-Konvention:
--
--     <company_id>/<anfrage|termin|fahrzeug>/<datei-name>
--     z. B. 6f1c...-.../anfrage/2026-10-06-foto-bremsen.jpg
--
-- Der erste Ordner ist die Unternehmen-ID. Die Policies unten vergleichen ihn
-- mit public.current_company_id() — damit greift im Storage dieselbe
-- Mandanten-Trennung wie in den Tabellen.
-- ============================================================================

-- Privater Bucket für Kundenfotos, Gutachten und Rechnungen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anfragen-dateien',
  'anfragen-dateien',
  false,
  10485760, -- 10 MB pro Datei
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- storage.objects — Policies je Mandant
-- ----------------------------------------------------------------------------
drop policy if exists "anfragen_dateien_select_own_company" on storage.objects;
create policy "anfragen_dateien_select_own_company" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'anfragen-dateien'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

drop policy if exists "anfragen_dateien_insert_own_company" on storage.objects;
create policy "anfragen_dateien_insert_own_company" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'anfragen-dateien'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

drop policy if exists "anfragen_dateien_update_own_company" on storage.objects;
create policy "anfragen_dateien_update_own_company" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'anfragen-dateien'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  )
  with check (
    bucket_id = 'anfragen-dateien'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

drop policy if exists "anfragen_dateien_delete_own_company" on storage.objects;
create policy "anfragen_dateien_delete_own_company" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'anfragen-dateien'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );
