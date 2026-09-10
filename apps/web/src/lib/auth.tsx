import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { LoginInput, SessionUser, SignupInput } from "@uno/shared";
import { sessionStore } from "./native.js";
import { trpc } from "./trpc.js";

/**
 * État d'authentification de l'application (AUTH-005, AUTH-006).
 *
 * Au démarrage, l'application interroge le serveur (`auth.me`) : c'est lui qui
 * décide si la session est valide. Le client ne conserve aucun secret hors du
 * jeton opaque, et jamais de mot de passe.
 */

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** Peut saisir les feuilles de match (SUP-001). L'admin l'est d'office. */
  isSupervisor: boolean;
  login: (input: LoginInput) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const loginMutation = trpc.auth.login.useMutation();
  const signupMutation = trpc.auth.signup.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  useEffect(() => {
    if (!meQuery.isLoading) setReady(true);
  }, [meQuery.isLoading]);

  const login = useCallback(
    async (input: LoginInput) => {
      const result = await loginMutation.mutateAsync(input);
      // Sur mobile empaqueté uniquement : le web s'appuie sur le cookie.
      await sessionStore.set(result.token);
      await queryClient.invalidateQueries();
    },
    [loginMutation, queryClient],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      const result = await signupMutation.mutateAsync(input);
      await sessionStore.set(result.token);
      await queryClient.invalidateQueries();
    },
    [signupMutation, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      // Même si l'appel échoue, on nettoie l'état local (AUTH-005).
      await sessionStore.clear();
      queryClient.clear();
      await meQuery.refetch();
    }
  }, [logoutMutation, queryClient, meQuery]);

  const value = useMemo<AuthContextValue>(() => {
    const user = meQuery.data ?? null;
    return {
      user,
      isLoading: !ready,
      isAuthenticated: user !== null,
      isAdmin: user?.role === "admin",
      isSupervisor: user?.isSupervisor ?? false,
      login,
      signup,
      logout,
    };
  }, [meQuery.data, ready, login, signup, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>");
  }
  return context;
}
