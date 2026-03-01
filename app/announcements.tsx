import { ScrollView, Text, View, TouchableOpacity } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { announcements, playerOfTheMonth } from "@/lib/mock-data";
import { useState } from "react";

export default function AnnouncementsScreen() {
  const colors = useColors();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedAnnouncement = announcements.find((a) => a.id === selectedId);

  const getTypeColor = (type: string) => {
    switch (type) {
      case "reward":
        return "bg-warning/10 border-warning/20";
      case "alert":
        return "bg-error/10 border-error/20";
      case "maintenance":
        return "bg-muted/10 border-muted/20";
      default:
        return "bg-primary/10 border-primary/20";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "reward":
        return "🏆";
      case "alert":
        return "⚠️";
      case "maintenance":
        return "🔧";
      default:
        return "ℹ️";
    }
  };

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border">
          <Text className="text-2xl font-bold text-foreground">Annonces</Text>
          <Text className="text-muted text-sm mt-1">Restez informé des actualités</Text>
        </View>

        {/* Player of the Month */}
        <View className="mx-4 mt-6 mb-6 bg-gradient-to-r from-warning to-warning/80 rounded-2xl p-6 border border-warning/20">
          <View className="flex-row items-start justify-between mb-4">
            <View>
              <Text className="text-white/80 text-sm mb-1">🏆 Joueur du Mois</Text>
              <Text className="text-white font-bold text-2xl">{playerOfTheMonth.name}</Text>
            </View>
            <Text className="text-4xl">{playerOfTheMonth.avatar}</Text>
          </View>

          <View className="bg-white/10 rounded-lg p-3 mb-4">
            <Text className="text-white text-xs mb-3">Statistiques du mois</Text>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-white/70 text-xs">Buts</Text>
                <Text className="text-white font-bold text-lg">{playerOfTheMonth.stats.goals}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-white/70 text-xs">Passes</Text>
                <Text className="text-white font-bold text-lg">{playerOfTheMonth.stats.assists}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-white/70 text-xs">MOTM</Text>
                <Text className="text-white font-bold text-lg">{playerOfTheMonth.stats.motm}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-white/70 text-xs">Division</Text>
                <Text className="text-white font-bold text-lg">{playerOfTheMonth.division}</Text>
              </View>
            </View>
          </View>

          <Text className="text-white text-xs leading-relaxed">
            Félicitations à {playerOfTheMonth.name} pour ses performances exceptionnelles ce mois-ci ! Continuez comme ça ! 🎉
          </Text>
        </View>

        {/* Announcements List */}
        <View className="px-4 mb-6">
          <Text className="text-foreground font-bold text-lg mb-3">Toutes les Annonces</Text>
          {announcements.map((ann) => (
            <TouchableOpacity
              key={ann.id}
              onPress={() => setSelectedId(ann.id)}
              className={`rounded-xl p-4 border mb-3 ${getTypeColor(ann.type)} ${
                selectedId === ann.id ? "border-primary" : "border-border"
              }`}
            >
              <View className="flex-row items-start gap-3">
                <Text className="text-2xl">{getTypeIcon(ann.type)}</Text>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-foreground font-semibold flex-1">{ann.title}</Text>
                    {!ann.read && (
                      <View className="w-2 h-2 rounded-full bg-primary ml-2" />
                    )}
                  </View>
                  <Text className="text-muted text-xs">{ann.date}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Detail View */}
        {selectedAnnouncement && (
          <View className="mx-4 mb-6 bg-surface rounded-xl p-4 border border-primary/50">
            <View className="flex-row items-center gap-2 mb-3">
              <Text className="text-2xl">{getTypeIcon(selectedAnnouncement.type)}</Text>
              <Text className="text-foreground font-bold text-lg flex-1">
                {selectedAnnouncement.title}
              </Text>
            </View>
            <View className="border-t border-border pt-3">
              <Text className="text-muted text-xs mb-2">{selectedAnnouncement.date}</Text>
              <Text className="text-foreground text-sm leading-relaxed">
                {selectedAnnouncement.content}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
