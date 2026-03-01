import { ScrollView, Text, View, TouchableOpacity, TextInput } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";
import { useRouter } from "expo-router";

export default function SignupScreen() {
  const { signup } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [nationality, setNationality] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignup = async () => {
    if (!firstName || !lastName || !dateOfBirth || !email || !nationality) {
      setError("Veuillez remplir tous les champs");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await signup({
        firstName,
        lastName,
        dateOfBirth,
        email,
        nationality,
      });
      router.replace("/(tabs)");
    } catch (err) {
      setError("Erreur lors de l'inscription");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-6 pt-6 pb-6">
          <TouchableOpacity onPress={() => router.back()} className="mb-4">
            <Text className="text-2xl">←</Text>
          </TouchableOpacity>
          <Text className="text-3xl font-bold text-foreground">Inscription</Text>
          <Text className="text-muted text-sm mt-2">Créez votre compte UNO League</Text>
        </View>

        {/* Form Section */}
        <View className="px-6 pb-12">
          {/* First Name */}
          <View className="mb-4">
            <Text className="text-foreground font-semibold text-sm mb-2">Prénom</Text>
            <TextInput
              placeholder="Yassine"
              placeholderTextColor={colors.muted}
              value={firstName}
              onChangeText={setFirstName}
              editable={!isLoading}
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
            />
          </View>

          {/* Last Name */}
          <View className="mb-4">
            <Text className="text-foreground font-semibold text-sm mb-2">Nom</Text>
            <TextInput
              placeholder="Dupont"
              placeholderTextColor={colors.muted}
              value={lastName}
              onChangeText={setLastName}
              editable={!isLoading}
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
            />
          </View>

          {/* Date of Birth */}
          <View className="mb-4">
            <Text className="text-foreground font-semibold text-sm mb-2">Date de naissance</Text>
            <TextInput
              placeholder="1995-03-15"
              placeholderTextColor={colors.muted}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              editable={!isLoading}
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
            />
          </View>

          {/* Email */}
          <View className="mb-4">
            <Text className="text-foreground font-semibold text-sm mb-2">Email</Text>
            <TextInput
              placeholder="yassine@example.com"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              editable={!isLoading}
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
            />
          </View>

          {/* Nationality */}
          <View className="mb-6">
            <Text className="text-foreground font-semibold text-sm mb-2">Nationalité</Text>
            <TextInput
              placeholder="Belge"
              placeholderTextColor={colors.muted}
              value={nationality}
              onChangeText={setNationality}
              editable={!isLoading}
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
            />
          </View>

          {/* Error Message */}
          {error && (
            <View className="bg-error/10 border border-error rounded-lg p-3 mb-6">
              <Text className="text-error text-sm">{error}</Text>
            </View>
          )}

          {/* Signup Button */}
          <TouchableOpacity
            onPress={handleSignup}
            disabled={isLoading}
            className={`py-3 px-4 rounded-lg mb-4 ${
              isLoading ? "bg-muted/20" : "bg-primary"
            }`}
          >
            <Text
              className={`text-center font-bold text-sm ${
                isLoading ? "text-muted" : "text-white"
              }`}
            >
              {isLoading ? "Inscription en cours..." : "S'inscrire"}
            </Text>
          </TouchableOpacity>

          {/* Login Link */}
          <View className="flex-row items-center justify-center gap-2">
            <Text className="text-muted text-sm">Déjà inscrit ?</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text className="text-primary font-bold text-sm">Se connecter</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Info */}
        <View className="mx-6 mb-6 bg-success/10 rounded-xl p-4 border border-success/20">
          <Text className="text-success font-bold text-sm mb-2">🎁 Bonus d'inscription</Text>
          <Text className="text-muted text-xs">
            Recevez 1000 UNO gratuits en créant votre compte !
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
