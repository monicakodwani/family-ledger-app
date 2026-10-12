/**
 * Optional provider-side revocation through the Supabase Auth Admin API.
 * Our own session registry already enforces revocation for this API; this
 * additionally stops Supabase from refreshing tokens or signing the person in.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY, which is powerful. Keep the Supabase
 * project dedicated to Family Ledger authentication (no other data) and store
 * the key only as a Worker secret.
 */
export interface ProviderAdmin {
  setBanned(authUserId: string, banned: boolean): Promise<boolean>;
  signOutEverywhere(userAccessToken: string): Promise<boolean>;
}

export function createSupabaseAdmin(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetch?: typeof fetch;
}): ProviderAdmin {
  const base = opts.supabaseUrl.replace(/\/$/, "");
  const f = opts.fetch ?? fetch;
  return {
    async setBanned(authUserId, banned) {
      if (!/^[0-9a-f-]{36}$/i.test(authUserId)) return false;
      try {
        const res = await f(`${base}/auth/v1/admin/users/${authUserId}`, {
          method: "PUT",
          headers: {
            apikey: opts.serviceRoleKey,
            Authorization: `Bearer ${opts.serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ban_duration: banned ? "876000h" : "none" }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    async signOutEverywhere(userAccessToken) {
      try {
        const res = await f(`${base}/auth/v1/logout?scope=global`, {
          method: "POST",
          headers: { apikey: opts.serviceRoleKey, Authorization: `Bearer ${userAccessToken}` },
        });
        return res.ok || res.status === 204;
      } catch {
        return false;
      }
    },
  };
}
