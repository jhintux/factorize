create table analyst_demo (
  id uuid primary key default gen_random_uuid(),
  wallet text not null unique,
  secret_key integer[] not null,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table sme_demo (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  wallet text not null unique,
  secret_key integer[] not null,
  created_at timestamptz not null default now()
);

alter table analyst_demo enable row level security;
alter table sme_demo enable row level security;

create table invoice_demo (
  id uuid primary key default gen_random_uuid(),
  sme_demo_id uuid not null references sme_demo(id) on delete cascade,
  invoice_id text not null,
  vault_pda text not null,
  shares_mint text not null,
  advance_amount_usdc bigint not null,
  repayment_amount_usdc bigint not null,
  due_date timestamptz not null,
  settle_date timestamptz not null,
  flow_type text not null check (flow_type in ('settle', 'expire', 'default')),
  created_at timestamptz not null default now(),
  unique (sme_demo_id, invoice_id)
);

alter table invoice_demo enable row level security;
