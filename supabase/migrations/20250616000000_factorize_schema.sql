-- companies: canonical business entity (payer profile, reusable across invoices)
create table companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  ruc text not null unique,
  about text,
  sector_id text not null references sectors(id),
  activity_code text not null references activities(code),
  wallet text unique,
  created_at timestamptz not null default now()
);

-- migrate existing smes into companies
insert into companies (company_name, about, ruc, sector_id, activity_code, wallet)
select company_name, about, ruc, sector_id, activity_code, wallet
from smes;

alter table smes add column company_id uuid references companies(id);

update smes s
set company_id = c.id
from companies c
where c.ruc = s.ruc;

alter table smes alter column company_id set not null;

alter table smes drop column company_name;
alter table smes drop column about;
alter table smes drop column ruc;
alter table smes drop column sector_id;
alter table smes drop column activity_code;

create type operation_type as enum ('factoring', 'confirming');
create type settlement_method as enum ('settle_admin', 'settle_onchain');

create table analysts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  wallet text not null unique,
  created_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null,
  seller_sme_id uuid not null references smes(id),
  payer_company_id uuid not null references companies(id),
  invoice_number text not null,
  operation_type operation_type not null,
  settlement_method settlement_method not null default 'settle_admin',
  collection_date date not null,
  face_value_usdc bigint not null,
  advance_amount_usdc bigint not null,
  repayment_amount_usdc bigint not null,
  funding_amount_usdc bigint not null default 0,
  due_date timestamptz not null,
  settle_date timestamptz not null,
  document_path text,
  invoice_hash bytea,
  vault_pda text,
  shares_mint text,
  seller_wallet text,
  on_chain_status text not null default 'Funding',
  assessed_at timestamptz,
  payment_verified_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (seller_sme_id, invoice_id)
);

create table invoice_assessments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) unique,
  analyst_id uuid not null references analysts(id),
  rating text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table chain_events (
  id uuid primary key default gen_random_uuid(),
  signature text not null,
  slot bigint not null,
  event_name text not null,
  payload jsonb not null,
  invoice_id uuid references invoices(id),
  processed_at timestamptz not null default now(),
  unique (signature, event_name)
);

alter table companies enable row level security;
alter table analysts enable row level security;
alter table invoices enable row level security;
alter table invoice_assessments enable row level security;
alter table chain_events enable row level security;

-- public read for investor browse
create policy "companies_public_read" on companies for select using (true);
create policy "invoices_public_read" on invoices for select using (true);
create policy "assessments_public_read" on invoice_assessments for select using (true);

-- storage bucket for invoice PDFs
insert into storage.buckets (id, name, public)
values ('invoice-documents', 'invoice-documents', false)
on conflict (id) do nothing;

create policy "invoice_docs_sme_upload"
on storage.objects for insert
with check (bucket_id = 'invoice-documents');

create policy "invoice_docs_read"
on storage.objects for select
using (bucket_id = 'invoice-documents');
