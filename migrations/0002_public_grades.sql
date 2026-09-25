create table if not exists public_grades (
  season integer not null,
  week integer not null,
  id text not null,
  market text not null,
  pick text not null,
  unit double precision not null,
  result text not null,
  pnl double precision not null,
  primary key (season, week, id)
);
