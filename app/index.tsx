import { ScrollView, Text, View, TouchableOpacity, Image } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useColors } from "@/hooks/use-colors";

export default function HomeScreen() {
  const { isSignedIn, isLoading } = useAuth();
  const router = useRouter();
  const colors = useColors();

  useEffect(() => {
    if (!isLoading && isSignedIn) {
      router.replace("/(tabs)");
    }
  }, [isSignedIn, isLoading]);

  if (isLoading) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <Text className="text-foreground text-lg">Chargement...</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <View className="items-center pt-16 pb-12">
          <Text className="text-7xl mb-6">⚽</Text>
          <Text className="text-4xl font-bold text-foreground text-center">UNO League</Text>
          <Text className="text-xl text-primary font-bold mt-2">The Ultimate Number One</Text>
          <Text className="text-muted text-sm text-center mt-4 px-6">
            La ligue de football amateur en salle la plus dynamique
          </Text>
        </View>

        {/* Features Section */}
        <View className="px-6 mb-12">
          <Text className="text-foreground font-bold text-lg mb-4">Pourquoi UNO League ?</Text>

          {/* Feature 1 */}
          <View className="bg-surface rounded-xl p-4 border border-border mb-3 flex-row gap-3">
            <Text className="text-2xl">🏆</Text>
            <View className="flex-1">
              <Text className="text-foreground font-bold text-sm">Compétition Équitable</Text>
              <Text className="text-muted text-xs mt-1">
                Divisé par niveau pour des matchs équilibrés
              </Text>
            </View>
          </View>

          {/* Feature 2 */}
          <View className="bg-surface rounded-xl p-4 border border-border mb-3 flex-row gap-3">
            <Text className="text-2xl">💰</Text>
            <View className="flex-1">
              <Text className="text-foreground font-bold text-sm">Système UNO</Text>
              <Text className="text-muted text-xs mt-1">
                Gagnez des points et échangez-les contre des récompenses
              </Text>
            </View>
          </View>

          {/* Feature 3 */}
          <View className="bg-surface rounded-xl p-4 border border-border mb-3 flex-row gap-3">
            <Text className="text-2xl">📅</Text>
            <View className="flex-1">
              <Text className="text-foreground font-bold text-sm">Réservation Facile</Text>
              <Text className="text-muted text-xs mt-1">
                Réservez vos sessions en quelques clics
              </Text>
            </View>
          </View>

          {/* Feature 4 */}
          <View className="bg-surface rounded-xl p-4 border border-border flex-row gap-3">
            <Text className="text-2xl">👥</Text>
            <View className="flex-1">
              <Text className="text-foreground font-bold text-sm">Communauté Vibrante</Text>
              <Text className="text-muted text-xs mt-1">
                Rejoignez des milliers de joueurs passionnés
              </Text>
            </View>
          </View>
        </View>

        {/* Stats Section */}
        <View className="px-6 mb-12">
          <View className="flex-row gap-3">
            <View className="flex-1 bg-primary/10 rounded-xl p-4 border border-primary/20 items-center">
              <Text className="text-2xl font-bold text-primary">247</Text>
              <Text className="text-muted text-xs mt-1">Joueurs Actifs</Text>
            </View>
            <View className="flex-1 bg-success/10 rounded-xl p-4 border border-success/20 items-center">
              <Text className="text-2xl font-bold text-success">1.2K</Text>
              <Text className="text-muted text-xs mt-1">Matchs Joués</Text>
            </View>
            <View className="flex-1 bg-warning/10 rounded-xl p-4 border border-warning/20 items-center">
              <Text className="text-2xl font-bold text-warning">125K</Text>
              <Text className="text-muted text-xs mt-1">UNO Distribués</Text>
            </View>
          </View>
        </View>

        {/* CTA Buttons */}
        <View className="px-6 pb-12">
          {/* Login Button */}
          <TouchableOpacity
            onPress={() => router.push("/login" as any)}
            className="bg-primary rounded-xl py-4 px-6 mb-3"
          >
            <Text className="text-white text-center font-bold text-lg">Se Connecter</Text>
          </TouchableOpacity>

          {/* Signup Button */}
          <TouchableOpacity
            onPress={() => router.push("/signup" as any)}
            className="bg-surface border border-primary rounded-xl py-4 px-6"
          >
            <Text className="text-primary text-center font-bold text-lg">{"S'Inscrire"}</Text>
          </TouchableOpacity>
        </View>

        {/* Footer Info */}
        <View className="mx-6 mb-6 bg-primary/5 rounded-xl p-4 border border-primary/10">
          <Text className="text-foreground font-bold text-sm mb-2">📍 Lieux de Jeu</Text>
          <Text className="text-muted text-xs">
            Fit Five Forest • Fit Five Laeken • YC Five • Arena • Five Bruxelles • Futsal Club
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
