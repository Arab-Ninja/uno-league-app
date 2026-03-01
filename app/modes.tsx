import { ScrollView, Text, View, TouchableOpacity } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";

interface GameMode {
  id: string;
  name: string;
  icon: string;
  description: string;
  color: string;
  rewards: string;
}

const gameModes: GameMode[] = [
  {
    id: "uno-league",
    name: "UNO League",
    icon: "🏆",
    description: "Le mode principal avec divisions et progression",
    color: "from-primary to-primary/80",
    rewards: "Jusqu'à 580 UNO/session",
  },
  {
    id: "agora-league",
    name: "Agora League",
    icon: "🎯",
    description: "Matchs amicaux sans impact sur le classement",
    color: "from-accent to-accent/80",
    rewards: "Bonus UNO variables",
  },
  {
    id: "mini-games",
    name: "Mini-jeux",
    icon: "🎮",
    description: "Activités ludiques rapides pour gagner des points",
    color: "from-secondary to-secondary/80",
    rewards: "10-50 UNO/jeu",
  },
  {
    id: "training",
    name: "Entraînements",
    icon: "💪",
    description: "Sessions d'amélioration sans récompenses",
    color: "from-success to-success/80",
    rewards: "XP uniquement",
  },
  {
    id: "tournaments",
    name: "Tournois",
    icon: "🥇",
    description: "Événements spéciaux avec récompenses exceptionnelles",
    color: "from-warning to-warning/80",
    rewards: "Jusqu'à 1000 UNO",
  },
];

export default function ModesScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border">
          <Text className="text-2xl font-bold text-foreground">Modes de Jeu</Text>
          <Text className="text-muted text-sm mt-1">Choisissez votre mode de jeu</Text>
        </View>

        {/* Game Modes */}
        <View className="px-4 mt-6 mb-6">
          {gameModes.map((mode) => (
            <TouchableOpacity
              key={mode.id}
              onPress={() => router.back()}
              className="mb-4"
            >
              <View className="bg-surface rounded-2xl border border-border overflow-hidden">
                {/* Mode Header */}
                <View className="bg-primary p-6">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className="text-4xl mb-2">{mode.icon}</Text>
                      <Text className="text-white font-bold text-xl">{mode.name}</Text>
                    </View>
                    <View className="bg-white/20 px-3 py-1 rounded-full">
                      <Text className="text-white text-xs font-semibold">Jouer</Text>
                    </View>
                  </View>
                </View>

                {/* Mode Details */}
                <View className="p-4">
                  <Text className="text-muted text-sm mb-3">{mode.description}</Text>
                  <View className="flex-row items-center gap-2 pt-3 border-t border-border">
                    <Text className="text-warning text-sm font-semibold">🎁</Text>
                    <Text className="text-foreground font-semibold text-sm">{mode.rewards}</Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Info Box */}
        <View className="mx-4 mb-6 bg-primary/10 rounded-xl p-4 border border-primary/20">
          <View className="flex-row gap-3">
            <Text className="text-2xl">ℹ️</Text>
            <View className="flex-1">
              <Text className="text-foreground font-semibold text-sm mb-1">
                Conseil
              </Text>
              <Text className="text-muted text-xs">
                Participez régulièrement à la UNO League pour progresser en divisions et maximiser vos récompenses !
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
