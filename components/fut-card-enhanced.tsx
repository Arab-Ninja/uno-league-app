import { View, Text, Image, Dimensions } from "react-native";
import { Player } from "@/lib/mock-data";
import { LinearGradient } from "expo-linear-gradient";
import { COUNTRIES } from "@/lib/countries";

interface FUTCardEnhancedProps {
  player: Player;
}

export function FUTCardEnhanced({ player }: FUTCardEnhancedProps) {
  const windowWidth = Dimensions.get("window").width;
  const cardWidth = Math.min(windowWidth - 32, 350);

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

  const getStatColor = (value: number) => {
    if (value >= 85) return "#00FF00"; // Green
    if (value >= 75) return "#FFFF00"; // Yellow
    if (value >= 65) return "#FFA500"; // Orange
    return "#FF6B6B"; // Red
  };

  return (
    <View style={{ width: cardWidth, alignSelf: "center" }}>
      {/* Main Card Container */}
      <LinearGradient
        colors={["#0a1f3d", "#1a3a5c", "#0a1f3d"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20,
          overflow: "hidden",
          borderWidth: 3,
          borderColor: "#DAA520",
          shadowColor: "#DAA520",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: 15,
          elevation: 20,
        }}
      >
        {/* Card Background Glow Effect */}
        <View
          style={{
            position: "absolute",
            top: -50,
            left: -50,
            width: 200,
            height: 200,
            borderRadius: 100,
            backgroundColor: "rgba(218, 165, 32, 0.15)",
            zIndex: 0,
          }}
        />

        {/* Card Content */}
        <View style={{ padding: 16, position: "relative", zIndex: 1 }}>
          {/* Top Section - Rating & Position */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            {/* Rating Box */}
            <View
              style={{
                backgroundColor: "rgba(218, 165, 32, 0.2)",
                borderRadius: 8,
                padding: 8,
                borderWidth: 2,
                borderColor: "#DAA520",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 24, fontWeight: "900", color: "#FFD700" }}>
                {overallRating}
              </Text>
              <Text style={{ fontSize: 10, color: "#DAA520", fontWeight: "bold" }}>
                {getPosition()}
              </Text>
            </View>

            {/* Player Name */}
            <View style={{ flex: 1, marginHorizontal: 12 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "900",
                  color: "#FFFFFF",
                  textAlign: "center",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                {player.name.split(" ")[0]}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: "#DAA520",
                  textAlign: "center",
                  marginTop: 2,
                }}
              >
                {player.division}
              </Text>
            </View>

            {/* Flag */}
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontSize: 24 }}>{getNationalityFlag()}</Text>
              <Text style={{ fontSize: 8, color: "#FFFFFF", marginTop: 2 }}>
                {player.nationality}
              </Text>
            </View>
          </View>

          {/* Player Avatar Section */}
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              marginVertical: 16,
              paddingVertical: 12,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: "rgba(218, 165, 32, 0.3)",
            }}
          >
            <View
              style={{
                width: 120,
                height: 140,
                borderRadius: 12,
                backgroundColor: "rgba(218, 165, 32, 0.1)",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: "rgba(218, 165, 32, 0.5)",
                overflow: "hidden",
              }}
            >
              {player.profilePhoto ? (
                <Image
                  source={{ uri: player.profilePhoto }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : (
                <Text style={{ fontSize: 60 }}>{player.avatar || "⚽"}</Text>
              )}
            </View>
          </View>

          {/* Stats Grid - 3 rows x 2 columns */}
          <View style={{ marginVertical: 12 }}>
            {/* Row 1 */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              {/* PAC */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                  borderRadius: 8,
                  padding: 8,
                  borderLeftWidth: 4,
                  borderLeftColor: getStatColor(stats.pace),
                }}
              >
                <Text style={{ fontSize: 10, color: "#FFFFFF", fontWeight: "bold" }}>PAC</Text>
                <Text style={{ fontSize: 16, fontWeight: "900", color: getStatColor(stats.pace), marginTop: 2 }}>
                  {Math.round(stats.pace)}
                </Text>
              </View>

              {/* DRI */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                  borderRadius: 8,
                  padding: 8,
                  borderLeftWidth: 4,
                  borderLeftColor: getStatColor(stats.dribbling),
                }}
              >
                <Text style={{ fontSize: 10, color: "#FFFFFF", fontWeight: "bold" }}>DRI</Text>
                <Text style={{ fontSize: 16, fontWeight: "900", color: getStatColor(stats.dribbling), marginTop: 2 }}>
                  {Math.round(stats.dribbling)}
                </Text>
              </View>
            </View>

            {/* Row 2 */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              {/* SHO */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                  borderRadius: 8,
                  padding: 8,
                  borderLeftWidth: 4,
                  borderLeftColor: getStatColor(stats.shooting),
                }}
              >
                <Text style={{ fontSize: 10, color: "#FFFFFF", fontWeight: "bold" }}>SHO</Text>
                <Text style={{ fontSize: 16, fontWeight: "900", color: getStatColor(stats.shooting), marginTop: 2 }}>
                  {Math.round(stats.shooting)}
                </Text>
              </View>

              {/* DEF */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                  borderRadius: 8,
                  padding: 8,
                  borderLeftWidth: 4,
                  borderLeftColor: getStatColor(stats.defense),
                }}
              >
                <Text style={{ fontSize: 10, color: "#FFFFFF", fontWeight: "bold" }}>DEF</Text>
                <Text style={{ fontSize: 16, fontWeight: "900", color: getStatColor(stats.defense), marginTop: 2 }}>
                  {Math.round(stats.defense)}
                </Text>
              </View>
            </View>

            {/* Row 3 */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {/* PAS */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                  borderRadius: 8,
                  padding: 8,
                  borderLeftWidth: 4,
                  borderLeftColor: getStatColor(stats.passing),
                }}
              >
                <Text style={{ fontSize: 10, color: "#FFFFFF", fontWeight: "bold" }}>PAS</Text>
                <Text style={{ fontSize: 16, fontWeight: "900", color: getStatColor(stats.passing), marginTop: 2 }}>
                  {Math.round(stats.passing)}
                </Text>
              </View>

              {/* PHY */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                  borderRadius: 8,
                  padding: 8,
                  borderLeftWidth: 4,
                  borderLeftColor: getStatColor(stats.physical),
                }}
              >
                <Text style={{ fontSize: 10, color: "#FFFFFF", fontWeight: "bold" }}>PHY</Text>
                <Text style={{ fontSize: 16, fontWeight: "900", color: getStatColor(stats.physical), marginTop: 2 }}>
                  {Math.round(stats.physical)}
                </Text>
              </View>
            </View>
          </View>

          {/* Footer Info */}
          <View
            style={{
              backgroundColor: "rgba(218, 165, 32, 0.15)",
              borderRadius: 8,
              padding: 10,
              borderTopWidth: 1,
              borderColor: "rgba(218, 165, 32, 0.3)",
              marginTop: 12,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 9, color: "#DAA520", fontWeight: "bold" }}>UNO</Text>
                <Text style={{ fontSize: 14, fontWeight: "900", color: "#FFD700", marginTop: 2 }}>
                  {player.unoPoints}
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 9, color: "#DAA520", fontWeight: "bold" }}>LVL</Text>
                <Text style={{ fontSize: 14, fontWeight: "900", color: "#FFD700", marginTop: 2 }}>
                  {player.level}
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 9, color: "#DAA520", fontWeight: "bold" }}>MOTM</Text>
                <Text style={{ fontSize: 14, fontWeight: "900", color: "#FFD700", marginTop: 2 }}>
                  {player.stats.motm}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}
