-- Smash Your Pumpkin leaderboard.
-- Run once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
--
-- The browser only ever uses the public anon key: it can read the board and
-- call submit_score(), nothing else. Inserts go through that function, which
-- validates the entry, throttles repeats and keeps only the best 100 rows.

create table if not exists public.scores (
  id bigint generated always as identity primary key,
  name text not null check (name ~ '^[A-Z0-9]{3}$'),
  score integer not null check (score between 0 and 500000),
  best_combo integer not null default 0 check (best_combo between 0 and 5000),
  pumpkins integer not null default 0 check (pumpkins between 0 and 500),
  created_at timestamptz not null default now()
);

create index if not exists scores_rank_idx on public.scores (score desc, created_at asc);

alter table public.scores enable row level security;

drop policy if exists "Leaderboard is public" on public.scores;
create policy "Leaderboard is public" on public.scores
  for select to anon, authenticated
  using (true);

-- No insert/update/delete policies: writes only happen inside submit_score.

create or replace function public.submit_score(
  p_name text,
  p_score integer,
  p_combo integer,
  p_pumpkins integer
)
returns integer -- 1-based rank, or null if the score didn't make the top 100
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
  new_rank integer;
begin
  if p_name !~ '^[A-Z0-9]{3}$' then
    raise exception 'invalid name';
  end if;

  -- Rough plausibility for a 60 second round; tighten once real scores exist.
  if p_score not between 0 and 500000
     or p_combo not between 0 and 5000
     or p_pumpkins not between 0 and 500 then
    raise exception 'invalid score';
  end if;

  -- A round lasts a minute: refuse rapid-fire submissions under one name.
  if exists (
    select 1 from scores
    where name = p_name and created_at > now() - interval '30 seconds'
  ) then
    raise exception 'too many submissions';
  end if;

  insert into scores (name, score, best_combo, pumpkins)
  values (p_name, p_score, p_combo, p_pumpkins)
  returning id into new_id;

  -- Keep the board at 100 entries.
  delete from scores
  where id in (
    select id from scores
    order by score desc, created_at asc
    offset 100
  );

  select ranked.position into new_rank
  from (
    select id, row_number() over (order by score desc, created_at asc) as position
    from scores
  ) as ranked
  where ranked.id = new_id;

  return new_rank;
end;
$$;

revoke all on function public.submit_score(text, integer, integer, integer) from public;
grant execute on function public.submit_score(text, integer, integer, integer) to anon, authenticated;
