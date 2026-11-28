-- job-photos: jobs and photos. Schema "job_photos" was created by the init migration.
--
-- Access model:
--   * Signed-in owners read and write their own jobs and photos through PostgREST (RLS below).
--   * Jobs created without sign-in have owner_id null. They are only ever written through the
--     app's server routes with the service role (which bypasses RLS); no policy grants anon or
--     authenticated anything on them, so nobody can read or claim them directly.
--   * The public share page reads by share_slug through a server route only (service role).

create type job_photos.photo_kind as enum ('before', 'after');

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table job_photos.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  share_slug text not null unique check (share_slug ~ '^[A-Za-z0-9]{16,40}$'),
  title text check (title is null or char_length(title) <= 120),
  note text check (note is null or char_length(note) <= 300),
  business_name text check (business_name is null or char_length(business_name) <= 120),
  logo_path text check (logo_path is null or char_length(logo_path) <= 400),
  review_url text check (review_url is null or review_url ~ '^https://'),
  -- SHA-256 hex of the device's claim token. Null once the job has an owner.
  claim_token_hash text check (claim_token_hash is null or claim_token_hash ~ '^[0-9a-f]{64}$'),
  -- Anonymous jobs expire; owned jobs have expires_at null.
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_owner_or_claimable check (owner_id is not null or claim_token_hash is not null)
);

comment on table job_photos.jobs is 'One before-and-after job. owner_id null until the device signs in and claims it.';

create index jobs_owner_id_created_at_idx on job_photos.jobs (owner_id, created_at desc);
create index jobs_expires_at_idx on job_photos.jobs (expires_at) where expires_at is not null;

create trigger jobs_set_updated_at
  before update on job_photos.jobs
  for each row execute function public.set_updated_at();

alter table job_photos.jobs enable row level security;

create policy "jobs: owners select own"
  on job_photos.jobs for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "jobs: owners insert own"
  on job_photos.jobs for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- `using` only matches rows the user already owns, so an authenticated user can never run
-- `update jobs set owner_id = me where owner_id is null`: claiming goes through the server.
create policy "jobs: owners update own"
  on job_photos.jobs for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "jobs: owners delete own"
  on job_photos.jobs for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- photos
-- ---------------------------------------------------------------------------
create table job_photos.photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references job_photos.jobs (id) on delete cascade,
  kind job_photos.photo_kind not null,
  storage_path text not null unique check (char_length(storage_path) <= 400),
  width integer not null check (width > 0 and width <= 10000),
  height integer not null check (height > 0 and height <= 10000),
  position smallint not null default 0 check (position >= 0 and position < 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, kind, position)
);

comment on table job_photos.photos is 'Up to six before and six after photos per job, stored in the private job-photos bucket.';

create index photos_job_id_idx on job_photos.photos (job_id, kind, position);

create trigger photos_set_updated_at
  before update on job_photos.photos
  for each row execute function public.set_updated_at();

-- Does the current user own the job? Security definer so the photos policies do not depend on
-- the caller being able to select the job row through RLS (they can, but this keeps it cheap).
create or replace function job_photos.owns_job(job uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from job_photos.jobs j where j.id = job and j.owner_id = (select auth.uid())
  );
$$;

grant execute on function job_photos.owns_job(uuid) to authenticated, service_role;

alter table job_photos.photos enable row level security;

create policy "photos: owners select own"
  on job_photos.photos for select to authenticated
  using (job_photos.owns_job(job_id));

create policy "photos: owners insert own"
  on job_photos.photos for insert to authenticated
  with check (job_photos.owns_job(job_id));

create policy "photos: owners update own"
  on job_photos.photos for update to authenticated
  using (job_photos.owns_job(job_id))
  with check (job_photos.owns_job(job_id));

create policy "photos: owners delete own"
  on job_photos.photos for delete to authenticated
  using (job_photos.owns_job(job_id));

-- ---------------------------------------------------------------------------
-- Storage: private bucket "job-photos". Objects live at jobs/<job>/<kind>/<photo>.jpg and
-- logos/<user>/<file>. Reads go through signed URLs made by the server. Owners may manage the
-- objects of their own jobs and their own logos directly; everything else is service role.
-- Skipped on a plain Postgres (CI, local docker) where the storage schema does not exist.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('job-photos', 'job-photos', false, 8388608,
            array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
    on conflict (id) do nothing;

    execute $p$
      create policy "job-photos: owners select own objects"
        on storage.objects for select to authenticated
        using (
          bucket_id = 'job-photos' and (
            (storage.foldername(name))[1] = 'logos' and (storage.foldername(name))[2] = (select auth.uid())::text
            or (storage.foldername(name))[1] = 'jobs' and job_photos.owns_job(((storage.foldername(name))[2])::uuid)
          )
        )
    $p$;
    execute $p$
      create policy "job-photos: owners insert own objects"
        on storage.objects for insert to authenticated
        with check (
          bucket_id = 'job-photos' and (
            (storage.foldername(name))[1] = 'logos' and (storage.foldername(name))[2] = (select auth.uid())::text
            or (storage.foldername(name))[1] = 'jobs' and job_photos.owns_job(((storage.foldername(name))[2])::uuid)
          )
        )
    $p$;
    execute $p$
      create policy "job-photos: owners update own objects"
        on storage.objects for update to authenticated
        using (
          bucket_id = 'job-photos' and (
            (storage.foldername(name))[1] = 'logos' and (storage.foldername(name))[2] = (select auth.uid())::text
            or (storage.foldername(name))[1] = 'jobs' and job_photos.owns_job(((storage.foldername(name))[2])::uuid)
          )
        )
    $p$;
    execute $p$
      create policy "job-photos: owners delete own objects"
        on storage.objects for delete to authenticated
        using (
          bucket_id = 'job-photos' and (
            (storage.foldername(name))[1] = 'logos' and (storage.foldername(name))[2] = (select auth.uid())::text
            or (storage.foldername(name))[1] = 'jobs' and job_photos.owns_job(((storage.foldername(name))[2])::uuid)
          )
        )
    $p$;
  end if;
end $$;
