import { useCallback } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LedgerClientError,
  todayIST,
  type Command,
  type CommandResponse,
  type LedgerState,
} from "@family-ledger/shared";
import { useSignedIn } from "../auth/AuthProvider";
import { ReauthCancelled, useSensitive } from "../auth/ReauthProvider";
import { useToast } from "../components/Toaster";
import { t } from "../i18n";
import { SESSION_ENDING_CODES } from "./types";

export const qk = {
  ledger: ["ledger"] as const,
  audit: (params: { q?: string; entityId?: string }) => ["audit", params] as const,
  security: ["security"] as const,
  snapshots: ["snapshots"] as const,
};

export function useLedger() {
  const { client } = useSignedIn();
  return useQuery({ queryKey: qk.ledger, queryFn: () => client.getLedger(), select: (r) => r.ledger });
}

/** The ledger, assuming a parent already waited for it (see LedgerGate). */
export function useLedgerData(): LedgerState {
  const { data } = useLedger();
  if (!data) throw new Error("Ledger not loaded yet");
  return data;
}

export function useToday(): string {
  return todayIST();
}

export function useMe() {
  const { session } = useSignedIn();
  return session.member;
}

/** Shows a friendly toast for an error, unless the app already handles it elsewhere. */
export function useErrorToast() {
  const toast = useToast();
  return useCallback(
    (err: unknown) => {
      if (err instanceof ReauthCancelled) return;
      if (err instanceof LedgerClientError) {
        if (SESSION_ENDING_CODES.has(err.code)) return;
        toast.error(err.message);
        return;
      }
      toast.error("Something went wrong. Your information is safe. Please try again.");
    },
    [toast],
  );
}

export interface CommandOptions {
  successMessage?: string | false;
  /** Let the caller handle version conflicts (e.g. to show "Chandra changed this…"). */
  onConflict?: (current: unknown) => void;
}

/** Send one command. Updates the cached ledger, refreshes activity, and confirms with a toast. */
export function useCommand() {
  const { client } = useSignedIn();
  const queryClient = useQueryClient();
  const toast = useToast();
  const showError = useErrorToast();
  const sensitive = useSensitive();

  const mutation = useMutation({
    mutationFn: (command: Command) => sensitive(() => client.sendCommand(command)),
  });

  return useCallback(
    async (command: Command, options: CommandOptions = {}): Promise<CommandResponse | null> => {
      try {
        const res = await mutation.mutateAsync(command);
        queryClient.setQueryData(qk.ledger, { ledger: res.ledger, revision: res.revision });
        void queryClient.invalidateQueries({ queryKey: ["audit"] });
        if (options.successMessage !== false) toast.success(options.successMessage ?? t("toast.saved"));
        return res;
      } catch (err) {
        if (err instanceof LedgerClientError && err.code === "version_conflict" && options.onConflict) {
          void queryClient.invalidateQueries({ queryKey: qk.ledger });
          options.onConflict(err.current);
          return null;
        }
        showError(err);
        return null;
      }
    },
    [mutation, queryClient, toast, showError],
  );
}

export function useAudit(params: { q?: string; entityId?: string } = {}) {
  const { client } = useSignedIn();
  return useInfiniteQuery({
    queryKey: qk.audit(params),
    queryFn: ({ pageParam }) => client.getAudit({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useSecurity() {
  const { client } = useSignedIn();
  return useQuery({ queryKey: qk.security, queryFn: () => client.getSecurity() });
}

export function useSnapshots() {
  const { client } = useSignedIn();
  return useQuery({ queryKey: qk.snapshots, queryFn: () => client.listSnapshots() });
}
