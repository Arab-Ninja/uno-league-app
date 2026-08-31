import { ScrollView, Text, View, TouchableOpacity, Image, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { allPlayers, Player } from "@/lib/mock-data";
import { useState } from "react";
import { UnoLeagueHeader } from "@/components/uno-league-header";
import { FUTCardReal } from "@/components/fut-card-real";

type SortBy = "goals" | "assists" | "defenses" | "saves" | "motm";

/** Computes the weighted total score used for ranking.
 *  Goals count 1.5×; all other stats count 1×.
 */
function computeScore(player: Player): number {
  return (
    player.stats.goals   * 1.5 +
    player.stats.assists * 1   +
    player.stats.defenses* 1   +
    player.stats.saves   * 1
  );
}

/** Returns "F.LastName" abbreviated name, e.g. "Y.Nissay". */
function abbreviateName(player: Player): string {
  if (player.firstName && player.lastName) {
    return `${player.firstName[0]}.${player.lastName}`;
  }
  const parts = player.name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}.${parts.slice(1).join(' ')}`;
  }
  return player.name;
}

/** Returns up to 2 initials for avatar fallback. */
function getInitials(player: Player): string {
  const parts = player.name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return player.name.slice(0, 2).toUpperCase();
}

export default function RankingScreen() {
  const { user } = useAuth();
  const [selectedDivision, setSelectedDivision] = useState<"D1" | "D2" | "D3">(user?.division || "D1");
  const [sortBy, setSortBy] = useState<SortBy>("goals");
  const [futPlayer, setFutPlayer] = useState<Player | null>(null);

  const divisionPlayers = allPlayers.filter((p) => p.division === selectedDivision);

  // Always rank by weighted score (goals×1.5, rest×1); sortBy only affects which stat is displayed.
  const sortedPlayers = [...divisionPlayers].sort(
    (a, b) => computeScore(b) - computeScore(a),
  );

  const getSortLabel = (sort: SortBy) => {
    switch (sort) {
      case "goals":
        return "Buts";
      case "assists":
        return "Passes";
      case "defenses":
        return "Défenses";
      case "saves":
        return "Arrêts";
      case "motm":
        return "MOTM";
      default:
        return sort;
    }
  };

  const getMedalEmoji = (position: number) => {
    switch (position) {
      case 0:
        return "🥇";
      case 1:
        return "🥈";
      case 2:
        return "🥉";
      default:
        return null;
    }
  };

  return (
    <ScreenContainer className="flex-1 bg-background">
      <UnoLeagueHeader unoBalance={user?.unoPoints ?? 0} showBalance={true} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border">
          <Text className="text-2xl font-bold text-foreground">Classement</Text>
          <Text className="text-muted text-sm mt-1">16 jours avant la mise à jour</Text>
        </View>

        {/* Division Filter */}
        <View className="px-4 mt-4 mb-4">
          <Text className="text-foreground font-semibold text-sm mb-3">Division</Text>
          <View className="flex-row gap-2">
            {(["D1", "D2", "D3"] as const).map((div) => (
              <TouchableOpacity
                key={div}
                onPress={() => setSelectedDivision(div)}
                className={`flex-1 py-2 px-3 rounded-lg border ${
                  selectedDivision === div
                    ? "bg-primary border-primary"
                    : "bg-surface border-border"
                }`}
              >
                <Text
                  className={`text-center font-semibold text-sm ${
                    selectedDivision === div ? "text-white" : "text-foreground"
                  }`}
                >
                  {div}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Sort Buttons */}
        <View className="px-4 mb-4">
          <Text className="text-foreground font-semibold text-sm mb-3">Afficher stat</Text>
          <View className="flex-row gap-2 flex-wrap">
            {(["goals", "assists", "defenses", "saves", "motm"] as const).map((sort) => (
              <TouchableOpacity
                key={sort}
                onPress={() => setSortBy(sort)}
                className={`py-2 px-3 rounded-lg border ${
                  sortBy === sort
                    ? "bg-accent border-accent"
                    : "bg-surface border-border"
                }`}
              >
                <Text
                  className={`font-semibold text-xs ${
                    sortBy === sort ? "text-white" : "text-foreground"
                  }`}
                >
                  {getSortLabel(sort)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Rankings List */}
        <View className="px-4 mb-6">
          {sortedPlayers.map((player, index) => {
            const medal = getMedalEmoji(index);
            const isCurrentUser = player.email === user?.email;
            const statValue = player.stats[sortBy];
            const score = computeScore(player);

            return (
              <TouchableOpacity
                key={player.id}
                className={`flex-row items-center gap-3 p-4 rounded-xl mb-2 border ${
                  isCurrentUser
                    ? "bg-primary/10 border-primary"
                    : "bg-surface border-border"
                }`}
              >
                {/* Position */}
                <View className="w-10 items-center">
                  {medal ? (
                    <Text className="text-xl">{medal}</Text>
                  ) : (
                    <Text className="text-foreground font-bold text-lg">#{index + 1}</Text>
                  )}
                </View>

                {/* Player Avatar */}
                <View className="w-10 h-10 rounded-full bg-surface border border-border items-center justify-center overflow-hidden">
                  {player.profilePhoto ? (
                    <Image
                      source={{ uri: player.profilePhoto }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <Text className="text-xs font-bold text-foreground">{getInitials(player)}</Text>
                  )}
                </View>

                {/* Player Info */}
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1">
                    <TouchableOpacity
                      onPress={() => setFutPlayer(player)}
                      accessibilityRole="button"
                      accessibilityLabel={`Voir la carte FUT de ${player.name}`}
                    >
                      <Text className="text-foreground font-semibold text-primary underline">
                        {abbreviateName(player)}
                      </Text>
                    </TouchableOpacity>
                    {isCurrentUser && (
                      <View className="bg-primary/20 px-2 py-0.5 rounded">
                        <Text className="text-primary text-xs font-semibold">Vous</Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-row gap-2">
                    <Text className="text-muted text-xs">Niveau {player.level}</Text>
                    <Text className="text-muted text-xs">•</Text>
                    <Text className="text-muted text-xs">{player.unoPoints} UNO</Text>
                  </View>
                </View>

                {/* Stat Value */}
                <View className="items-end">
                  <Text className="text-foreground font-bold text-lg">{score.toFixed(1)}</Text>
                  <Text className="text-muted text-xs">Score</Text>
                  <Text className="text-muted text-xs">{getSortLabel(sortBy)}: {statValue}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Stats Legend */}
        <View className="mx-4 mb-6 bg-surface rounded-xl p-4 border border-border">
          <Text className="text-foreground font-semibold text-sm mb-3">Statistiques</Text>
          <View className="gap-2">
                <View className="flex-row items-center justify-between">
                  <Text className="text-muted text-xs">Buts</Text>
                  <Text className="text-foreground font-semibold text-sm">
                    {user?.statsGoals || 0}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-muted text-xs">Passes</Text>
              <Text className="text-foreground font-semibold text-sm">
                {user?.statsAssists || 0}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-muted text-xs">Défenses</Text>
              <Text className="text-foreground font-semibold text-sm">
                {user?.statsDefenses || 0}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-muted text-xs">Homme du match</Text>
              <Text className="text-foreground font-semibold text-sm">
                {user?.statsMotm || 0}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* FUT Card mini-modal — shown when a player name is tapped */}
      <Modal
        visible={futPlayer !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFutPlayer(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => setFutPlayer(null)}
          />
          {futPlayer && (
            <View style={{ alignItems: 'center', gap: 16 }}>
              <FUTCardReal player={futPlayer} />
              <TouchableOpacity
                onPress={() => setFutPlayer(null)}
                style={{
                  backgroundColor: 'white',
                  borderRadius: 20,
                  paddingHorizontal: 28,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ fontWeight: '700', color: '#111' }}>Fermer</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </ScreenContainer>
  );
}
