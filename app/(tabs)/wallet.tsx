import { ScrollView, Text, View, TouchableOpacity, Modal, TextInput } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { transactions, favoriteContacts } from "@/lib/mock-data";
import { useState } from "react";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function WalletScreen() {
  const { user, updateUnoPoints } = useAuth();
  const colors = useColors();
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendAmount, setSendAmount] = useState("");
  const [selectedContact, setSelectedContact] = useState<string | null>(null);

  if (!user) {
    return (
      <ScreenContainer className="flex items-center justify-center">
        <Text className="text-foreground text-lg">Chargement...</Text>
      </ScreenContainer>
    );
  }

  const eurValue = (user.unoPoints / 10).toFixed(2);

  const handleSend = async () => {
    if (!sendAmount || !selectedContact) return;
    const amount = parseInt(sendAmount);
    if (amount > user.unoPoints) return;

    await updateUnoPoints(-amount);
    setShowSendModal(false);
    setSendAmount("");
    setSelectedContact(null);
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
          <TouchableOpacity className="flex-1 bg-surface rounded-xl p-4 border border-border items-center">
            <IconSymbol name="arrow.down.left" size={24} color={colors.success} />
            <Text className="text-foreground font-semibold mt-2 text-sm">Recevoir</Text>
          </TouchableOpacity>
        </View>

        {/* Favorite Contacts */}
        <View className="mx-4 mt-6 mb-4">
          <Text className="text-foreground font-bold text-lg mb-3">Contacts Favoris</Text>
          <View className="flex-row gap-2">
            {favoriteContacts.map((contact) => (
              <TouchableOpacity
                key={contact.id}
                className="flex-1 bg-surface rounded-xl p-3 border border-border items-center"
              >
                <Text className="text-2xl mb-2">{contact.avatar || "👤"}</Text>
                <Text className="text-foreground font-semibold text-xs text-center">
                  {contact.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
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
              <View className="flex-row gap-2">
                {favoriteContacts.map((contact) => (
                  <TouchableOpacity
                    key={contact.id}
                    onPress={() => setSelectedContact(contact.id)}
                    className={`flex-1 py-3 px-3 rounded-lg border ${
                      selectedContact === contact.id
                        ? "bg-primary border-primary"
                        : "bg-surface border-border"
                    }`}
                  >
                    <Text
                      className={`text-center font-semibold text-xs ${
                        selectedContact === contact.id
                          ? "text-white"
                          : "text-foreground"
                      }`}
                    >
                      {contact.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
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
      </Modal>
    </ScreenContainer>
  );
}
