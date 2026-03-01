import { ScrollView, Text, View, TouchableOpacity, TextInput, Modal, Alert } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";
import { useRouter } from "expo-router";

export default function AdminScreen() {
  const { user, logout } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(true);

  const ADMIN_EMAIL = "portedehal@gmail.com";
  const ADMIN_PASSWORD = "admin123"; // In production, use secure authentication

  const handleAdminLogin = () => {
    if (adminEmail === ADMIN_EMAIL && adminPassword === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setShowLoginModal(false);
      setAdminEmail("");
      setAdminPassword("");
    } else {
      Alert.alert("Erreur", "Email ou mot de passe incorrect");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setShowLoginModal(true);
    setAdminEmail("");
    setAdminPassword("");
  };

  if (!isAuthenticated) {
    return (
      <ScreenContainer className="flex-1 bg-background items-center justify-center">
        <Modal
          visible={showLoginModal}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View className="flex-1 bg-black/50 items-center justify-center">
            <View className="bg-surface rounded-2xl p-6 w-80 border border-border">
              <Text className="text-foreground font-bold text-2xl text-center mb-6">
                Admin Panel
              </Text>

              <View className="mb-4">
                <Text className="text-foreground font-semibold text-sm mb-2">Email</Text>
                <TextInput
                  placeholder="portedehal@gmail.com"
                  placeholderTextColor={colors.muted}
                  value={adminEmail}
                  onChangeText={setAdminEmail}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-foreground"
                />
              </View>

              <View className="mb-6">
                <Text className="text-foreground font-semibold text-sm mb-2">Mot de passe</Text>
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                  value={adminPassword}
                  onChangeText={setAdminPassword}
                  secureTextEntry
                  className="bg-background border border-border rounded-lg px-3 py-2 text-foreground"
                />
              </View>

              <TouchableOpacity
                onPress={handleAdminLogin}
                className="bg-primary rounded-lg py-3 mb-3"
              >
                <Text className="text-white text-center font-bold">Se connecter</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.back()}
                className="bg-surface border border-border rounded-lg py-3"
              >
                <Text className="text-foreground text-center font-semibold">Retour</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-foreground">Admin Panel</Text>
            <Text className="text-muted text-sm mt-1">Gestion UNO League</Text>
          </View>
          <TouchableOpacity
            onPress={handleLogout}
            className="bg-error/10 px-3 py-2 rounded-lg border border-error/20"
          >
            <Text className="text-error text-xs font-bold">Déconnexion</Text>
          </TouchableOpacity>
        </View>

        {/* KPI Dashboard */}
        <View className="px-4 mt-6 mb-6">
          <Text className="text-foreground font-bold text-lg mb-3">Tableau de Bord</Text>
          <View className="flex-row gap-3 mb-3">
            <View className="flex-1 bg-primary/10 rounded-xl p-4 border border-primary/20">
              <Text className="text-muted text-xs mb-1">Joueurs Actifs</Text>
              <Text className="text-foreground font-bold text-2xl">247</Text>
            </View>
            <View className="flex-1 bg-success/10 rounded-xl p-4 border border-success/20">
              <Text className="text-muted text-xs mb-1">Sessions Jouées</Text>
              <Text className="text-foreground font-bold text-2xl">1,243</Text>
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 bg-warning/10 rounded-xl p-4 border border-warning/20">
              <Text className="text-muted text-xs mb-1">UNO Distribués</Text>
              <Text className="text-foreground font-bold text-2xl">125K</Text>
            </View>
            <View className="flex-1 bg-accent/10 rounded-xl p-4 border border-accent/20">
              <Text className="text-muted text-xs mb-1">Revenus (€)</Text>
              <Text className="text-foreground font-bold text-2xl">12.5K</Text>
            </View>
          </View>
        </View>

        {/* Management Sections */}
        <View className="px-4 mb-6">
          <Text className="text-foreground font-bold text-lg mb-3">Gestion</Text>

          {/* Webshop Management */}
          <TouchableOpacity className="bg-surface rounded-xl p-4 border border-border mb-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1">
                <Text className="text-2xl">🛍️</Text>
                <View>
                  <Text className="text-foreground font-bold">Webshop</Text>
                  <Text className="text-muted text-xs">Gérer les produits</Text>
                </View>
              </View>
              <Text className="text-2xl">→</Text>
            </View>
            <View className="mt-3 pt-3 border-t border-border">
              <Text className="text-muted text-xs mb-2">Actions rapides :</Text>
              <View className="flex-row gap-2">
                <TouchableOpacity className="flex-1 bg-primary/10 rounded-lg py-2 px-2">
                  <Text className="text-primary text-xs font-bold text-center">+ Produit</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-warning/10 rounded-lg py-2 px-2">
                  <Text className="text-warning text-xs font-bold text-center">Modifier</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-error/10 rounded-lg py-2 px-2">
                  <Text className="text-error text-xs font-bold text-center">Supprimer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>

          {/* Player Management */}
          <TouchableOpacity className="bg-surface rounded-xl p-4 border border-border mb-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1">
                <Text className="text-2xl">👥</Text>
                <View>
                  <Text className="text-foreground font-bold">Joueurs</Text>
                  <Text className="text-muted text-xs">Gérer les points UNO</Text>
                </View>
              </View>
              <Text className="text-2xl">→</Text>
            </View>
            <View className="mt-3 pt-3 border-t border-border">
              <Text className="text-muted text-xs mb-2">Actions rapides :</Text>
              <View className="flex-row gap-2">
                <TouchableOpacity className="flex-1 bg-success/10 rounded-lg py-2 px-2">
                  <Text className="text-success text-xs font-bold text-center">+ Points</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-error/10 rounded-lg py-2 px-2">
                  <Text className="text-error text-xs font-bold text-center">- Points</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-primary/10 rounded-lg py-2 px-2">
                  <Text className="text-primary text-xs font-bold text-center">Voir</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>

          {/* Statistics */}
          <TouchableOpacity className="bg-surface rounded-xl p-4 border border-border">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3 flex-1">
                <Text className="text-2xl">📊</Text>
                <View>
                  <Text className="text-foreground font-bold">Statistiques</Text>
                  <Text className="text-muted text-xs">Rapports détaillés</Text>
                </View>
              </View>
              <Text className="text-2xl">→</Text>
            </View>
            <View className="mt-3 pt-3 border-t border-border">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-muted text-xs">Joueurs par division</Text>
                <Text className="text-foreground font-bold text-sm">D1: 82 | D2: 95 | D3: 70</Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-muted text-xs">Taux de participation</Text>
                <Text className="text-foreground font-bold text-sm">87.3%</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Admin Info */}
        <View className="mx-4 mb-6 bg-primary/10 rounded-xl p-4 border border-primary/20">
          <Text className="text-primary font-bold text-sm mb-2">💡 Info Admin</Text>
          <Text className="text-muted text-xs">
            Vous êtes connecté en tant qu'administrateur. Vous avez accès à la gestion complète de l'application UNO League.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
