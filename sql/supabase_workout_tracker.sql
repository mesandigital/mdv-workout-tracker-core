-- mdv-workout-tracker-core Supabase schema
-- Run this in Supabase SQL editor before enabling cloud sync.
--
-- Important:
-- - This schema stores mobile/local SQLite ids scoped by user_id.
-- - Use a fresh Supabase project/schema for this script, or manually migrate old
--   tables that used a global `id primary key`.
-- - The app upserts tracker rows with onConflict: user_id,id.
-- - Weekly planner rows use sync_user_id so the local integer user_id is preserved.

create or replace function public.set_workout_tracker_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists exercises (
  id bigint not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  remote_id text,
  client_id text,
  name text not null,
  category text,
  description text,
  secondary_muscle text,
  body_part text,
  primary_muscle text,
  secondary_muscles text,
  instructions text,
  difficulty text,
  training_style text,
  progression_group text,
  progression_level int,
  equipment text,
  movement text,
  exercise_type text,
  exercise_category text,
  image_url text,
  image_key text,
  source text default 'system',
  archived boolean not null default false,
  seeded boolean not null default false,
  seeded_id text,
  seeded_version int not null default 0,
  synced boolean not null default false,
  version int not null default 1,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists workouts (
  id bigint not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  remote_id text,
  client_id text,
  name text not null,
  type text,
  section text,
  description text,
  difficulty text,
  training_style text,
  deleted boolean not null default false,
  archived boolean not null default false,
  seeded boolean not null default false,
  seeded_id text,
  seeded_version int not null default 0,
  synced boolean not null default false,
  version int not null default 1,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists workout_blocks (
  id bigint not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  remote_id text,
  client_id text,
  workout_id bigint not null,
  type text not null default 'straight_sets' check (type in ('straight_sets', 'circuit', 'superset', 'giant_set', 'interval')),
  name text,
  rounds int,
  rest_between_rounds int,
  order_index int not null default 0,
  deleted boolean not null default false,
  synced boolean not null default false,
  version int not null default 1,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists workout_exercises (
  id bigint not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  remote_id text,
  client_id text,
  workout_id bigint not null,
  block_id bigint,
  exercise_id bigint not null,
  order_index int not null,
  default_sets int not null default 1,
  default_reps int not null default 1,
  weight double precision default 0,
  rest_seconds int,
  section text default 'main',
  superset_id int,
  group_id int,
  group_type text check (group_type in ('superset', 'drop_set', 'circuit')),
  "setsArray" text default '[]',
  deleted boolean not null default false,
  synced boolean not null default false,
  version int not null default 1,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists workout_exercise_sets (
  id bigint not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  remote_id text,
  client_id text,
  workout_id bigint not null,
  workout_exercise_id bigint,
  exercise_id bigint not null,
  set_number int not null,
  planned_reps int not null,
  planned_weight double precision,
  duration_seconds int,
  drop_sets jsonb not null default '[]'::jsonb,
  deleted boolean not null default false,
  synced boolean not null default false,
  version int not null default 1,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists workout_sessions (
  id bigint not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  remote_id text,
  client_id text,
  workout_id bigint not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  notes text,
  duration int,
  synced boolean not null default false,
  version int not null default 1,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists exercise_logs (
  id bigint not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  remote_id text,
  client_id text,
  workout_session_id bigint not null,
  block_id bigint,
  block_type text check (block_type in ('straight_sets', 'circuit', 'superset', 'giant_set', 'interval')),
  block_name text,
  block_rounds int,
  block_rest_between_rounds int,
  block_order int,
  exercise_id bigint not null,
  planned_sets int,
  planned_reps int,
  weight double precision,
  rest_seconds int,
  order_index int,
  superset_id int,
  group_id int,
  group_type text check (group_type in ('superset', 'drop_set', 'circuit')),
  source text default 'template',
  section text default 'main',
  notes text,
  deleted boolean not null default false,
  synced boolean not null default false,
  version int not null default 1,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists set_logs (
  id bigint not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  remote_id text,
  client_id text,
  exercise_log_id bigint not null,
  set_number int not null,
  round_number int,
  planned_reps int not null,
  reps int,
  weight double precision,
  planned_duration_seconds int,
  duration_seconds int,
  drop_sets jsonb not null default '[]'::jsonb,
  completed boolean not null default false,
  deleted boolean not null default false,
  synced boolean not null default false,
  version int not null default 1,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists personal_records (
  id bigint not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  remote_id text,
  client_id text,
  exercise_id bigint not null,
  workout_session_id bigint not null,
  set_log_id bigint not null,
  record_type text not null check (record_type in ('weight', 'reps', 'volume')),
  value double precision not null,
  previous_value double precision,
  weight double precision,
  reps int,
  achieved_at timestamptz not null,
  calculation_version int not null default 1,
  synced boolean not null default false,
  version int not null default 1,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique(user_id, workout_session_id, set_log_id, record_type)
);

create table if not exists progressive_overload_applications (
  id bigint not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_session_id bigint not null,
  workout_id bigint not null,
  exercise_id bigint not null,
  exercise_log_id bigint,
  set_number int not null,
  field text not null,
  previous_value double precision,
  new_value double precision,
  recommendation_type text not null,
  reason_code text not null,
  drop_sets_snapshot jsonb,
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique(user_id, workout_session_id, exercise_id, set_number, field)
);

create table if not exists progressive_overload_recommendation_snapshots (
  id bigint not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_session_id bigint not null,
  exercise_id bigint not null,
  exercise_log_id bigint not null,
  eligible boolean not null default false,
  reason_code text not null,
  reason_label text not null,
  recommendation_type text not null,
  current_value double precision,
  recommended_value double precision,
  increment double precision not null default 0,
  equipment_increment double precision not null default 0,
  is_bodyweight boolean not null default false,
  is_timed boolean not null default false,
  is_block_exercise boolean not null default false,
  has_drop_sets boolean not null default false,
  recommendation_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique(user_id, workout_session_id, exercise_id, exercise_log_id)
);

create table if not exists weekly_plans (
  id text not null,
  sync_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_id bigint not null,
  week_number int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (sync_user_id, id)
);

create table if not exists weekly_plan_workouts (
  id text not null,
  sync_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workout_id bigint not null,
  weekly_plan_id text not null,
  workout_day int not null,
  status text not null default 'scheduled',
  scheduled_date text,
  original_scheduled_date text,
  started_session_id bigint,
  completed_session_id bigint,
  status_reason text,
  skip_note text,
  reschedule_note text,
  rescheduled_from_id text,
  rescheduled_to_date text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (sync_user_id, id)
);

alter table set_logs add column if not exists planned_duration_seconds int;
alter table set_logs add column if not exists duration_seconds int;
alter table workout_exercises add column if not exists rest_seconds int;
alter table exercise_logs add column if not exists rest_seconds int;
alter table exercise_logs add column if not exists source text default 'template';
alter table personal_records add column if not exists calculation_version int not null default 1;
alter table weekly_plans add column if not exists sync_user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table weekly_plan_workouts add column if not exists sync_user_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table weekly_plan_workouts add column if not exists scheduled_date text;
alter table weekly_plan_workouts add column if not exists original_scheduled_date text;
alter table weekly_plan_workouts add column if not exists started_session_id bigint;
alter table weekly_plan_workouts add column if not exists completed_session_id bigint;
alter table weekly_plan_workouts add column if not exists status_reason text;
alter table weekly_plan_workouts add column if not exists skip_note text;
alter table weekly_plan_workouts add column if not exists reschedule_note text;
alter table weekly_plan_workouts add column if not exists rescheduled_from_id text;
alter table weekly_plan_workouts add column if not exists rescheduled_to_date text;

create index if not exists idx_workout_tracker_exercises_user on exercises(user_id);
create index if not exists idx_workout_tracker_exercises_client_id on exercises(user_id, client_id);
create index if not exists idx_workout_tracker_workouts_user on workouts(user_id);
create index if not exists idx_workout_tracker_workouts_client_id on workouts(user_id, client_id);
create index if not exists idx_workout_tracker_workout_blocks_workout on workout_blocks(user_id, workout_id);
create index if not exists idx_workout_tracker_workout_exercises_workout on workout_exercises(user_id, workout_id);
create index if not exists idx_workout_tracker_workout_exercises_block on workout_exercises(user_id, block_id);
create index if not exists idx_workout_tracker_workout_exercise_sets_workout on workout_exercise_sets(user_id, workout_id);
create index if not exists idx_workout_tracker_sessions_workout on workout_sessions(user_id, workout_id);
create index if not exists idx_workout_tracker_exercise_logs_session on exercise_logs(user_id, workout_session_id);
create index if not exists idx_workout_tracker_set_logs_exercise_log on set_logs(user_id, exercise_log_id);
create index if not exists idx_workout_tracker_personal_records_exercise on personal_records(user_id, exercise_id, achieved_at);
create index if not exists idx_workout_tracker_personal_records_session on personal_records(user_id, workout_session_id);
create index if not exists idx_workout_tracker_progressive_overload_session on progressive_overload_applications(user_id, workout_session_id);
create index if not exists idx_workout_tracker_progressive_overload_snapshots_session on progressive_overload_recommendation_snapshots(user_id, workout_session_id);
create index if not exists idx_workout_tracker_weekly_plans_owner on weekly_plans(sync_user_id);
create index if not exists idx_workout_tracker_weekly_plan_workouts_owner on weekly_plan_workouts(sync_user_id, weekly_plan_id);

drop trigger if exists trg_workout_tracker_exercises_updated_at on exercises;
create trigger trg_workout_tracker_exercises_updated_at
before update on exercises
for each row execute function public.set_workout_tracker_updated_at();

drop trigger if exists trg_workout_tracker_workouts_updated_at on workouts;
create trigger trg_workout_tracker_workouts_updated_at
before update on workouts
for each row execute function public.set_workout_tracker_updated_at();

drop trigger if exists trg_workout_tracker_workout_blocks_updated_at on workout_blocks;
create trigger trg_workout_tracker_workout_blocks_updated_at
before update on workout_blocks
for each row execute function public.set_workout_tracker_updated_at();

drop trigger if exists trg_workout_tracker_workout_exercises_updated_at on workout_exercises;
create trigger trg_workout_tracker_workout_exercises_updated_at
before update on workout_exercises
for each row execute function public.set_workout_tracker_updated_at();

drop trigger if exists trg_workout_tracker_workout_exercise_sets_updated_at on workout_exercise_sets;
create trigger trg_workout_tracker_workout_exercise_sets_updated_at
before update on workout_exercise_sets
for each row execute function public.set_workout_tracker_updated_at();

drop trigger if exists trg_workout_tracker_workout_sessions_updated_at on workout_sessions;
create trigger trg_workout_tracker_workout_sessions_updated_at
before update on workout_sessions
for each row execute function public.set_workout_tracker_updated_at();

drop trigger if exists trg_workout_tracker_exercise_logs_updated_at on exercise_logs;
create trigger trg_workout_tracker_exercise_logs_updated_at
before update on exercise_logs
for each row execute function public.set_workout_tracker_updated_at();

drop trigger if exists trg_workout_tracker_set_logs_updated_at on set_logs;
create trigger trg_workout_tracker_set_logs_updated_at
before update on set_logs
for each row execute function public.set_workout_tracker_updated_at();

drop trigger if exists trg_workout_tracker_personal_records_updated_at on personal_records;
create trigger trg_workout_tracker_personal_records_updated_at
before update on personal_records
for each row execute function public.set_workout_tracker_updated_at();

drop trigger if exists trg_workout_tracker_progressive_overload_applications_updated_at on progressive_overload_applications;
create trigger trg_workout_tracker_progressive_overload_applications_updated_at
before update on progressive_overload_applications
for each row execute function public.set_workout_tracker_updated_at();

drop trigger if exists trg_workout_tracker_progressive_overload_snapshots_updated_at on progressive_overload_recommendation_snapshots;
create trigger trg_workout_tracker_progressive_overload_snapshots_updated_at
before update on progressive_overload_recommendation_snapshots
for each row execute function public.set_workout_tracker_updated_at();

drop trigger if exists trg_workout_tracker_weekly_plans_updated_at on weekly_plans;
create trigger trg_workout_tracker_weekly_plans_updated_at
before update on weekly_plans
for each row execute function public.set_workout_tracker_updated_at();

drop trigger if exists trg_workout_tracker_weekly_plan_workouts_updated_at on weekly_plan_workouts;
create trigger trg_workout_tracker_weekly_plan_workouts_updated_at
before update on weekly_plan_workouts
for each row execute function public.set_workout_tracker_updated_at();

alter table exercises enable row level security;
alter table workouts enable row level security;
alter table workout_blocks enable row level security;
alter table workout_exercises enable row level security;
alter table workout_exercise_sets enable row level security;
alter table workout_sessions enable row level security;
alter table exercise_logs enable row level security;
alter table set_logs enable row level security;
alter table personal_records enable row level security;
alter table progressive_overload_applications enable row level security;
alter table progressive_overload_recommendation_snapshots enable row level security;
alter table weekly_plans enable row level security;
alter table weekly_plan_workouts enable row level security;

drop policy if exists "users manage own exercises" on exercises;
create policy "users manage own exercises" on exercises
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own workouts" on workouts;
create policy "users manage own workouts" on workouts
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own workout blocks" on workout_blocks;
create policy "users manage own workout blocks" on workout_blocks
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own workout exercises" on workout_exercises;
create policy "users manage own workout exercises" on workout_exercises
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own workout exercise sets" on workout_exercise_sets;
create policy "users manage own workout exercise sets" on workout_exercise_sets
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own workout sessions" on workout_sessions;
create policy "users manage own workout sessions" on workout_sessions
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own exercise logs" on exercise_logs;
create policy "users manage own exercise logs" on exercise_logs
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own set logs" on set_logs;
create policy "users manage own set logs" on set_logs
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own personal records" on personal_records;
create policy "users manage own personal records" on personal_records
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own progressive overload applications" on progressive_overload_applications;
create policy "users manage own progressive overload applications" on progressive_overload_applications
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own progressive overload snapshots" on progressive_overload_recommendation_snapshots;
create policy "users manage own progressive overload snapshots" on progressive_overload_recommendation_snapshots
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users manage own weekly plans" on weekly_plans;
create policy "users manage own weekly plans" on weekly_plans
for all using (sync_user_id = auth.uid()) with check (sync_user_id = auth.uid());

drop policy if exists "users manage own weekly plan workouts" on weekly_plan_workouts;
create policy "users manage own weekly plan workouts" on weekly_plan_workouts
for all using (sync_user_id = auth.uid()) with check (sync_user_id = auth.uid());
