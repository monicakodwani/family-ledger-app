import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LedgerClientError } from "@family-ledger/shared";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { ReauthProvider } from "./auth/ReauthProvider";
import { LoadingScreen, SignInScreen, UnavailableScreen } from "./auth/SignInScreen";
import { useIdleTimeout } from "./auth/useIdleTimeout";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Toaster";
import { LedgerGate } from "./components/LedgerGate";
import { SESSION_ENDING_CODES } from "./data/types";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

const MoneyPage = lazy(() => import("./pages/MoneyPage"));
const AccountsPage = lazy(() => import("./pages/AccountsPage"));
const AddAccountPage = lazy(() => import("./pages/AddAccountPage"));
const AccountDetailPage = lazy(() => import("./pages/AccountDetailPage"));
const EditAccountPage = lazy(() => import("./pages/EditAccountPage"));
const UpdateAmountPage = lazy(() => import("./pages/UpdateAmountPage"));
const PlansPage = lazy(() => import("./pages/PlansPage"));
const NewPlanPage = lazy(() => import("./pages/NewPlanPage"));
const PlanDetailPage = lazy(() => import("./pages/PlanDetailPage"));
const MorePage = lazy(() => import("./pages/MorePage"));
const NotesPage = lazy(() => import("./pages/NotesPage"));
const NewNotePage = lazy(() => import("./pages/NewNotePage"));
const NoteDetailPage = lazy(() => import("./pages/NoteDetailPage"));
const ChecksPage = lazy(() => import("./pages/ChecksPage"));
const DocumentsPage = lazy(() => import("./pages/DocumentsPage"));
const ActivityPage = lazy(() => import("./pages/ActivityPage"));
const ArchivedPage = lazy(() => import("./pages/ArchivedPage"));
const SecurityPage = lazy(() => import("./pages/SecurityPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const HelpPage = lazy(() => import("./pages/HelpPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => {
        if (err instanceof LedgerClientError && (SESSION_ENDING_CODES.has(err.code) || err.code !== "unavailable"))
          return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});

function AuthGate({ children }: { children: ReactNode }) {
  const { status, session, signOut } = useAuth();
  useIdleTimeout(status === "signedIn" ? session?.idleTimeoutSeconds : undefined, () => void signOut("idle"));
  if (status === "loading") return <LoadingScreen />;
  if (status === "failed") return <UnavailableScreen />;
  if (status === "signedOut") return <SignInScreen />;
  return <>{children}</>;
}

function PageFallback() {
  return (
    <div role="status" aria-live="polite" className="py-16 text-center text-muted">
      Loading…
    </div>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary inline>
      <Suspense fallback={<PageFallback />}>
        <LedgerGate>{children}</LedgerGate>
      </Suspense>
    </ErrorBoundary>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          index
          element={
            <Page>
              <HomePage />
            </Page>
          }
        />
        <Route
          path="money"
          element={
            <Page>
              <MoneyPage />
            </Page>
          }
        />
        <Route
          path="accounts"
          element={
            <Page>
              <AccountsPage />
            </Page>
          }
        />
        <Route
          path="accounts/new"
          element={
            <Page>
              <AddAccountPage />
            </Page>
          }
        />
        <Route
          path="accounts/:id"
          element={
            <Page>
              <AccountDetailPage />
            </Page>
          }
        />
        <Route
          path="accounts/:id/edit"
          element={
            <Page>
              <EditAccountPage />
            </Page>
          }
        />
        <Route
          path="accounts/:id/update-amount"
          element={
            <Page>
              <UpdateAmountPage />
            </Page>
          }
        />
        <Route
          path="plans"
          element={
            <Page>
              <PlansPage />
            </Page>
          }
        />
        <Route
          path="plans/new"
          element={
            <Page>
              <NewPlanPage />
            </Page>
          }
        />
        <Route
          path="plans/:id"
          element={
            <Page>
              <PlanDetailPage />
            </Page>
          }
        />
        <Route
          path="more"
          element={
            <Page>
              <MorePage />
            </Page>
          }
        />
        <Route
          path="notes"
          element={
            <Page>
              <NotesPage />
            </Page>
          }
        />
        <Route
          path="notes/new"
          element={
            <Page>
              <NewNotePage />
            </Page>
          }
        />
        <Route
          path="notes/:id"
          element={
            <Page>
              <NoteDetailPage />
            </Page>
          }
        />
        <Route
          path="checks"
          element={
            <Page>
              <ChecksPage />
            </Page>
          }
        />
        <Route
          path="documents"
          element={
            <Page>
              <DocumentsPage />
            </Page>
          }
        />
        <Route
          path="activity"
          element={
            <Page>
              <ActivityPage />
            </Page>
          }
        />
        <Route
          path="archived"
          element={
            <Page>
              <ArchivedPage />
            </Page>
          }
        />
        <Route
          path="security"
          element={
            <Page>
              <SecurityPage />
            </Page>
          }
        />
        <Route
          path="settings"
          element={
            <Page>
              <SettingsPage />
            </Page>
          }
        />
        <Route
          path="help/separate-steps"
          element={
            <Page>
              <HelpPage />
            </Page>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
          <ToastProvider>
            <AuthProvider>
              <ReauthProvider>
                <AuthGate>
                  <AppRoutes />
                </AuthGate>
              </ReauthProvider>
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
