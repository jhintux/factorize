create table invoice_demo_log (
  id uuid primary key default gen_random_uuid(),
  invoice_demo_id uuid not null references invoice_demo(id) on delete cascade,
  step_order integer not null,
  title text not null,
  description text not null,
  signature text,
  status text not null check (status in ('complete', 'error')),
  created_at timestamptz not null default now(),
  unique (invoice_demo_id, step_order)
);

create index invoice_demo_log_invoice_demo_id_idx on invoice_demo_log (invoice_demo_id, step_order);

alter table invoice_demo_log enable row level security;
