import type { AuthAdapter } from "../auth/types";
import type { AppClient } from "./types";

/**
 * Loads the right client for this build. VITE_APP_MODE is replaced at build
 * time, so the unused branch (and its dynamic import) is removed: connected
 * builds never contain the demo client or its fictional seed data, and demo
 * builds never contain the Supabase/HTTP client.
 */
export async function createAppClient(): Promise<{ client: AppClient; auth: AuthAdapter }> {
  if (import.meta.env.VITE_APP_MODE === "demo") {
    const [{ DemoLedgerClient }, { demoAuthAdapter }] = await Promise.all([
      import("./demoClient"),
      import("../auth/types"),
    ]);
    return { client: new DemoLedgerClient({ latencyMs: 60 }), auth: demoAuthAdapter };
  } else {
    const [{ HttpLedgerClient }, { createConnectedAuth }, env] = await Promise.all([
      import("./httpClient"),
      import("../auth/connectedAuth"),
      import("../env"),
    ]);
    const auth = createConnectedAuth();
    const client = new HttpLedgerClient({ baseUrl: env.API_BASE_URL, getAccessToken: () => auth.getAccessToken() });
    return { client, auth };
  }
}
