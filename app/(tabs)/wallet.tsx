import { ScrollView, Text, View, TouchableOpacity, Modal, TextInput, TouchableWithoutFeedback, Keyboard, Alert, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { allPlayers } from "@/lib/mock-data";
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

  const openId = user?.email ?? user?.id ?? "";

  // Real transaction history from the database; falls back to empty while loading
  const { data: dbTransactions, refetch: refetchTransactions } =
    trpc.players.transactions.useQuery(
      { openId },
      { enabled: !!openId, staleTime: 30_000 },
    );

  // Mutation to sync point changes to the database and record the transaction
  const addPointsSenderMutation = trpc.players.addPoints.useMutation({
    onSuccess: () => {
      // Refresh transaction list after a successful DB write
      refetchTransactions();
    },
  });
  const addPointsReceiverMutation = trpc.players.addPoints.useMutation();

  // All players except the current user
  const otherPlayers = allPlayers.filter((p) => p.id !== user?.id);
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

  const eurValue = (user.unoPoints / 10).toFixed(2);

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
    if (amount > user.unoPoints) {
      Alert.alert("Solde insuffisant", `Vous ne disposez que de ${user.unoPoints} UNO.`);
      return;
    }

    const recipientPlayer = allPlayers.find((p) => p.id === selectedContact);
    const recipientOpenId = recipientPlayer?.email ?? selectedContact;
    const recipientName = recipientPlayer?.name ?? "Joueur";

    // Update local state (AsyncStorage) immediately
    await updateUnoPoints(user.id, -amount);
    await updateUnoPoints(selectedContact, amount);

    // Sync to database in the background (fire-and-forget, non-blocking)
    const senderOpenId = openId;
    addPointsSenderMutation.mutate({
      openId: senderOpenId,
      delta: -amount,
      type: "send",
      description: `Envoi à ${recipientName}`,
      toOpenId: recipientOpenId,
    });
    addPointsReceiverMutation.mutate({
      openId: recipientOpenId,
      delta: amount,
      type: "receive",
      description: `Reçu de ${user.name}`,
      fromOpenId: senderOpenId,
    });

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

  // Format a DB timestamp or ISO string to a readable date
  const formatDate = (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
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
            <Text className="text-4xl font-bold text-white">{user.unoPoints.toLocaleString()}</Text>
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
          {dbTransactions === undefined ? (
            <View className="items-center py-6">
              <ActivityIndicator />
            </View>
          ) : dbTransactions.length === 0 ? (
            <View className="bg-surface rounded-xl border border-border p-4 items-center">
              <Text className="text-muted text-sm text-center">Aucune transaction pour le moment.</Text>
            </View>
          ) : (
            dbTransactions.map((trans) => (
              <TouchableOpacity
                key={trans.id}
                className="flex-row items-center gap-3 p-4 bg-surface rounded-xl border border-border mb-2"
              >
                <Text className="text-2xl">{getTransactionIcon(trans.type)}</Text>
                <View className="flex-1">
                  <Text className="text-foreground font-semibold text-sm">
                    {trans.description}
                  </Text>
                  <Text className="text-muted text-xs mt-1">{formatDate(trans.createdAt)}</Text>
                </View>
                <Text
                  className={`font-bold text-sm ${getTransactionColor(trans.type)}`}
                >
                  {trans.amount > 0 ? "+" : ""}{trans.amount}
                </Text>
              </TouchableOpacity>
            ))
          )}
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
                Solde disponible: {user.unoPoints} UNO
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
