/** Build-time configuration. VITE_APP_MODE is fixed by vite.config.ts. */
export const APP_MODE: "demo" | "connected" = import.meta.env.VITE_APP_MODE === "demo" ? "demo" : "connected";
export const IS_DEMO = APP_MODE === "demo";

export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
export const SUPABASE_URL: string = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
export const SUPABASE_PUBLISHABLE_KEY: string =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? "";
