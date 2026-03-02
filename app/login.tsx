import { ScrollView, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";
import { useRouter } from "expo-router";

export default function LoginScreen() {
  const { login } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Veuillez remplir tous les champs");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await login(email, password);
      router.replace("/(tabs)");
    } catch (err) {
      setError("Email ou mot de passe incorrect");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenContainer className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Logo Section */}
        <View className="items-center pt-12 pb-8">
          <Text className="text-6xl mb-4">⚽</Text>
          <Text className="text-3xl font-bold text-foreground">UNO League</Text>
          <Text className="text-muted text-sm mt-2">The Ultimate Number One</Text>
        </View>

        {/* Form Section */}
        <View className="px-6 pb-12">
          <Text className="text-foreground font-bold text-2xl mb-2">Connexion</Text>
          <Text className="text-muted text-sm mb-6">
            Connectez-vous pour accéder à votre compte
          </Text>

          {/* Email Input */}
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

          {/* Password Input */}
          <View className="mb-6">
            <Text className="text-foreground font-semibold text-sm mb-2">Mot de passe</Text>
            <TextInput
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
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

          {/* Login Button */}
          <TouchableOpacity
            onPress={handleLogin}
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
              {isLoading ? "Connexion en cours..." : "Se connecter"}
            </Text>
          </TouchableOpacity>

          {/* Signup Link */}
          <View className="flex-row items-center justify-center gap-2">
            <Text className="text-muted text-sm">Pas encore inscrit ?</Text>
            <TouchableOpacity onPress={() => router.push("/signup" as any)}>
              <Text className="text-primary font-bold text-sm">S'inscrire</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Demo Info */}
        <View className="mx-6 mb-6 bg-primary/10 rounded-xl p-4 border border-primary/20">
          <Text className="text-primary font-bold text-sm mb-2">📝 Compte de test</Text>
          <Text className="text-muted text-xs mb-1">Email: yassine@example.com</Text>
          <Text className="text-muted text-xs">Mot de passe: password123</Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
