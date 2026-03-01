import { ScrollView, Text, View, TouchableOpacity } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { announcements } from "@/lib/mock-data";
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

        {/* Announcements List */}
        <View className="px-4 mt-6 mb-6">
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
