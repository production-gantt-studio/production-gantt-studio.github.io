-- 管理者の通常メール未達を回避するWebAuthn Passkey。
-- 秘密鍵は端末認証器だけに保持され、DBには公開鍵と検証に必要なメタデータだけを保存する。

create table if not exists public.passkey_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  webauthn_user_id text not null,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports jsonb not null default '[]'::jsonb,
  device_type text not null check (device_type in ('singleDevice', 'multiDevice')),
  backed_up boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists passkey_credentials_user_idx on public.passkey_credentials(user_id);
create unique index if not exists passkey_credentials_webauthn_user_idx on public.passkey_credentials(webauthn_user_id, user_id);

create table if not exists public.passkey_challenges (
  id uuid primary key default gen_random_uuid(),
  purpose text not null check (purpose in ('registration', 'authentication')),
  user_id uuid references public.profiles(id) on delete cascade,
  webauthn_user_id text,
  challenge text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists passkey_challenges_expiry_idx on public.passkey_challenges(expires_at);

alter table public.passkey_credentials enable row level security;
alter table public.passkey_challenges enable row level security;
revoke all on public.passkey_credentials from anon, authenticated;
revoke all on public.passkey_challenges from anon, authenticated;

comment on table public.passkey_credentials is 'WebAuthn Passkey public credentials. Service-role Edge Functions only.';
comment on table public.passkey_challenges is 'Single-use five-minute WebAuthn ceremony challenges. Service-role Edge Functions only.';
