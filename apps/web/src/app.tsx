import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth.js";
import { createTrpcClient, trpc } from "./lib/trpc.js";
import { confirmAppReady } from "./lib/native.js";
import { LoadingState } from "./components/ui/index.js";
import { TabBar } from "./components/layout/index.js";
import { FutCardShape } from "./components/fut-card/fut-card.js";

import { LandingScreen } from "./screens/landing.js";
import { LoginScreen } from "./screens/login.js";
import { SignupScreen } from "./screens/signup.js";
import { HomeScreen } from "./screens/home.js";
import { CalendarScreen } from "./screens/calendar.js";
import { ProposalDetailScreen } from "./screens/proposal-detail.js";
import { RankingScreen } from "./screens/ranking.js";
import { WalletScreen } from "./screens/wallet.js";
import { SendUnoScreen } from "./screens/wallet-send.js";
import { TransactionsScreen } from "./screens/transactions.js";
import { ProfileScreen } from "./screens/profile.js";
import { EditProfileScreen } from "./screens/edit-profile.js";
import { ChangePasswordScreen } from "./screens/change-password.js";
import { ShopScreen } from "./screens/shop.js";
import { ProductDetailScreen } from "./screens/product-detail.js";
import { OrdersScreen } from "./screens/orders.js";
import { ModesScreen } from "./screens/modes.js";
import { InfoScreen } from "./screens/info.js";
import { AnnouncementsScreen } from "./screens/announcements.js";
import { AdminScreen } from "./screens/admin/index.js";
import {
  TrackerCaptureScreen,
  TrackerSessionList,
} from "./screens/tracker/index.js";

/**
 * Racine de l'application.
 *
 * React Query est configuré pour un usage mobile : les données restent
 * affichées pendant leur rafraîchissement (pas d'écran blanc au retour dans
 * l'application) et les mutations ne sont jamais rejouées automatiquement —
 * une opération financière ne doit pas partir deux fois sans clé
 * d'idempotence explicite (STATE-002).
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          const status = (error as { data?: { httpStatus?: number } })?.data?.httpStatus;
          // Inutile de réessayer une erreur d'autorisation ou de règle métier.
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  const [trpcClient] = useState(() => createTrpcClient());

  // L'application est montée et utilisable : on le confirme au module de mise
  // à jour, faute de quoi il reviendrait à la version précédente en croyant
  // celle-ci défaillante.
  useEffect(() => {
    void confirmAppReady();
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {/* Silhouette des cartes joueur : déclarée une seule fois pour
              tout le document, puis référencée par chaque carte. */}
          <FutCardShape />
          <Router />
        </AuthProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

/** Redirige vers la connexion tant qu'aucune session valide n'est établie. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingState label="Chargement de votre session..." />;
  if (!isAuthenticated) {
    return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Réservé aux administrateurs : le rôle est celui renvoyé par le serveur. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, isLoading } = useAuth();
  if (isLoading) return <LoadingState />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeOrLanding() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingState label="Chargement de votre session..." />;
  return isAuthenticated ? <HomeScreen /> : <LandingScreen />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingState />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const TAB_ROUTES = ["/", "/calendrier", "/classement", "/wallet", "/profil"];

function Router() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const showTabBar = isAuthenticated && TAB_ROUTES.includes(location.pathname);

  return (
    <>
      <Routes>
        <Route
          path="/bienvenue"
          element={
            <PublicOnly>
              <LandingScreen />
            </PublicOnly>
          }
        />
        <Route
          path="/connexion"
          element={
            <PublicOnly>
              <LoginScreen />
            </PublicOnly>
          }
        />
        <Route
          path="/inscription"
          element={
            <PublicOnly>
              <SignupScreen />
            </PublicOnly>
          }
        />

        {/* Un visiteur non connecté arrivant à la racine voit la page de
            présentation, pas le formulaire de connexion : c'est le premier
            contact avec le produit. */}
        <Route path="/" element={<HomeOrLanding />} />
        <Route path="/calendrier" element={<RequireAuth><CalendarScreen /></RequireAuth>} />
        <Route path="/sessions/:proposalId" element={<RequireAuth><ProposalDetailScreen /></RequireAuth>} />
        <Route path="/classement" element={<RequireAuth><RankingScreen /></RequireAuth>} />
        <Route path="/wallet" element={<RequireAuth><WalletScreen /></RequireAuth>} />
        <Route path="/wallet/envoyer" element={<RequireAuth><SendUnoScreen /></RequireAuth>} />
        <Route path="/wallet/transactions" element={<RequireAuth><TransactionsScreen /></RequireAuth>} />
        <Route path="/profil" element={<RequireAuth><ProfileScreen /></RequireAuth>} />
        <Route path="/profil/modifier" element={<RequireAuth><EditProfileScreen /></RequireAuth>} />
        <Route path="/profil/mot-de-passe" element={<RequireAuth><ChangePasswordScreen /></RequireAuth>} />
        <Route path="/boutique" element={<RequireAuth><ShopScreen /></RequireAuth>} />
        <Route path="/boutique/:shopItemId" element={<RequireAuth><ProductDetailScreen /></RequireAuth>} />
        <Route path="/commandes" element={<RequireAuth><OrdersScreen /></RequireAuth>} />
        <Route path="/modes" element={<RequireAuth><ModesScreen /></RequireAuth>} />
        <Route path="/infos" element={<RequireAuth><InfoScreen /></RequireAuth>} />
        <Route path="/annonces" element={<RequireAuth><AnnouncementsScreen /></RequireAuth>} />
        <Route path="/admin/tracker" element={<RequireAuth><RequireAdmin><TrackerSessionList /></RequireAdmin></RequireAuth>} />
        <Route path="/admin/tracker/:sessionId" element={<RequireAuth><RequireAdmin><TrackerCaptureScreen /></RequireAdmin></RequireAuth>} />
        <Route path="/admin/*" element={<RequireAuth><RequireAdmin><AdminScreen /></RequireAdmin></RequireAuth>} />

        <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/bienvenue"} replace />} />
      </Routes>

      {showTabBar && <TabBar />}
    </>
  );
}
