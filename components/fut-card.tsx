import { View, Text } from "react-native";
import { Player } from "@/lib/mock-data";
import { useColors } from "@/hooks/use-colors";

interface FUTCardProps {
  player: Player;
}

export function FUTCard({ player }: FUTCardProps) {
  const colors = useColors();

  // Calculate stats based on player performance
  const stats = {
    pace: Math.min(99, 50 + player.stats.goals * 0.5),
    shooting: Math.min(99, 40 + player.stats.goals * 1.2),
    passing: Math.min(99, 45 + player.stats.assists * 1.5),
    dribbling: Math.min(99, 50 + player.stats.goals * 0.8),
    defense: Math.min(99, 40 + player.stats.defenses * 1.3),
    physical: Math.min(99, 45 + player.stats.saves * 0.6),
  };

  const getDivisionColor = (division: string) => {
    switch (division) {
      case "D1":
        return "bg-yellow-500";
      case "D2":
        return "bg-gray-400";
      case "D3":
        return "bg-orange-600";
      default:
        return "bg-gray-500";
    }
  };

  const getStatColor = (value: number) => {
    if (value >= 85) return "text-green-500";
    if (value >= 75) return "text-blue-500";
    if (value >= 65) return "text-yellow-500";
    return "text-orange-500";
  };

  return (
    <View className="bg-gradient-to-b from-surface to-background rounded-2xl overflow-hidden border-2 border-primary/30 shadow-lg">
      {/* Header with Division */}
      <View className="bg-gradient-to-r from-primary to-primary/80 px-4 py-3 flex-row items-center justify-between">
        <View>
          <Text className="text-white font-bold text-xs">UNO LEAGUE</Text>
          <Text className="text-white/80 text-xs">PLAYER CARD</Text>
        </View>
        <View className={`${getDivisionColor(player.division)} px-3 py-1 rounded-full`}>
          <Text className="text-white font-bold text-sm">{player.division}</Text>
        </View>
      </View>

      {/* Player Info Section */}
      <View className="px-4 py-4 border-b border-border">
        <View className="flex-row items-center gap-3 mb-3">
          <Text className="text-5xl">{player.avatar || "⚽"}</Text>
          <View className="flex-1">
            <Text className="text-foreground font-bold text-lg">{player.name}</Text>
            <Text className="text-muted text-xs">Level {player.level}</Text>
          </View>
        </View>

        {/* Key Stats */}
        <View className="flex-row gap-2 justify-between bg-background rounded-lg p-2">
          <View className="flex-1 items-center">
            <Text className="text-muted text-xs">UNO</Text>
            <Text className="text-primary font-bold text-sm">{player.unoPoints}</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-muted text-xs">XP</Text>
            <Text className="text-success font-bold text-sm">{player.xp}</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-muted text-xs">MOTM</Text>
            <Text className="text-warning font-bold text-sm">{player.stats.motm}</Text>
          </View>
        </View>
      </View>

      {/* Stats Grid */}
      <View className="px-4 py-4">
        <Text className="text-foreground font-bold text-xs mb-3 uppercase">Stats</Text>

        {/* Row 1 */}
        <View className="flex-row gap-2 mb-2">
          {/* PAC */}
          <View className="flex-1 bg-background rounded-lg p-2">
            <Text className="text-muted text-xs">PAC</Text>
            <Text className={`font-bold text-sm ${getStatColor(stats.pace)}`}>
              {Math.round(stats.pace)}
            </Text>
          </View>

          {/* SHO */}
          <View className="flex-1 bg-background rounded-lg p-2">
            <Text className="text-muted text-xs">SHO</Text>
            <Text className={`font-bold text-sm ${getStatColor(stats.shooting)}`}>
              {Math.round(stats.shooting)}
            </Text>
          </View>

          {/* PAS */}
          <View className="flex-1 bg-background rounded-lg p-2">
            <Text className="text-muted text-xs">PAS</Text>
            <Text className={`font-bold text-sm ${getStatColor(stats.passing)}`}>
              {Math.round(stats.passing)}
            </Text>
          </View>
        </View>

        {/* Row 2 */}
        <View className="flex-row gap-2">
          {/* DRI */}
          <View className="flex-1 bg-background rounded-lg p-2">
            <Text className="text-muted text-xs">DRI</Text>
            <Text className={`font-bold text-sm ${getStatColor(stats.dribbling)}`}>
              {Math.round(stats.dribbling)}
            </Text>
          </View>

          {/* DEF */}
          <View className="flex-1 bg-background rounded-lg p-2">
            <Text className="text-muted text-xs">DEF</Text>
            <Text className={`font-bold text-sm ${getStatColor(stats.defense)}`}>
              {Math.round(stats.defense)}
            </Text>
          </View>

          {/* PHY */}
          <View className="flex-1 bg-background rounded-lg p-2">
            <Text className="text-muted text-xs">PHY</Text>
            <Text className={`font-bold text-sm ${getStatColor(stats.physical)}`}>
              {Math.round(stats.physical)}
            </Text>
          </View>
        </View>
      </View>

      {/* Footer */}
      <View className="bg-background px-4 py-3 border-t border-border">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-muted text-xs">Buts</Text>
            <Text className="text-foreground font-bold">{player.stats.goals}</Text>
          </View>
          <View>
            <Text className="text-muted text-xs">Passes</Text>
            <Text className="text-foreground font-bold">{player.stats.assists}</Text>
          </View>
          <View>
            <Text className="text-muted text-xs">Défenses</Text>
            <Text className="text-foreground font-bold">{player.stats.defenses}</Text>
          </View>
          <View>
            <Text className="text-muted text-xs">Arrêts</Text>
            <Text className="text-foreground font-bold">{player.stats.saves}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
