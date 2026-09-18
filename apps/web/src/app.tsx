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
import { ForgotPasswordScreen } from "./screens/forgot-password.js";
import { ResetPasswordScreen } from "./screens/reset-password.js";
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
import { SessionEntryScreen } from "./screens/session-entry.js";
import { ShopSuggestScreen } from "./screens/shop-suggest.js";
import { ModesScreen } from "./screens/modes.js";
import { InfoScreen } from "./screens/info.js";
import { AnnouncementsScreen } from "./screens/announcements.js";
import { AdminScreen } from "./screens/admin/index.js";
import { SquadRosterScreen } from "./screens/squad/roster.js";
import { TournamentsScreen } from "./screens/tournaments/index.js";
import { TournamentDetailScreen } from "./screens/tournaments/detail.js";
import { SquadHomeScreen } from "@/screens/squad/index.js";
import { SquadCreateScreen } from "@/screens/squad/create.js";
import { SquadProfileScreen } from "@/screens/squad/profile.js";
import { SquadManageScreen } from "@/screens/squad/manage.js";
import { SquadTransfersScreen } from "@/screens/squad/transfers.js";
import { StatisticsScreen } from "@/screens/statistics.js";
import {
  SquadChallengeCreateScreen,
  SquadChallengeScreen,
  SquadChallengesScreen,
} from "@/screens/squad/challenges.js";
import { SupervisionScreen } from "./screens/supervision.js";
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

/**
 * Réservé aux superviseurs (SUP-001).
 *
 * Ce garde n'est qu'une commodité de navigation : chaque route de saisie
 * revérifie le droit en base, et le refuse même si l'écran s'ouvre.
 */
