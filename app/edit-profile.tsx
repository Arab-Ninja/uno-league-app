import { ScrollView, Text, View, TouchableOpacity, TextInput, Image, Alert } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { CountryPicker } from "@/components/country-picker";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useState } from "react";
import * as ImagePicker from "expo-image-picker";

export default function EditProfileScreen() {
  const { user, updateProfile } = useAuth();
  const colors = useColors();
  const router = useRouter();

  const [firstName, setFirstName] = useState(user?.firstName || user?.name.split(" ")[0] || "");
  const [lastName, setLastName] = useState(user?.lastName || user?.name.split(" ").slice(1).join(" ") || "");
  const [dateOfBirth, setDateOfBirth] = useState(user?.dateOfBirth || "");
  const [email, setEmail] = useState(user?.email || "");
  const [nationality, setNationality] = useState(user?.nationality || "");
  const [profilePhoto, setProfilePhoto] = useState<string | undefined>(user?.profilePhoto ?? undefined);
  const [isLoading, setIsLoading] = useState(false);

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
    } catch (error) {
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
    } catch (error) {
      Alert.alert("Erreur", "Impossible de prendre une photo");
    }
  };

  const handleSave = async () => {
    if (!firstName || !lastName || !email || !nationality) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs");
      return;
    }

    setIsLoading(true);
    try {
      await updateProfile({
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        dateOfBirth,
        email,
        nationality,
        profilePhoto,
      });
      Alert.alert("Succès", "Profil mis à jour avec succès");
      router.back();
    } catch (error) {
      Alert.alert("Erreur", "Impossible de mettre à jour le profil");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()}>
            <Text className="text-2xl">←</Text>
          </TouchableOpacity>
          <View>
            <Text className="text-2xl font-bold text-foreground">Modifier Profil</Text>
          </View>
        </View>

        {/* Photo Section */}
        <View className="px-4 py-6">
          <Text className="text-foreground font-bold text-lg mb-4">Photo de Profil</Text>

          {/* Photo Display */}
          <View className="items-center mb-4">
            <View className="w-32 h-32 rounded-full bg-surface border-2 border-primary items-center justify-center overflow-hidden">
              {profilePhoto ? (
                <Image
                  source={{ uri: profilePhoto }}
                  className="w-full h-full"
                  resizeMode="cover"
                />
              ) : (
                <Text className="text-6xl">{user?.avatar || "👤"}</Text>
              )}
            </View>
          </View>

          {/* Photo Buttons */}
          <View className="flex-row gap-2 mb-6">
            <TouchableOpacity
              onPress={pickImage}
              className="flex-1 bg-primary rounded-lg py-3 px-4"
            >
              <Text className="text-white text-center font-bold text-sm">📷 Galerie</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={takePhoto}
              className="flex-1 bg-primary rounded-lg py-3 px-4"
            >
              <Text className="text-white text-center font-bold text-sm">📸 Caméra</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Form Section */}
        <View className="px-4 pb-6">
          <Text className="text-foreground font-bold text-lg mb-4">Informations Personnelles</Text>

          {/* First Name */}
          <View className="mb-4">
            <Text className="text-foreground font-semibold text-sm mb-2">Prénom</Text>
            <TextInput
              placeholder="Prénom"
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
              placeholder="Nom"
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
              placeholder="YYYY-MM-DD"
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
              placeholder="email@example.com"
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
          <View className="mb-6">
            <Text className="text-foreground font-semibold text-sm mb-2">Nationalité</Text>
            <CountryPicker
              value={nationality}
              onChange={setNationality}
              disabled={isLoading}
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={isLoading}
            className={`py-3 px-4 rounded-lg mb-3 ${
              isLoading ? "bg-muted/20" : "bg-primary"
            }`}
          >
            <Text
              className={`text-center font-bold text-sm ${
                isLoading ? "text-muted" : "text-white"
              }`}
            >
              {isLoading ? "Enregistrement..." : "Enregistrer"}
            </Text>
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity
            onPress={() => router.back()}
            disabled={isLoading}
            className="py-3 px-4 rounded-lg bg-surface border border-border"
          >
            <Text className="text-foreground text-center font-semibold text-sm">Annuler</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
