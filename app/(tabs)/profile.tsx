import { Text, View, ScrollView, TouchableOpacity, Pressable } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import { FUTCardReal } from "@/components/fut-card-real";
import { UnoLeagueHeader } from "@/components/uno-league-header";
import { useState } from "react";
import { useProposals } from "@/lib/proposals-context";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { proposals } = useProposals();
  const router = useRouter();
  const [statsView, setStatsView] = useState<'list' | 'chart'>('list');

  if (!user) {
    return (
      <ScreenContainer className="flex items-center justify-center">
        <Text className="text-foreground text-lg">Chargement...</Text>
      </ScreenContainer>
    );
  }

  const currentUserOpenId = user.email ?? user.openId;

  // Sessions the current user has participated in
  const userSessions = proposals.filter(
    (p) =>
      p.status === 'session' &&
      p.participants.some((x) => x.id === currentUserOpenId),
  );

  const xpPercentage = (user.xp / 6000) * 100;
  const statItems = [
    { label: 'Buts', value: user?.statsGoals ?? 0 },
    { label: 'Passes', value: user?.statsAssists ?? 0 },
    { label: 'Défenses', value: user?.statsDefenses ?? 0 },
    { label: 'Arrêts', value: user?.statsSaves ?? 0 },
    { label: 'MOTM', value: user?.statsMotm ?? 0 },
  ];
  const maxStat = Math.max(...statItems.map((s) => s.value ?? 0), 1);

  return (
    <ScreenContainer className="flex-1 bg-background">
      <UnoLeagueHeader unoBalance={user?.unoPoints ?? 0} showBalance={true} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border">
          <Text className="text-2xl font-bold text-foreground">Mon Profil</Text>
        </View>

        {/* FUT Card */}
        {user && (
          <View className="mx-4 mt-6 mb-6">
            <FUTCardReal player={user} />
          </View>
        )}

        {/* Profile Card */}
        <View className="mx-4 mt-0 bg-surface rounded-2xl p-6 border border-border">
          <View className="items-center mb-6">
            {/* Banderolle — replaces the emoji */}
            <View className="w-full bg-primary rounded-lg py-2 px-4 items-center mb-4">
              <Text className="text-white font-bold tracking-widest text-sm">UNO LEAGUE</Text>
            </View>
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
                {(user.unoPoints ?? 0).toLocaleString()}
              </Text>
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
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground font-bold text-lg">Statistiques Détaillées</Text>
            {/* Toggle list / chart */}
            <View className="flex-row gap-1">
              <TouchableOpacity
                onPress={() => setStatsView('list')}
                className={`px-3 py-1 rounded-lg border ${statsView === 'list' ? 'bg-primary border-primary' : 'bg-surface border-border'}`}
              >
                <Text className={`text-xs font-semibold ${statsView === 'list' ? 'text-white' : 'text-foreground'}`}>
                  Liste
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setStatsView('chart')}
                className={`px-3 py-1 rounded-lg border ${statsView === 'chart' ? 'bg-primary border-primary' : 'bg-surface border-border'}`}
              >
                <Text className={`text-xs font-semibold ${statsView === 'chart' ? 'text-white' : 'text-foreground'}`}>
                  Graphique
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {statsView === 'list' ? (
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
                <Text className="text-foreground font-bold text-lg">{user?.stats?.goals ?? user?.statsGoals ?? 0}</Text>
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
                <Text className="text-foreground font-bold text-lg">{user?.stats?.assists ?? user?.statsAssists ?? 0}</Text>
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
                <Text className="text-foreground font-bold text-lg">{user?.stats?.defenses ?? user?.statsDefenses ?? 0}</Text>
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
                <Text className="text-foreground font-bold text-lg">{user?.stats?.saves ?? user?.statsSaves ?? 0}</Text>
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
                <Text className="text-foreground font-bold text-lg">{user?.stats?.motm ?? user?.statsMotm ?? 0}</Text>
              </View>
            </View>
          ) : (
            /* Chart view — horizontal bar charts */
            <View className="bg-surface rounded-xl border border-border p-4 gap-3">
              {statItems.map((stat) => (
                <View key={stat.label} className="gap-1">
                  <View className="flex-row justify-between">
                    <Text className="text-foreground text-xs font-semibold">{stat.label}</Text>
                    <Text className="text-foreground text-xs font-bold">{stat.value}</Text>
                  </View>
                  <View className="bg-background rounded-full h-4 overflow-hidden">
                    <View
                      className="bg-primary h-full rounded-full"
                      style={{ width: `${Math.round((stat.value / maxStat) * 100)}%` }}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Sessions */}
        <View className="mx-4 mt-6 mb-4">
          <Text className="text-foreground font-bold text-lg mb-3">Sessions</Text>
          {userSessions.length === 0 ? (
            <View className="bg-surface rounded-xl border border-border p-4 items-center">
              <Text className="text-muted text-sm text-center">
                Aucune session pour le moment.
              </Text>
            </View>
          ) : (
            <View className="bg-surface rounded-xl border border-border overflow-hidden">
              {userSessions.map((session, idx) => {
                const sessionDate = new Date(session.date);
                const dd = String(sessionDate.getDate()).padStart(2, '0');
                const mm = String(sessionDate.getMonth() + 1).padStart(2, '0');
                const dateStr = `${dd}/${mm}/${sessionDate.getFullYear()}`;
                return (
                  <View
                    key={session.id}
                    className={`px-4 py-3 flex-row items-center justify-between${
                      idx < userSessions.length - 1 ? ' border-b border-border' : ''
                    }`}
                  >
                    <View className="flex-row items-center gap-3">
                      <Text className="text-2xl">🏟️</Text>
                      <View>
                        <Text className="text-foreground font-semibold text-sm">
                          {session.mode?.name ?? 'Session'}
                        </Text>
                        <Text className="text-muted text-xs">
                          {dateStr} · {session.time} · {session.location?.name ?? ''}
                        </Text>
                      </View>
                    </View>
                    <View className="bg-green-600/20 px-2 py-1 rounded-full">
                      <Text className="text-green-500 font-bold text-xs">✓ Joué</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
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
                <Text className="text-foreground font-semibold text-xs">{"Ballon d'Or"}</Text>
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
        {user?.email === "portedehal@gmail.com" && (
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
