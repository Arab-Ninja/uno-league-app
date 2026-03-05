import { View, Text, Image, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Player } from "@/lib/mock-data";
import { COUNTRIES } from "@/lib/countries";

interface FUTCardRealProps {
  player: Player;
}

const CARD_WIDTH = Math.min(Dimensions.get("window").width - 48, 280);
const CARD_HEIGHT = CARD_WIDTH * 1.4;

const CARD_GRADIENTS: Record<
  "D1" | "D2" | "D3",
  readonly [string, string, string]
> = {
  D1: ["#b8860b", "#f5d060", "#b8860b"], // Gold
  D2: ["#6b7280", "#d1d5db", "#6b7280"], // Silver
  D3: ["#7c3f00", "#cd853f", "#7c3f00"], // Bronze
};

const CARD_TEXT_COLORS: Record<"D1" | "D2" | "D3", string> = {
  D1: "#3d2a00",
  D2: "#1f2937",
  D3: "#3d1a00",
};

const STAT_BG_COLORS: Record<"D1" | "D2" | "D3", string> = {
  D1: "rgba(0,0,0,0.35)",
  D2: "rgba(0,0,0,0.30)",
  D3: "rgba(0,0,0,0.35)",
};

// Derives FIFA-style 0–99 ratings from raw match statistics.
// Base values give every player a reasonable floor; multipliers
// reflect how strongly each stat category influences the attribute
// (e.g. goals contribute more to shooting than to pace).
function calcStats(player: Player) {
  return {
    pac: Math.min(99, Math.round(50 + player.stats.goals * 0.5)),
    sho: Math.min(99, Math.round(40 + player.stats.goals * 1.2)),
    pas: Math.min(99, Math.round(45 + player.stats.assists * 1.5)),
    dri: Math.min(99, Math.round(50 + player.stats.goals * 0.8)),
    def: Math.min(99, Math.round(40 + player.stats.defenses * 1.3)),
    phy: Math.min(99, Math.round(45 + player.stats.saves * 0.6)),
  };
}

function getFlag(nationality: string | undefined): string {
  if (!nationality) return "🏳️";
  const country = COUNTRIES.find(
    (c) => c.name.toLowerCase() === nationality.toLowerCase()
  );
  return country?.flag ?? "🏳️";
}

export function FUTCardReal({ player }: FUTCardRealProps) {
  const stats = calcStats(player);
  const overall = Math.round(
    (stats.pac + stats.sho + stats.pas + stats.dri + stats.def + stats.phy) / 6
  );
  const flag = getFlag(player.nationality);
  const gradientColors = CARD_GRADIENTS[player.division];
  const textColor = CARD_TEXT_COLORS[player.division];
  const statBg = STAT_BG_COLORS[player.division];

  const photoAreaHeight = CARD_HEIGHT * 0.48;

  return (
    <View
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 16,
        overflow: "hidden",
        alignSelf: "center",
        // Shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
        elevation: 16,
      }}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={{ flex: 1 }}
      >
        {/* ── TOP SECTION: rating + position (left) | flag (right) ── */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            paddingHorizontal: 14,
            paddingTop: 14,
          }}
        >
          {/* Rating + position */}
          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 38,
                fontWeight: "900",
                color: textColor,
                lineHeight: 40,
              }}
            >
              {overall}
            </Text>
            <Text
              style={{
                fontSize: 13, // slightly larger than 11 to visually balance "D1"/"D2"/"D3" against the 38px rating
                fontWeight: "700",
                color: textColor,
                letterSpacing: 1.5,
              }}
            >
              {player.division}
            </Text>
          </View>

          {/* Country flag */}
          <View style={{ alignItems: "center", paddingTop: 4 }}>
            <Text style={{ fontSize: 38 }}>{flag}</Text>
          </View>
        </View>

        {/* ── PLAYER PHOTO ── */}
        <View
          style={{
            height: photoAreaHeight,
            marginHorizontal: 14,
            marginTop: 10,
            borderRadius: 10,
            overflow: "hidden",
            backgroundColor: "rgba(0,0,0,0.15)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {player.profilePhoto ? (
            <Image
              source={{ uri: player.profilePhoto }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <Text style={{ fontSize: CARD_WIDTH * 0.3 }}>
              {player.avatar ?? "⚽"}
            </Text>
          )}
        </View>

        {/* ── PLAYER NAME ── */}
        <View style={{ alignItems: "center", marginTop: 8, paddingHorizontal: 8 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 16,
              fontWeight: "900",
              color: textColor,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {player.name}
          </Text>
        </View>

        {/* ── DIVIDER ── */}
        <View
          style={{
            height: 1,
            backgroundColor: textColor,
            opacity: 0.3,
            marginHorizontal: 14,
            marginTop: 8,
          }}
        />

        {/* ── STATS (2 columns × 3 rows) ── */}
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            paddingHorizontal: 14,
            paddingVertical: 8,
            backgroundColor: statBg,
          }}
        >
          {/* Left column: PAC, SHO, PAS */}
          <View style={{ flex: 1, justifyContent: "space-around" }}>
            {(
              [
                ["PAC", stats.pac],
                ["SHO", stats.sho],
                ["PAS", stats.pas],
              ] as [string, number][]
            ).map(([label, value]) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "900",
                    color: "#fff",
                    width: 26,
                    textAlign: "right",
                  }}
                >
                  {value}
                </Text>
                <Text style={{ fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.75)", letterSpacing: 0.5 }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>

          {/* Vertical separator */}
          <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.2)", marginHorizontal: 8 }} />

          {/* Right column: DRI, DEF, PHY */}
          <View style={{ flex: 1, justifyContent: "space-around" }}>
            {(
              [
                ["DRI", stats.dri],
                ["DEF", stats.def],
                ["PHY", stats.phy],
              ] as [string, number][]
            ).map(([label, value]) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "900",
                    color: "#fff",
                    width: 26,
                    textAlign: "right",
                  }}
                >
                  {value}
                </Text>
                <Text style={{ fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.75)", letterSpacing: 0.5 }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}
