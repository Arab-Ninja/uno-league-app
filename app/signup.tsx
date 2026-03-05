import { ScrollView, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Image } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { CountryPicker } from "@/components/country-picker";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";

/** Validates password strength: min 8 chars, 1 uppercase, 1 digit. */
function isStrongPassword(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

export default function SignupScreen() {
  const { signup } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [nationality, setNationality] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled) {
        setProfilePhoto(result.assets[0].uri);
      }
    } catch (err) {
      Alert.alert("Erreur", "Impossible de sélectionner une image");
    }
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled) {
        setProfilePhoto(result.assets[0].uri);
      }
    } catch (err) {
      Alert.alert("Erreur", "Impossible de prendre une photo");
    }
  };

  const handleSignup = async () => {
    setError("");

    if (!firstName || !lastName || !dateOfBirth || !email || !nationality || !password) {
      setError("Veuillez remplir tous les champs");
      return;
    }

    if (!isStrongPassword(password)) {
      setError("Le mot de passe doit contenir au moins 8 caractères, 1 majuscule et 1 chiffre");
      return;
    }

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setIsLoading(true);

    try {
      await signup({
        firstName,
        lastName,
        dateOfBirth,
        email,
        nationality,
        password,
        profilePhoto,
      });
      router.replace("/(tabs)");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'inscription");
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrength = password.length === 0
    ? null
    : isStrongPassword(password)
    ? "fort"
    : password.length >= 6
    ? "moyen"
    : "faible";

  return (
    <ScreenContainer className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
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
          {/* Photo Section */}
          <View className="mb-6 items-center">
            <Text className="text-foreground font-semibold text-sm mb-3">Photo de Profil</Text>
            <View className="w-24 h-24 rounded-full bg-surface border-2 border-primary items-center justify-center overflow-hidden mb-4">
              {profilePhoto ? (
                <Image
                  source={{ uri: profilePhoto }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              ) : (
                <Text className="text-5xl">📸</Text>
              )}
            </View>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={pickImage}
                disabled={isLoading}
                className="flex-1 bg-primary rounded-lg py-2 px-3"
              >
                <Text className="text-white text-center font-semibold text-xs">Galerie</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={takePhoto}
                disabled={isLoading}
                className="flex-1 bg-primary rounded-lg py-2 px-3"
              >
                <Text className="text-white text-center font-semibold text-xs">Caméra</Text>
              </TouchableOpacity>
            </View>
          </View>

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
              autoCapitalize="none"
              editable={!isLoading}
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
            />
          </View>

          {/* Nationality — country picker */}
          <View className="mb-4">
            <Text className="text-foreground font-semibold text-sm mb-2">Nationalité</Text>
            <CountryPicker
              value={nationality}
              onChange={setNationality}
              disabled={isLoading}
            />
          </View>

          {/* Password */}
          <View className="mb-2">
            <Text className="text-foreground font-semibold text-sm mb-2">Mot de passe</Text>
            <View className="bg-surface border border-border rounded-lg flex-row items-center px-4">
              <TextInput
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                editable={!isLoading}
                className="flex-1 py-3 text-foreground"
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} className="pl-2 py-3">
                <Text className="text-muted text-sm">{showPassword ? "Cacher" : "Voir"}</Text>
              </TouchableOpacity>
            </View>
            {/* Strength indicator */}
            {passwordStrength && (
              <View className="flex-row items-center mt-1 gap-2">
                <View
                  className={`h-1 flex-1 rounded-full ${
                    passwordStrength === "fort"
                      ? "bg-success"
                      : passwordStrength === "moyen"
                      ? "bg-warning"
                      : "bg-error"
                  }`}
                />
                <Text
                  className={`text-xs ${
                    passwordStrength === "fort"
                      ? "text-success"
                      : passwordStrength === "moyen"
                      ? "text-warning"
                      : "text-error"
                  }`}
                >
                  {passwordStrength === "fort"
                    ? "Fort ✓"
                    : passwordStrength === "moyen"
                    ? "Moyen"
                    : "Faible"}
                </Text>
              </View>
            )}
            <Text className="text-muted text-xs mt-1">
              Min. 8 caractères, 1 majuscule, 1 chiffre
            </Text>
          </View>

          {/* Confirm Password */}
          <View className="mb-6">
            <Text className="text-foreground font-semibold text-sm mb-2">Confirmer le mot de passe</Text>
            <View className="bg-surface border border-border rounded-lg flex-row items-center px-4">
              <TextInput
                placeholder="••••••••"
                placeholderTextColor={colors.muted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                editable={!isLoading}
                className="flex-1 py-3 text-foreground"
              />
              <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} className="pl-2 py-3">
                <Text className="text-muted text-sm">{showConfirm ? "Cacher" : "Voir"}</Text>
              </TouchableOpacity>
            </View>
            {confirmPassword.length > 0 && (
              <Text
                className={`text-xs mt-1 ${
                  password === confirmPassword ? "text-success" : "text-error"
                }`}
              >
                {password === confirmPassword
                  ? "✓ Les mots de passe correspondent"
                  : "✗ Les mots de passe ne correspondent pas"}
              </Text>
            )}
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
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-center font-bold text-sm text-white">
                {"S'inscrire"}
              </Text>
            )}
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
          <Text className="text-success font-bold text-sm mb-2">{"🎁 Bonus d'inscription"}</Text>
          <Text className="text-muted text-xs">
            Recevez 1000 UNO gratuits en créant votre compte !
          </Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
