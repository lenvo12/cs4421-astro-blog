create table public.leaderboard_entries (
	callsign_key text generated always as (name) stored primary key,
	name text not null
		constraint leaderboard_entries_name_check
		check (
			char_length(name) between 1 and 24
			and name = btrim(name)
			and name !~ '[[:cntrl:]]'
		),
	score integer not null
		constraint leaderboard_entries_score_check
		check (score between 1 and 10000),
	achieved_at timestamptz not null default clock_timestamp(),
	created_at timestamptz not null default clock_timestamp(),
	summit boolean generated always as (score = 10000) stored
);

create index leaderboard_entries_rank_idx
	on public.leaderboard_entries (score desc, achieved_at asc);

alter table public.leaderboard_entries enable row level security;

revoke all on table public.leaderboard_entries from public, anon, authenticated;
grant select on table public.leaderboard_entries to service_role;

create or replace function public.submit_leaderboard_score(p_name text, p_score integer)
returns table (
	name text,
	score integer,
	achieved_at timestamptz,
	summit boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
	normalized_name text;
	saved_entry public.leaderboard_entries%rowtype;
begin
	if p_name is null or p_score is null or p_score not between 1 and 10000 then
		raise exception 'Invalid leaderboard submission.' using errcode = '22023';
	end if;

	normalized_name := btrim(regexp_replace(p_name, '[[:space:]]+', ' ', 'g'));
	if char_length(normalized_name) not between 1 and 24
		or normalized_name ~ '[[:cntrl:]]' then
		raise exception 'Invalid leaderboard callsign.' using errcode = '22023';
	end if;

	insert into public.leaderboard_entries as current_entry (name, score)
	values (normalized_name, p_score)
	on conflict (callsign_key) do update
	set
		name = excluded.name,
		score = excluded.score,
		achieved_at = clock_timestamp()
	where excluded.score > current_entry.score
	returning current_entry.* into saved_entry;

	if not found then
		select entry.*
		into saved_entry
		from public.leaderboard_entries as entry
		where entry.callsign_key = normalized_name;
	end if;

	return query
	select saved_entry.name, saved_entry.score, saved_entry.achieved_at, saved_entry.summit;
end;
$function$;

revoke all on function public.submit_leaderboard_score(text, integer)
	from public, anon, authenticated;
grant execute on function public.submit_leaderboard_score(text, integer)
	to service_role;
