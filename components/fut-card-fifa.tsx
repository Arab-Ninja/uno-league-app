import { View, Text, Image } from "react-native";
import { Player } from "@/lib/mock-data";
import { useColors } from "@/hooks/use-colors";
import { LinearGradient } from "expo-linear-gradient";
import { COUNTRIES } from "@/lib/countries";

interface FUTCardFIFAProps {
  player: Player;
}

export function FUTCardFIFA({ player }: FUTCardFIFAProps) {
  const colors = useColors();

  // Calculate overall rating (0-99)
  const stats = {
    pace: Math.min(99, 50 + player.stats.goals * 0.5),
    shooting: Math.min(99, 40 + player.stats.goals * 1.2),
    passing: Math.min(99, 45 + player.stats.assists * 1.5),
    dribbling: Math.min(99, 50 + player.stats.goals * 0.8),
    defense: Math.min(99, 40 + player.stats.defenses * 1.3),
    physical: Math.min(99, 45 + player.stats.saves * 0.6),
  };

  const overallRating = Math.round(
    (stats.pace + stats.shooting + stats.passing + stats.dribbling + stats.defense + stats.physical) / 6
  );

  const getPosition = () => {
    if (player.stats.defenses > player.stats.goals) return "DEF";
    if (player.stats.assists > player.stats.goals) return "MID";
    return "FWD";
  };

  const getNationalityFlag = () => {
    if (!player.nationality) return "🏳️";
    const country = COUNTRIES.find(
      (c) => c.name.toLowerCase() === player.nationality!.toLowerCase()
    );
    return country?.flag ?? "🏳️";
  };

  const getDivisionColor = (division: string) => {
    switch (division) {
      case "D1":
        return { bg: "#FFD700", text: "#1a1a1a" }; // Gold
      case "D2":
        return { bg: "#C0C0C0", text: "#1a1a1a" }; // Silver
      case "D3":
        return { bg: "#CD7F32", text: "#ffffff" }; // Bronze
      default:
        return { bg: "#808080", text: "#ffffff" };
    }
  };

  const divisionColor = getDivisionColor(player.division);

  return (
    <View className="w-full max-w-sm mx-auto">
      {/* Outer Card Container with Shadow */}
      <View className="rounded-3xl overflow-hidden shadow-2xl border-2" style={{ borderColor: "#DAA520" }}>
        {/* Main Card Background with Gradient */}
        <LinearGradient
          colors={["#0a3a5c", "#1a5a7c", "#0a3a5c"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="relative"
        >
          {/* Golden Glow Effect */}
          <View className="absolute inset-0 opacity-30 bg-gradient-to-b from-yellow-500/20 to-transparent" />

          {/* Card Content */}
          <View className="relative p-4">
            {/* Top Section - Name and Rating */}
            <View className="mb-3">
              <Text className="text-white text-center font-bold text-lg uppercase tracking-wider">
                {player.name}
              </Text>
            </View>

            {/* Rating and Position - Left Side */}
            <View className="absolute top-6 left-4 z-10">
              <View className="items-center">
                <Text className="text-white font-black text-4xl">{overallRating}</Text>
                <Text className="text-yellow-300 font-bold text-sm">{getPosition()}</Text>
              </View>
            </View>

            {/* Division Badge - Top Right */}
            <View className="absolute top-4 right-4 z-10">
              <View
                className="rounded-full px-3 py-1 border-2 border-white"
                style={{ backgroundColor: divisionColor.bg }}
              >
                <Text
                  className="font-bold text-xs"
                  style={{ color: divisionColor.text }}
                >
                  {player.division}
                </Text>
              </View>
            </View>

            {/* Player Avatar/Photo Section */}
            <View className="items-center justify-center py-6 mb-2">
              <View className="w-32 h-40 rounded-lg bg-gradient-to-b from-yellow-400/30 to-transparent items-center justify-center border-2 border-yellow-500/50">
                <Text className="text-7xl">{player.avatar || "⚽"}</Text>
              </View>
            </View>

            {/* Flag and Club Badge - Bottom of Photo */}
            <View className="flex-row items-center justify-between px-4 mb-4">
              <View className="items-center">
                <Text className="text-3xl">{getNationalityFlag()}</Text>
                <Text className="text-white text-xs mt-1">{player.nationality || "Belge"}</Text>
              </View>
              <View className="items-center">
                <Text className="text-3xl">⚽</Text>
                <Text className="text-white text-xs mt-1">UNO</Text>
              </View>
            </View>

            {/* Stats Section - 2 Columns */}
            <View className="bg-black/40 rounded-lg p-3 border border-yellow-500/30">
              {/* Row 1 */}
              <View className="flex-row gap-2 mb-2">
                {/* PAC */}
                <View className="flex-1 bg-gradient-to-r from-blue-900/50 to-blue-800/50 rounded p-2 border border-blue-500/30">
                  <Text className="text-white font-bold text-xs">PAC</Text>
                  <Text className="text-yellow-300 font-black text-lg">{Math.round(stats.pace)}</Text>
                </View>

                {/* DRI */}
                <View className="flex-1 bg-gradient-to-r from-blue-900/50 to-blue-800/50 rounded p-2 border border-blue-500/30">
                  <Text className="text-white font-bold text-xs">DRI</Text>
                  <Text className="text-yellow-300 font-black text-lg">{Math.round(stats.dribbling)}</Text>
                </View>
              </View>

              {/* Row 2 */}
              <View className="flex-row gap-2 mb-2">
                {/* SHO */}
                <View className="flex-1 bg-gradient-to-r from-blue-900/50 to-blue-800/50 rounded p-2 border border-blue-500/30">
                  <Text className="text-white font-bold text-xs">SHO</Text>
                  <Text className="text-yellow-300 font-black text-lg">{Math.round(stats.shooting)}</Text>
                </View>

                {/* DEF */}
                <View className="flex-1 bg-gradient-to-r from-blue-900/50 to-blue-800/50 rounded p-2 border border-blue-500/30">
                  <Text className="text-white font-bold text-xs">DEF</Text>
                  <Text className="text-yellow-300 font-black text-lg">{Math.round(stats.defense)}</Text>
                </View>
              </View>

              {/* Row 3 */}
              <View className="flex-row gap-2">
                {/* PAS */}
                <View className="flex-1 bg-gradient-to-r from-blue-900/50 to-blue-800/50 rounded p-2 border border-blue-500/30">
                  <Text className="text-white font-bold text-xs">PAS</Text>
                  <Text className="text-yellow-300 font-black text-lg">{Math.round(stats.passing)}</Text>
                </View>

                {/* PHY */}
                <View className="flex-1 bg-gradient-to-r from-blue-900/50 to-blue-800/50 rounded p-2 border border-blue-500/30">
                  <Text className="text-white font-bold text-xs">PHY</Text>
                  <Text className="text-yellow-300 font-black text-lg">{Math.round(stats.physical)}</Text>
                </View>
              </View>
            </View>

            {/* Footer with UNO Points */}
            <View className="mt-3 bg-gradient-to-r from-yellow-600/30 to-yellow-500/20 rounded-lg p-2 border border-yellow-500/50">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-yellow-300 text-xs font-bold">UNO POINTS</Text>
                  <Text className="text-white font-black text-lg">{player.unoPoints}</Text>
                </View>
                <View>
                  <Text className="text-yellow-300 text-xs font-bold">LEVEL</Text>
                  <Text className="text-white font-black text-lg">{player.level}</Text>
                </View>
                <View>
                  <Text className="text-yellow-300 text-xs font-bold">MOTM</Text>
                  <Text className="text-white font-black text-lg">{player.stats.motm}</Text>
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>
    </View>
  );
}
