import { ScrollView, Text, View, TouchableOpacity, Pressable } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { UnoLeagueHeader } from "@/components/uno-league-header";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { announcements, matches } from "@/lib/mock-data";
import { useState } from "react";

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const [showMenu, setShowMenu] = useState(false);

  if (!user) {
    return (
      <ScreenContainer className="flex items-center justify-center">
        <Text className="text-foreground text-lg">Chargement...</Text>
      </ScreenContainer>
    );
  }

  const nextMatches = matches.slice(0, 3);
  const recentAnnouncements = announcements.slice(0, 2);
  const xpPercentage = (user.xp / 6000) * 100;

  return (
    <ScreenContainer className="flex-1 bg-background">
      <UnoLeagueHeader unoBalance={user.unoPoints || 0} showBalance={true} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header with Profile and Menu */}
        <View className="px-4 pt-4 pb-6 border-b border-border flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-sm text-muted">Bienvenue,</Text>
            <Text className="text-2xl font-bold text-foreground">{user.name}</Text>
            <Text className="text-xs text-muted mt-1">Division {user.division}</Text>
          </View>
          <Pressable
            onPress={() => setShowMenu(!showMenu)}
            style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
            className="w-12 h-12 rounded-full bg-surface flex items-center justify-center"
          >
            <Text className="text-2xl">{user.avatar || "👤"}</Text>
          </Pressable>
        </View>

        {/* Menu Dropdown */}
        {showMenu && (
          <View className="bg-surface mx-4 mt-2 rounded-lg border border-border overflow-hidden">
            <TouchableOpacity
              onPress={() => {
                setShowMenu(false);
              }}
              className="px-4 py-3 border-b border-border"
            >
              <Text className="text-foreground">Mon Profil Détaillé</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                logout();
                setShowMenu(false);
              }}
              className="px-4 py-3"
            >
              <Text className="text-error">Déconnexion</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Actions */}
        <View className="mx-4 mt-6 flex-row gap-3">
          <TouchableOpacity
            onPress={() => router.push("/calendar")}
            className="flex-1 bg-surface rounded-xl p-4 border border-border"
          >
            <IconSymbol name="calendar" size={24} color={colors.primary} />
            <Text className="text-foreground font-semibold mt-2 text-sm">Calendrier</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/wallet")}
            className="flex-1 bg-surface rounded-xl p-4 border border-border"
          >
            <IconSymbol name="wallet.pass" size={24} color={colors.primary} />
            <Text className="text-foreground font-semibold mt-2 text-sm">Wallet</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/shop" as any)}
            className="flex-1 bg-surface rounded-xl p-4 border border-border"
          >
            <IconSymbol name="bag.fill" size={24} color={colors.primary} />
            <Text className="text-foreground font-semibold mt-2 text-sm">Webshop</Text>
          </TouchableOpacity>
        </View>

        {/* XP Progress */}
        <View className="mx-4 mt-6 bg-surface rounded-xl p-4 border border-border">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground font-semibold">Progression Saison</Text>
            <Text className="text-muted text-sm">Niveau {user.level}</Text>
          </View>
          <View className="bg-background rounded-full h-2 overflow-hidden mb-2">
            <View
              className="bg-primary h-full"
              style={{ width: `${Math.min(xpPercentage, 100)}%` }}
            />
          </View>
          <Text className="text-muted text-xs">
            {user.xp} / 6000 XP
          </Text>
        </View>

        {/* Next Matches */}
        <View className="mx-4 mt-6 mb-4">
          <Text className="text-foreground font-bold text-lg mb-3">Prochains Matchs</Text>
          {nextMatches.map((match) => (
            <TouchableOpacity
              key={match.id}
              onPress={() => {}}
              className="bg-surface rounded-xl p-4 border border-border mb-3 flex-row items-center justify-between"
            >
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-1">
                  <Text className="text-primary font-bold text-sm">{match.division}</Text>
                  <Text className="text-muted text-xs">•</Text>
                  <Text className="text-muted text-xs">{match.date}</Text>
                </View>
                <Text className="text-foreground font-semibold">{match.time}</Text>
                <Text className="text-muted text-xs mt-1">
                  {match.participants}/{match.maxParticipants} joueurs
                </Text>
              </View>
              <View
                className={`px-3 py-1 rounded-full ${
                  match.status === "available"
                    ? "bg-success/20"
                    : match.status === "booked"
                      ? "bg-primary/20"
                      : "bg-error/20"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    match.status === "available"
                      ? "text-success"
                      : match.status === "booked"
                        ? "text-primary"
                        : "text-error"
                  }`}
                >
                  {match.status === "available"
                    ? "Disponible"
                    : match.status === "booked"
                      ? "Réservé"
                      : "Complet"}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Announcements */}
        <View className="mx-4 mb-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground font-bold text-lg">Annonces</Text>
            <TouchableOpacity onPress={() => {}}>
              <Text className="text-primary text-sm font-semibold">Voir tout</Text>
            </TouchableOpacity>
          </View>
          {recentAnnouncements.map((ann) => (
            <TouchableOpacity
              key={ann.id}
              onPress={() => {}}
              className={`bg-surface rounded-xl p-4 border border-border mb-3 ${
                !ann.read ? "border-primary/50" : ""
              }`}
            >
              <View className="flex-row items-start gap-3">
                <Text className="text-xl">
                  {ann.type === "reward"
                    ? "🏆"
                    : ann.type === "alert"
                      ? "⚠️"
                      : ann.type === "maintenance"
                        ? "🔧"
                        : "ℹ️"}
                </Text>
                <View className="flex-1">
                  <Text className="text-foreground font-semibold">{ann.title}</Text>
                  <Text className="text-muted text-xs mt-1">{ann.date}</Text>
                </View>
                {!ann.read && <View className="w-2 h-2 rounded-full bg-primary mt-2" />}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
