import { ScrollView, Text, View, TouchableOpacity, Modal, TextInput, TouchableWithoutFeedback, Keyboard, Alert } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { transactions, allPlayers } from "@/lib/mock-data";
import { useState } from "react";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { UnoLeagueHeader } from "@/components/uno-league-header";
import { trpc } from "@/lib/trpc";

export default function WalletScreen() {
  const { user, updateUnoPoints } = useAuth();
  const colors = useColors();
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendAmount, setSendAmount] = useState("");
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [playerSearch, setPlayerSearch] = useState("");

  const addPointsMutation = trpc.players.addPoints.useMutation();

  // All players except the current user (filter by email to avoid self-send)
  const otherPlayers = allPlayers.filter((p) => p.email !== user?.email);
  const filteredPlayers = otherPlayers.filter((p) =>
    p.name.toLowerCase().includes(playerSearch.toLowerCase()),
  );

  if (!user) {
    return (
      <ScreenContainer className="flex items-center justify-center">
        <Text className="text-foreground text-lg">Chargement...</Text>
      </ScreenContainer>
    );
  }

  const eurValue = ((user.unoPoints ?? 0) / 10).toFixed(2);

  const handleSend = async () => {
    if (!sendAmount || !selectedContact) {
      Alert.alert("Erreur", "Veuillez saisir un montant et sélectionner un joueur.");
      return;
    }
    const amount = parseInt(sendAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Erreur", "Le montant doit être un nombre positif.");
      return;
    }
    const currentBalance = user?.unoPoints ?? 0;
    if (amount > currentBalance) {
      Alert.alert("Solde insuffisant", `Vous ne disposez que de ${currentBalance} UNO.`);
      return;
    }

    // Deduct from current user
    const recipient = otherPlayers.find((p) => p.id === selectedContact);
    const recipientName = recipient?.name ?? selectedContact;
    await updateUnoPoints(-amount, `Envoyé à ${recipientName}`, "send");

    // Try to add to recipient (may fail for mock players without real openIds)
    if (recipient?.email) {
      try {
        await addPointsMutation.mutateAsync({
          openId: recipient.email,
          delta: amount,
          description: `Reçu de ${user?.name ?? ""}`,
          type: "receive",
        });
      } catch {
        // Ignore if recipient not found in DB (mock players)
      }
    }

    setShowSendModal(false);
    setSendAmount("");
    setSelectedContact(null);
    setPlayerSearch("");
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case "send":
        return "↗️";
      case "receive":
        return "↙️";
      case "purchase":
        return "🛍️";
      case "reward":
        return "🏆";
      default:
        return "💳";
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case "send":
        return "text-error";
      case "receive":
        return "text-success";
      case "purchase":
        return "text-warning";
      case "reward":
        return "text-primary";
      default:
        return "text-foreground";
    }
  };

  return (
    <ScreenContainer className="flex-1 bg-background">
      <UnoLeagueHeader unoBalance={user?.unoPoints ?? 0} showBalance={true} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border">
          <Text className="text-2xl font-bold text-foreground">Portefeuille</Text>
          <Text className="text-muted text-sm mt-1">Gérez vos points UNO</Text>
        </View>

        {/* Balance Card */}
        <View className="mx-4 mt-6 bg-gradient-to-b from-primary to-primary/80 rounded-2xl p-6 shadow-lg">
          <Text className="text-sm text-white/80 mb-2">Solde Total</Text>
          <View className="flex-row items-baseline gap-2 mb-6">
            <Text className="text-4xl font-bold text-white">{(user.unoPoints ?? 0).toLocaleString()}</Text>
            <Text className="text-lg text-white/80">UNO</Text>
          </View>
          <View className="border-t border-white/20 pt-4">
            <Text className="text-sm text-white/80">Équivalent EUR</Text>
            <Text className="text-2xl font-bold text-white">{eurValue}€</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="mx-4 mt-6 flex-row gap-3">
          <TouchableOpacity
            onPress={() => setShowSendModal(true)}
            className="flex-1 bg-surface rounded-xl p-4 border border-border items-center"
          >
            <IconSymbol name="arrow.up.right" size={24} color={colors.primary} />
            <Text className="text-foreground font-semibold mt-2 text-sm">Envoyer</Text>
          </TouchableOpacity>
        </View>

        {/* Transaction History */}
        <View className="mx-4 mb-6">
          <Text className="text-foreground font-bold text-lg mb-3">Historique</Text>
          {transactions.map((trans) => (
            <TouchableOpacity
              key={trans.id}
              className="flex-row items-center gap-3 p-4 bg-surface rounded-xl border border-border mb-2"
            >
              <Text className="text-2xl">{getTransactionIcon(trans.type)}</Text>
              <View className="flex-1">
                <Text className="text-foreground font-semibold text-sm">
                  {trans.description}
                </Text>
                <Text className="text-muted text-xs mt-1">{trans.date}</Text>
              </View>
              <Text
                className={`font-bold text-sm ${
                  trans.amount > 0 ? "text-success" : "text-error"
                }`}
              >
                {trans.amount > 0 ? "+" : ""}{trans.amount}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Send Modal */}
      <Modal
        visible={showSendModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSendModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-3xl p-6 pb-8">
            <View className="flex-row items-center justify-between mb-6">
              <Text className="text-foreground font-bold text-lg">Envoyer des UNO</Text>
              <TouchableOpacity onPress={() => setShowSendModal(false)}>
                <Text className="text-2xl">✕</Text>
              </TouchableOpacity>
            </View>

            {/* Amount Input */}
            <View className="mb-4">
              <Text className="text-foreground font-semibold text-sm mb-2">Montant</Text>
              <View className="flex-row items-center bg-surface border border-border rounded-lg px-3">
                <TextInput
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  keyboardType="numeric"
                  value={sendAmount}
                  onChangeText={setSendAmount}
                  className="flex-1 py-3 text-foreground text-lg"
                />
                <Text className="text-muted font-semibold">UNO</Text>
              </View>
              <Text className="text-muted text-xs mt-2">
                Solde disponible: {user.unoPoints ?? 0} UNO
              </Text>
            </View>

            {/* Contact Selection */}
            <View className="mb-6">
              <Text className="text-foreground font-semibold text-sm mb-2">Destinataire</Text>
              {/* Search box */}
              <View className="flex-row items-center bg-surface border border-border rounded-lg px-3 mb-2">
                <TextInput
                  placeholder="Rechercher un joueur..."
                  placeholderTextColor={colors.muted}
                  value={playerSearch}
                  onChangeText={setPlayerSearch}
                  className="flex-1 py-2 text-foreground text-sm"
                />
              </View>
              {/* Scrollable player list (max ~3 rows visible) */}
              <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
                {filteredPlayers.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setSelectedContact(p.id)}
                    className={`py-3 px-3 rounded-lg border mb-1 flex-row items-center justify-between ${
                      selectedContact === p.id
                        ? "bg-primary border-primary"
                        : "bg-surface border-border"
                    }`}
                  >
                    <Text
                      className={`font-semibold text-sm ${
                        selectedContact === p.id ? "text-white" : "text-foreground"
                      }`}
                    >
                      {p.name}
                    </Text>
                    <Text
                      className={`text-xs ${
                        selectedContact === p.id ? "text-white/70" : "text-muted"
                      }`}
                    >
                      {p.division} · {p.unoPoints} UNO
                    </Text>
                  </TouchableOpacity>
                ))}
                {filteredPlayers.length === 0 && (
                  <Text className="text-muted text-sm text-center py-4">Aucun joueur trouvé</Text>
                )}
              </ScrollView>
            </View>

            {/* Send Button */}
            <TouchableOpacity
              onPress={handleSend}
              disabled={!sendAmount || !selectedContact}
              className={`py-3 px-4 rounded-lg ${
                sendAmount && selectedContact ? "bg-primary" : "bg-muted/20"
              }`}
            >
              <Text
                className={`text-center font-bold text-sm ${
                  sendAmount && selectedContact ? "text-white" : "text-muted"
                }`}
              >
                Envoyer
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        </TouchableWithoutFeedback>
      </Modal>
    </ScreenContainer>
  );
}
