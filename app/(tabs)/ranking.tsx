import { ScrollView, Text, View, TouchableOpacity, Image } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { allPlayers } from "@/lib/mock-data";
import { useState } from "react";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { UnoLeagueHeader } from "@/components/uno-league-header";

type SortBy = "goals" | "assists" | "defenses" | "motm";

export default function RankingScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const [selectedDivision, setSelectedDivision] = useState<"D1" | "D2" | "D3">(user?.division || "D1");
  const [sortBy, setSortBy] = useState<SortBy>("goals");

  const divisionPlayers = allPlayers.filter((p) => p.division === selectedDivision);

  const sortedPlayers = [...divisionPlayers].sort((a, b) => {
    const aValue = a.stats[sortBy];
    const bValue = b.stats[sortBy];
    return bValue - aValue;
  });

  const getSortLabel = (sort: SortBy) => {
    switch (sort) {
      case "goals":
        return "Buts";
      case "assists":
        return "Passes";
      case "defenses":
        return "Défenses";
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
          <Text className="text-foreground font-semibold text-sm mb-3">Trier par</Text>
          <View className="flex-row gap-2 flex-wrap">
            {(["goals", "assists", "defenses", "motm"] as const).map((sort) => (
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
            const isCurrentUser = player.id === user?.id;
            const statValue = player.stats[sortBy];

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
                    <Text className="text-lg">{player.avatar || "👤"}</Text>
                  )}
                </View>

                {/* Player Info */}
                <View className="flex-1">
                  <View className="flex-row items-center gap-2 mb-1">
                    <Text className="text-foreground font-semibold">{player.name}</Text>
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
                  <Text className="text-foreground font-bold text-lg">{statValue}</Text>
                  <Text className="text-muted text-xs">{getSortLabel(sortBy)}</Text>
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
                    {user?.stats.goals || 0}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-muted text-xs">Passes</Text>
              <Text className="text-foreground font-semibold text-sm">
                {user?.stats.assists || 0}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-muted text-xs">Défenses</Text>
              <Text className="text-foreground font-semibold text-sm">
                {user?.stats.defenses || 0}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-muted text-xs">Homme du match</Text>
              <Text className="text-foreground font-semibold text-sm">
                {user?.stats.motm || 0}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
