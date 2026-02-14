-- Supabase table creation for iOS HealthKit data
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- 1. Upload tracking
create table health_uploads (
  id          uuid primary key default gen_random_uuid(),
  device_id   text not null,
  export_date timestamptz not null,
  created_at  timestamptz default now()
);

-- 2. Steps (daily aggregates)
create table steps (
  id          uuid primary key default gen_random_uuid(),
  upload_id   uuid references health_uploads(id) on delete cascade,
  date        timestamptz not null,
  step_count  double precision not null
);

-- 3. Heart rate samples
create table heart_rates (
  id          uuid primary key default gen_random_uuid(),
  upload_id   uuid references health_uploads(id) on delete cascade,
  start_date  timestamptz not null,
  end_date    timestamptz not null,
  bpm         double precision not null
);

-- 4. Sleep samples
create table sleep_samples (
  id          uuid primary key default gen_random_uuid(),
  upload_id   uuid references health_uploads(id) on delete cascade,
  start_date  timestamptz not null,
  end_date    timestamptz not null,
  sleep_stage text not null
);

-- 5. Active energy (daily aggregates)
create table active_energy (
  id            uuid primary key default gen_random_uuid(),
  upload_id     uuid references health_uploads(id) on delete cascade,
  date          timestamptz not null,
  kilocalories  double precision not null
);

-- 6. Distance (daily aggregates)
create table distances (
  id              uuid primary key default gen_random_uuid(),
  upload_id       uuid references health_uploads(id) on delete cascade,
  date            timestamptz not null,
  distance_meters double precision not null
);

-- 7. Workouts
create table workouts (
  id                    uuid primary key default gen_random_uuid(),
  upload_id             uuid references health_uploads(id) on delete cascade,
  start_date            timestamptz not null,
  end_date              timestamptz not null,
  activity_type         text not null,
  duration_seconds      double precision not null,
  total_energy_kcal     double precision,
  total_distance_meters double precision
);

-- 8. Weight
create table weights (
  id          uuid primary key default gen_random_uuid(),
  upload_id   uuid references health_uploads(id) on delete cascade,
  date        timestamptz not null,
  weight_kg   double precision not null
);

-- 9. Height
create table heights (
  id          uuid primary key default gen_random_uuid(),
  upload_id   uuid references health_uploads(id) on delete cascade,
  date        timestamptz not null,
  height_cm   double precision not null
);

-- 10. Health events (irregular heart rhythm, high/low HR, audio exposure)
create table health_events (
  id          uuid primary key default gen_random_uuid(),
  upload_id   uuid references health_uploads(id) on delete cascade,
  event_type  text not null,
  start_date  timestamptz not null,
  end_date    timestamptz not null
);

-- Indexes for common queries
create index idx_steps_date on steps(date);
create index idx_heart_rates_start on heart_rates(start_date);
create index idx_sleep_samples_start on sleep_samples(start_date);
create index idx_workouts_start on workouts(start_date);
create index idx_health_uploads_device on health_uploads(device_id);
