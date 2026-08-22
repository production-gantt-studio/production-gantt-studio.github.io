create table if not exists public.admin_passkey_bootstrap_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_passkey_bootstrap_tokens_expiry_idx on public.admin_passkey_bootstrap_tokens(expires_at);
alter table public.admin_passkey_bootstrap_tokens enable row level security;
revoke all on public.admin_passkey_bootstrap_tokens from anon, authenticated;
comment on table public.admin_passkey_bootstrap_tokens is 'Single-use admin-only bootstrap tokens for first Passkey enrollment. Service-role Edge Function only.';
