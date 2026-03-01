import { ScrollView, Text, View, TouchableOpacity, Modal, TextInput, Pressable } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { matches, LOCATIONS } from "@/lib/mock-data";
import { useState } from "react";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function CalendarScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const [selectedDivision, setSelectedDivision] = useState<"D1" | "D2" | "D3">(user?.division || "D1");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [newMatchTime, setNewMatchTime] = useState("");
  const [selectedMode, setSelectedMode] = useState<"amical" | "league">("league");
  const [localMatches, setLocalMatches] = useState(matches);

  const filteredMatches = localMatches.filter((m) => m.division === selectedDivision);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "available":
        return "bg-success/20";
      case "booked":
        return "bg-primary/20";
      case "full":
        return "bg-error/20";
      default:
        return "bg-muted/20";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "available":
        return "Disponible";
      case "booked":
        return "Réservé";
      case "full":
        return "Complet";
      default:
        return status;
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case "available":
        return "text-success";
      case "booked":
        return "text-primary";
      case "full":
        return "text-error";
      default:
        return "text-muted";
    }
  };

  const handleCreateMatch = () => {
    if (!selectedLocation || !newMatchTime) return;
    const maxParticipants = selectedMode === "amical" ? 10 : 15;
    const newMatch = {
      id: `match-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      time: newMatchTime,
      division: selectedDivision,
      status: "available" as const,
      participants: 1,
      maxParticipants,
      location: selectedLocation,
      createdBy: user?.id,
      mode: selectedMode,
      price: selectedMode === "amical" ? 5 : 10,
      rewards: selectedMode === "amical" ? "50 UNO par participant" : "250 UNO pour le meilleur buteur",
    };
    setLocalMatches([...localMatches, newMatch]);
    setShowCreateModal(false);
    setSelectedLocation(null);
    setNewMatchTime("");
  };

  const handleJoinMatch = (matchId: string) => {
    setLocalMatches(
      localMatches.map((m) =>
        m.id === matchId && m.participants < m.maxParticipants
          ? { ...m, participants: m.participants + 1 }
          : m
      )
    );
  };

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border">
          <Text className="text-2xl font-bold text-foreground">Calendrier des Matchs</Text>
          <Text className="text-muted text-sm mt-1">Réservez vos sessions de jeu</Text>
        </View>

        {/* Create Match Button */}
        <View className="mx-4 mt-4 mb-4">
          <TouchableOpacity
            onPress={() => setShowCreateModal(true)}
            className="bg-primary rounded-xl py-3 px-4 flex-row items-center justify-center gap-2"
          >
            <Text className="text-white text-lg">+</Text>
            <Text className="text-white font-bold">Créer une proposition</Text>
          </TouchableOpacity>
        </View>

        {/* Division Filter */}
        <View className="px-4 mb-4">
          <Text className="text-foreground font-semibold text-sm mb-3">Ma Division</Text>
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

        {/* Matches List */}
        <View className="px-4 mb-6">
          <Text className="text-foreground font-semibold text-sm mb-3">Créneaux Disponibles</Text>
          {filteredMatches.length > 0 ? (
            filteredMatches.map((match) => (
              <TouchableOpacity
                key={match.id}
                className="bg-surface rounded-xl p-4 border border-border mb-3"
              >
                <View className="flex-row items-start justify-between mb-3">
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-2">
                      <IconSymbol name="calendar" size={16} color={colors.muted} />
                      <Text className="text-muted text-sm">{match.date}</Text>
                      <Text className="text-muted text-sm">•</Text>
                      <Text className="text-foreground font-semibold">{match.time}</Text>
                    </View>
                    <Text className="text-muted text-xs">{match.location}</Text>
                  </View>
                  <View
                    className={`px-3 py-1 rounded-full ${getStatusColor(match.status)}`}
                  >
                    <Text
                      className={`text-xs font-semibold ${getStatusTextColor(match.status)}`}
                    >
                      {getStatusText(match.status)}
                    </Text>
                  </View>
                </View>

                <View className="bg-background rounded-lg p-3 mb-3">
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-muted text-xs">Participants</Text>
                      <Text className="text-foreground font-bold text-lg">
                        {match.participants}/{match.maxParticipants}
                      </Text>
                    </View>
                    <View className="flex-1 mx-3 h-1 bg-border rounded-full overflow-hidden">
                      <View
                        className="bg-primary h-full"
                        style={{
                          width: `${(match.participants / match.maxParticipants) * 100}%`,
                        }}
                      />
                    </View>
                    <Text className="text-muted text-xs text-right">
                      {match.maxParticipants - match.participants} places
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => handleJoinMatch(match.id)}
                  className={`py-2 px-4 rounded-lg ${
                    match.status === "available"
                      ? "bg-primary"
                      : "bg-muted/20"
                  }`}
                  disabled={match.status !== "available"}
                >
                  <Text
                    className={`text-center font-semibold text-sm ${
                      match.status === "available"
                        ? "text-white"
                        : "text-muted"
                    }`}
                  >
                    {match.status === "available"
                      ? "Rejoindre"
                      : match.status === "booked"
                        ? "Déjà rejoint"
                        : "Complet"}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          ) : (
            <View className="bg-surface rounded-xl p-8 border border-border items-center">
              <Text className="text-2xl mb-2">📅</Text>
              <Text className="text-foreground font-semibold">Aucun créneau disponible</Text>
              <Text className="text-muted text-sm text-center mt-2">
                Revenez bientôt pour voir les prochains matchs
              </Text>
            </View>
          )}
        </View>

        {/* Info Box */}
        <View className="mx-4 mb-6 bg-primary/10 rounded-xl p-4 border border-primary/20">
          <View className="flex-row gap-3">
            <Text className="text-2xl">ℹ️</Text>
            <View className="flex-1">
              <Text className="text-foreground font-semibold text-sm mb-1">
                Comment ça marche ?
              </Text>
              <Text className="text-muted text-xs">
                Sélectionnez un créneau disponible et rejoignez la proposition. Vous serez réparti aléatoirement dans une équipe de 5 joueurs.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Create Match Modal */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-3xl p-6 pb-8">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-foreground font-bold text-lg">Créer une proposition</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Text className="text-2xl">✕</Text>
              </TouchableOpacity>
            </View>

            {/* Division Selection */}
            <View className="mb-4">
              <Text className="text-foreground font-semibold text-sm mb-2">Division</Text>
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

            {/* Location Selection */}
            <View className="mb-4">
              <Text className="text-foreground font-semibold text-sm mb-2">Lieu</Text>
              <View className="bg-surface border border-border rounded-lg max-h-40 overflow-hidden">
                <ScrollView>
                  {LOCATIONS.map((loc) => (
                    <Pressable
                      key={loc}
                      onPress={() => setSelectedLocation(loc)}
                      className={`p-3 border-b border-border ${
                        selectedLocation === loc ? "bg-primary/20" : ""
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          selectedLocation === loc
                            ? "text-primary font-bold"
                            : "text-foreground"
                        }`}
                      >
                        {loc}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            {/* Time Input */}
            <View className="mb-6">
              <Text className="text-foreground font-semibold text-sm mb-2">Horaire</Text>
              <View className="flex-row items-center bg-surface border border-border rounded-lg px-3">
                <TextInput
                  placeholder="14:00"
                  placeholderTextColor={colors.muted}
                  value={newMatchTime}
                  onChangeText={setNewMatchTime}
                  className="flex-1 py-3 text-foreground text-lg"
                />
              </View>
            </View>

            {/* Create Button */}
            <TouchableOpacity
              onPress={handleCreateMatch}
              disabled={!selectedLocation || !newMatchTime}
              className={`py-3 px-4 rounded-lg ${
                selectedLocation && newMatchTime ? "bg-primary" : "bg-muted/20"
              }`}
            >
              <Text
                className={`text-center font-bold text-sm ${
                  selectedLocation && newMatchTime ? "text-white" : "text-muted"
                }`}
              >
                Créer la proposition
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