function RequireSupervisor({ children }: { children: ReactNode }) {
  const { isSupervisor, isLoading } = useAuth();
  if (isLoading) return <LoadingState />;
  if (!isSupervisor) return <Navigate to="/" replace />;
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

/**
 * Écrans où la barre d'onglets reste visible.
 *
 * Elle est la sortie de secours de l'application : un écran qui n'y figure pas
 * ne peut être quitté que par la flèche de son en-tête. La console
 * d'administration en fait partie depuis qu'on y saisit des feuilles de match
 * de plus de deux mille pixels, où le haut de l'écran finit hors de vue.
 */
const TAB_ROUTES = [
  "/",
  "/calendrier",
  "/classement",
  "/wallet",
  "/profil",
  "/admin",
  "/supervision",
  "/squad",
];

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
          path="/mot-de-passe-oublie"
          element={
            <PublicOnly>
              <ForgotPasswordScreen />
            </PublicOnly>
          }
        />
        {/*
          Pas de `PublicOnly` sur la pose du nouveau mot de passe.

          Le cas se produit vraiment : on reste connecté sur son téléphone,
          on ouvre le lien reçu par courrier, et une session valable est là.
          Renvoyer alors vers l'accueil rendrait le lien inutilisable
          précisément pour qui en a le plus besoin — celui dont le compte est
          ouvert quelque part et qui veut en reprendre le contrôle.
        */}
        <Route path="/mot-de-passe/:token" element={<ResetPasswordScreen />} />
        {/*
          Pas de `PublicOnly` ici, contrairement à la connexion : l'écran
          d'inscription continue après la création du compte — il enchaîne sur
          la photo du joueur (PHOTO-001). Le renvoyer vers l'accueil dès que la
          session existe couperait l'étape en deux.
        */}
        <Route path="/inscription" element={<SignupScreen />} />

        {/* Un visiteur non connecté arrivant à la racine voit la page de
            présentation, pas le formulaire de connexion : c'est le premier
            contact avec le produit. */}
        <Route path="/" element={<HomeOrLanding />} />
        <Route path="/calendrier" element={<RequireAuth><CalendarScreen /></RequireAuth>} />
        <Route path="/sessions/:proposalId" element={<RequireAuth><ProposalDetailScreen /></RequireAuth>} />
        {/*
          MATCH-003 : la feuille d'une session s'ouvre aussi depuis la session,
          et pas seulement depuis la file d'attente de la console — un match
          SQUAD n'y entre qu'après son coup d'envoi (SQUAD-005).
        */}
        <Route path="/sessions/:proposalId/saisie" element={<RequireAuth><RequireAdmin><SessionEntryScreen /></RequireAdmin></RequireAuth>} />
        <Route path="/classement" element={<RequireAuth><RankingScreen /></RequireAuth>} />
        <Route path="/wallet" element={<RequireAuth><WalletScreen /></RequireAuth>} />
        <Route path="/wallet/envoyer" element={<RequireAuth><SendUnoScreen /></RequireAuth>} />
        <Route path="/wallet/transactions" element={<RequireAuth><TransactionsScreen /></RequireAuth>} />
        <Route path="/profil" element={<RequireAuth><ProfileScreen /></RequireAuth>} />
        <Route path="/profil/statistiques" element={<RequireAuth><StatisticsScreen /></RequireAuth>} />
        <Route path="/profil/modifier" element={<RequireAuth><EditProfileScreen /></RequireAuth>} />
        <Route path="/profil/mot-de-passe" element={<RequireAuth><ChangePasswordScreen /></RequireAuth>} />
        <Route path="/boutique" element={<RequireAuth><ShopScreen /></RequireAuth>} />
        {/* Avant la route paramétrée : « proposer » n'est pas un identifiant. */}
        <Route path="/boutique/proposer" element={<RequireAuth><ShopSuggestScreen /></RequireAuth>} />
        <Route path="/boutique/:shopItemId" element={<RequireAuth><ProductDetailScreen /></RequireAuth>} />
        <Route path="/commandes" element={<RequireAuth><OrdersScreen /></RequireAuth>} />
        <Route path="/modes" element={<RequireAuth><ModesScreen /></RequireAuth>} />
        <Route path="/infos" element={<RequireAuth><InfoScreen /></RequireAuth>} />
        <Route path="/annonces" element={<RequireAuth><AnnouncementsScreen /></RequireAuth>} />
        {/*
          Mode SQUAD (SQUAD-001). Les écrans existent toujours ; c'est le
          serveur qui décide si le mode est ouvert, et ses routes répondent
          « introuvable » quand il ne l'est pas. Masquer l'onglet ne suffirait
          pas : une adresse tapée à la main atteindrait l'écran.
        */}
        <Route path="/squad" element={<RequireAuth><SquadHomeScreen /></RequireAuth>} />
        <Route path="/squad/nouveau" element={<RequireAuth><SquadCreateScreen /></RequireAuth>} />
        <Route path="/squad/:squadId/effectif" element={<RequireAuth><SquadRosterScreen /></RequireAuth>} />
        <Route path="/squad/:squadId/gerer" element={<RequireAuth><SquadManageScreen /></RequireAuth>} />
        <Route path="/squad/:squadId/transferts" element={<RequireAuth><SquadTransfersScreen /></RequireAuth>} />
        <Route path="/squad/:squadId/defis" element={<RequireAuth><SquadChallengesScreen /></RequireAuth>} />
        <Route path="/squad/:squadId/defis/nouveau" element={<RequireAuth><SquadChallengeCreateScreen /></RequireAuth>} />
        <Route path="/squad/defis/:challengeId" element={<RequireAuth><SquadChallengeScreen /></RequireAuth>} />
        <Route path="/tournois" element={<RequireAuth><TournamentsScreen /></RequireAuth>} />
        <Route path="/tournois/:tournamentId" element={<RequireAuth><TournamentDetailScreen /></RequireAuth>} />
        {/* Après les routes fixes : `/squad/:slug` avalerait « /squad/tournois ». */}
        <Route path="/squad/:slug" element={<RequireAuth><SquadProfileScreen /></RequireAuth>} />

        <Route path="/supervision" element={<RequireAuth><RequireSupervisor><SupervisionScreen /></RequireSupervisor></RequireAuth>} />
        {/*
          SUP-001 : la saisie en visionnage suit le droit de supervision, pas
          le rôle d'administrateur — c'est précisément ce qu'un superviseur est
          nommé pour faire. Elle quitte donc le préfixe /admin, qui promettait
          l'inverse à qui lisait l'adresse.
        */}
        <Route path="/visionnage" element={<RequireAuth><RequireSupervisor><TrackerSessionList /></RequireSupervisor></RequireAuth>} />
        <Route path="/visionnage/:sessionId" element={<RequireAuth><RequireSupervisor><TrackerCaptureScreen /></RequireSupervisor></RequireAuth>} />
        <Route path="/admin/*" element={<RequireAuth><RequireAdmin><AdminScreen /></RequireAdmin></RequireAuth>} />

        <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/bienvenue"} replace />} />
      </Routes>

      {showTabBar && <TabBar />}
    </>
  );
}
