import { ScrollView, Text, View, TouchableOpacity } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useRouter } from "expo-router";
import { FUTCardFIFA } from "@/components/fut-card-fifa";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const colors = useColors();
  const router = useRouter();

  if (!user) {
    return (
      <ScreenContainer className="flex items-center justify-center">
        <Text className="text-foreground text-lg">Chargement...</Text>
      </ScreenContainer>
    );
  }

  const eurValue = (user.unoPoints / 10).toFixed(2);
  const xpPercentage = (user.xp / 6000) * 100;

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border">
          <Text className="text-2xl font-bold text-foreground">Mon Profil</Text>
        </View>

        {/* FUT Card */}
        <View className="mx-4 mt-6 mb-6">
          <FUTCardFIFA player={user} />
        </View>

        {/* Profile Card */}
        <View className="mx-4 mt-0 bg-surface rounded-2xl p-6 border border-border">
          <View className="items-center mb-6">
            <Text className="text-6xl mb-3">{user.avatar || "👤"}</Text>
            <Text className="text-2xl font-bold text-foreground">{user.name}</Text>
            <View className="flex-row gap-2 mt-2">
              <View className="bg-primary/20 px-3 py-1 rounded-full">
                <Text className="text-primary font-semibold text-sm">Division {user.division}</Text>
              </View>
              <View className="bg-accent/20 px-3 py-1 rounded-full">
                <Text className="text-accent font-semibold text-sm">Niveau {user.level}</Text>
              </View>
            </View>
          </View>

          {/* Stats Grid */}
          <View className="grid grid-cols-2 gap-3">
            <View className="bg-background rounded-lg p-3 items-center">
              <Text className="text-muted text-xs mb-1">Points UNO</Text>
              <Text className="text-foreground font-bold text-lg">
                {user.unoPoints.toLocaleString()}
              </Text>
              <Text className="text-muted text-xs mt-1">{eurValue}€</Text>
            </View>
            <View className="bg-background rounded-lg p-3 items-center">
              <Text className="text-muted text-xs mb-1">Progression</Text>
              <Text className="text-foreground font-bold text-lg">{user.xp}</Text>
              <Text className="text-muted text-xs mt-1">/ 6000 XP</Text>
            </View>
          </View>
        </View>

        {/* XP Progress */}
        <View className="mx-4 mt-6 bg-surface rounded-xl p-4 border border-border">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground font-semibold">Progression Saison</Text>
            <Text className="text-muted text-sm">{Math.round(xpPercentage)}%</Text>
          </View>
          <View className="bg-background rounded-full h-3 overflow-hidden">
            <View
              className="bg-gradient-to-r from-primary to-accent h-full"
              style={{ width: `${Math.min(xpPercentage, 100)}%` }}
            />
          </View>
        </View>

        {/* Detailed Stats */}
        <View className="mx-4 mt-6 mb-4">
          <Text className="text-foreground font-bold text-lg mb-3">Statistiques Détaillées</Text>

          <View className="bg-surface rounded-xl border border-border overflow-hidden">
            {/* Goals */}
            <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Text className="text-2xl">⚽</Text>
                <View>
                  <Text className="text-foreground font-semibold text-sm">Buts Marqués</Text>
                  <Text className="text-muted text-xs">Meilleur buteur</Text>
                </View>
              </View>
              <Text className="text-foreground font-bold text-lg">{user.stats.goals}</Text>
            </View>

            {/* Assists */}
            <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Text className="text-2xl">🎯</Text>
                <View>
                  <Text className="text-foreground font-semibold text-sm">Passes Décisives</Text>
                  <Text className="text-muted text-xs">Meilleur passeur</Text>
                </View>
              </View>
              <Text className="text-foreground font-bold text-lg">{user.stats.assists}</Text>
            </View>

            {/* Defenses */}
            <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Text className="text-2xl">🛡️</Text>
                <View>
                  <Text className="text-foreground font-semibold text-sm">Défenses</Text>
                  <Text className="text-muted text-xs">Meilleur défenseur</Text>
                </View>
              </View>
              <Text className="text-foreground font-bold text-lg">{user.stats.defenses}</Text>
            </View>

            {/* Saves */}
            <View className="px-4 py-3 border-b border-border flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Text className="text-2xl">🧤</Text>
                <View>
                  <Text className="text-foreground font-semibold text-sm">Arrêts Réussis</Text>
                  <Text className="text-muted text-xs">Gardien</Text>
                </View>
              </View>
              <Text className="text-foreground font-bold text-lg">{user.stats.saves}</Text>
            </View>

            {/* MOTM */}
            <View className="px-4 py-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <Text className="text-2xl">🏆</Text>
                <View>
                  <Text className="text-foreground font-semibold text-sm">Homme du Match</Text>
                  <Text className="text-muted text-xs">MOTM</Text>
                </View>
              </View>
              <Text className="text-foreground font-bold text-lg">{user.stats.motm}</Text>
            </View>
          </View>
        </View>

        {/* Achievements */}
        <View className="mx-4 mb-6">
          <Text className="text-foreground font-bold text-lg mb-3">Récompenses</Text>
          <View className="bg-surface rounded-xl border border-border p-4">
            <View className="flex-row gap-3 mb-3">
              <View className="flex-1 items-center py-3 bg-background rounded-lg border border-primary/20">
                <Text className="text-2xl mb-1">🥇</Text>
                <Text className="text-foreground font-semibold text-xs">Player of the Month</Text>
                <Text className="text-muted text-xs mt-1">Mars 2026</Text>
              </View>
              <View className="flex-1 items-center py-3 bg-background rounded-lg border border-border">
                <Text className="text-2xl mb-1">🎖️</Text>
                <Text className="text-foreground font-semibold text-xs">Ballon d'Or</Text>
                <Text className="text-muted text-xs mt-1">À venir</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Edit Profile Button */}
        <View className="mx-4 mb-3">
          <TouchableOpacity
            onPress={() => router.push("/edit-profile" as any)}
            className="bg-primary/10 border border-primary rounded-lg py-3 px-4 flex-row items-center justify-center gap-2"
          >
            <Text className="text-xl">✏️</Text>
            <Text className="text-primary text-center font-semibold">Modifier mon profil</Text>
          </TouchableOpacity>
        </View>

        {/* Admin Button */}
        {user?.name === "Yassine" && (
          <View className="mx-4 mb-3">
            <TouchableOpacity
              onPress={() => router.push("/admin")}
              className="bg-warning/10 border border-warning rounded-lg py-3 px-4 flex-row items-center justify-center gap-2"
            >
              <Text className="text-xl">⚙️</Text>
              <Text className="text-warning text-center font-semibold">Admin Panel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Logout Button */}
        <View className="mx-4 mb-6">
          <TouchableOpacity
            onPress={logout}
            className="bg-error/10 border border-error rounded-lg py-3 px-4"
          >
            <Text className="text-error text-center font-semibold">Déconnexion</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
