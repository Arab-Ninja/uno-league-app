import { ScrollView, Text, View, TouchableOpacity } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";

type Section = "modes" | "regles" | "points" | "divisions";

export default function InfoScreen() {
  const colors = useColors();
  const [expandedSection, setExpandedSection] = useState<Section | null>("modes");

  const toggleSection = (section: Section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border">
          <Text className="text-2xl font-bold text-foreground">Informations</Text>
          <Text className="text-muted text-sm mt-1">Apprenez comment jouer à UNO League</Text>
        </View>

        {/* Modes de Jeu */}
        <TouchableOpacity
          onPress={() => toggleSection("modes")}
          className="mx-4 mt-4 bg-surface rounded-xl p-4 border border-border"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3 flex-1">
              <Text className="text-2xl">🎮</Text>
              <Text className="text-foreground font-bold text-lg">Modes de Jeu</Text>
            </View>
            <Text className="text-2xl">{expandedSection === "modes" ? "−" : "+"}</Text>
          </View>

          {expandedSection === "modes" && (
            <View className="mt-4 pt-4 border-t border-border gap-3">
              <View>
                <Text className="text-primary font-bold text-sm mb-1">🏆 UNO League</Text>
                <Text className="text-muted text-xs">
                  Le mode principal avec divisions (D1, D2, D3) et progression. Vos performances
                  impactent votre classement et vos récompenses.
                </Text>
              </View>
              <View>
                <Text className="text-accent font-bold text-sm mb-1">🎯 Agora League</Text>
                <Text className="text-muted text-xs">
                  {"Matchs amicaux sans impact sur le classement. Parfait pour s'entraîner et s'amuser sans pression."}
                </Text>
              </View>
              <View>
                <Text className="text-secondary font-bold text-sm mb-1">🎮 Mini-jeux</Text>
                <Text className="text-muted text-xs">
                  Activités ludiques rapides pour gagner des points UNO en quelques minutes.
                </Text>
              </View>
              <View>
                <Text className="text-success font-bold text-sm mb-1">💪 Entraînements</Text>
                <Text className="text-muted text-xs">
                  {"Sessions d'amélioration sans récompenses UNO, mais avec XP pour progresser."}
                </Text>
              </View>
              <View>
                <Text className="text-warning font-bold text-sm mb-1">🥇 Tournois</Text>
                <Text className="text-muted text-xs">
                  Événements spéciaux avec récompenses exceptionnelles et compétition intense.
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* Règles */}
        <TouchableOpacity
          onPress={() => toggleSection("regles")}
          className="mx-4 mt-3 bg-surface rounded-xl p-4 border border-border"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3 flex-1">
              <Text className="text-2xl">📋</Text>
              <Text className="text-foreground font-bold text-lg">Règles du Jeu</Text>
            </View>
            <Text className="text-2xl">{expandedSection === "regles" ? "−" : "+"}</Text>
          </View>

          {expandedSection === "regles" && (
            <View className="mt-4 pt-4 border-t border-border gap-2">
              <View>
                <Text className="text-foreground font-semibold text-sm mb-1">⚽ Format</Text>
                <Text className="text-muted text-xs">
                  Matchs 5v5 en futsal (football en salle). Durée : 2x20 minutes.
                </Text>
              </View>
              <View>
                <Text className="text-foreground font-semibold text-sm mb-1">👥 Équipes</Text>
                <Text className="text-muted text-xs">
                  Répartition aléatoire des joueurs en équipes équilibrées. Chaque joueur joue
                  tous les matchs.
                </Text>
              </View>
              <View>
                <Text className="text-foreground font-semibold text-sm mb-1">🏅 Récompenses</Text>
                <Text className="text-muted text-xs">
                  Points attribués pour les buts, passes, défenses et homme du match (MOTM).
                </Text>
              </View>
              <View>
                <Text className="text-foreground font-semibold text-sm mb-1">📊 Classement</Text>
                <Text className="text-muted text-xs">
                  Classement mis à jour après chaque session. Promotion/relégation en fin de
                  saison.
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* Système de Points */}
        <TouchableOpacity
          onPress={() => toggleSection("points")}
          className="mx-4 mt-3 bg-surface rounded-xl p-4 border border-border"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3 flex-1">
              <Text className="text-2xl">💰</Text>
              <Text className="text-foreground font-bold text-lg">Système de Points</Text>
            </View>
            <Text className="text-2xl">{expandedSection === "points" ? "−" : "+"}</Text>
          </View>

          {expandedSection === "points" && (
            <View className="mt-4 pt-4 border-t border-border gap-3">
              <View className="bg-background rounded-lg p-3">
                <Text className="text-foreground font-semibold text-sm mb-2">Conversion</Text>
                <Text className="text-primary font-bold text-lg">10 UNO = 1€</Text>
              </View>

              <View>
                <Text className="text-foreground font-semibold text-sm mb-2">Récompenses par Division</Text>
                <View className="space-y-2">
                  <View className="flex-row justify-between">
                    <Text className="text-muted text-xs">Meilleur buteur</Text>
                    <Text className="text-foreground font-bold text-xs">D1: 250 | D2: 200 | D3: 150</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-muted text-xs">Meilleur passeur</Text>
                    <Text className="text-foreground font-bold text-xs">D1: 150 | D2: 100 | D3: 75</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-muted text-xs">Meilleur défenseur</Text>
                    <Text className="text-foreground font-bold text-xs">D1: 150 | D2: 100 | D3: 75</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-muted text-xs">Meilleure équipe</Text>
                    <Text className="text-foreground font-bold text-xs">20 UNO (toutes)</Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-muted text-xs">Participation</Text>
                    <Text className="text-foreground font-bold text-xs">10 UNO (toutes)</Text>
                  </View>
                </View>
              </View>

              <View className="bg-primary/10 rounded-lg p-3 border border-primary/20">
                <Text className="text-primary font-semibold text-xs text-center">
                  💡 Participez régulièrement pour maximiser vos gains !
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* Divisions */}
        <TouchableOpacity
          onPress={() => toggleSection("divisions")}
          className="mx-4 mt-3 mb-6 bg-surface rounded-xl p-4 border border-border"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3 flex-1">
              <Text className="text-2xl">🎖️</Text>
              <Text className="text-foreground font-bold text-lg">Divisions</Text>
            </View>
            <Text className="text-2xl">{expandedSection === "divisions" ? "−" : "+"}</Text>
          </View>

          {expandedSection === "divisions" && (
            <View className="mt-4 pt-4 border-t border-border gap-3">
              <View className="bg-primary/10 rounded-lg p-3 border border-primary/20">
                <Text className="text-primary font-bold text-sm mb-1">🥇 Division 1 (D1)</Text>
                <Text className="text-muted text-xs">
                  Le plus haut niveau. Compétition intense et récompenses maximales.
                </Text>
              </View>
              <View className="bg-accent/10 rounded-lg p-3 border border-accent/20">
                <Text className="text-accent font-bold text-sm mb-1">🥈 Division 2 (D2)</Text>
                <Text className="text-muted text-xs">
                  Niveau intermédiaire. Bonne compétition et récompenses équilibrées.
                </Text>
              </View>
              <View className="bg-secondary/10 rounded-lg p-3 border border-secondary/20">
                <Text className="text-secondary font-bold text-sm mb-1">🥉 Division 3 (D3)</Text>
                <Text className="text-muted text-xs">
                  {"Niveau d'accès. Parfait pour débuter et progresser progressivement."}
                </Text>
              </View>

              <View className="bg-background rounded-lg p-3 mt-2">
                <Text className="text-foreground font-semibold text-xs mb-2">Progression</Text>
                <Text className="text-muted text-xs">
                  • Montez en division en restant dans le top 3 de votre division
                </Text>
                <Text className="text-muted text-xs">
                  • Descendez si vous finissez dans le bottom 3
                </Text>
                <Text className="text-muted text-xs">
                  • Mise à jour en fin de saison (tous les 3 mois)
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
