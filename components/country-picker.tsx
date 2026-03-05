/**
 * CountryPicker — reusable country selector with flag emojis.
 *
 * Shows a pressable button displaying the selected country + flag.
 * Tapping it opens a full-screen modal with a search field and a
 * scrollable list of all countries in French.
 */
import React, { useState, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Platform,
} from "react-native";
import { COUNTRIES, Country } from "@/lib/countries";
import { useColors } from "@/hooks/use-colors";

interface Props {
  value: string;
  onChange: (countryName: string) => void;
  disabled?: boolean;
}

export function CountryPicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const colors = useColors();

  const filtered = useMemo(() => {
    if (!search.trim()) return COUNTRIES;
    const q = search.toLowerCase();
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [search]);

  const selected = COUNTRIES.find(
    (c) => c.name.toLowerCase() === value.toLowerCase()
  );

  const handleSelect = (country: Country) => {
    onChange(country.name);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      {/* Trigger button */}
      <TouchableOpacity
        onPress={() => !disabled && setOpen(true)}
        className="bg-surface border border-border rounded-lg px-4 py-3 flex-row items-center justify-between"
        activeOpacity={disabled ? 1 : 0.7}
      >
        <Text className={value ? "text-foreground text-base" : "text-muted text-base"}>
          {selected ? `${selected.flag}  ${selected.name}` : "Choisir un pays…"}
        </Text>
        <Text className="text-muted text-sm">▼</Text>
      </TouchableOpacity>

      {/* Modal */}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setOpen(false);
          setSearch("");
        }}
      >
        <SafeAreaView className="flex-1 bg-background">
          {/* Header */}
          <View
            className="flex-row items-center justify-between px-4 py-3 border-b border-border"
            style={{ paddingTop: Platform.OS === "android" ? 16 : 8 }}
          >
            <Text className="text-foreground font-bold text-lg">Choisir un pays</Text>
            <TouchableOpacity
              onPress={() => {
                setOpen(false);
                setSearch("");
              }}
              className="p-2"
            >
              <Text className="text-primary font-bold text-base">Fermer</Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View className="px-4 py-3">
            <TextInput
              placeholder="Rechercher un pays…"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              autoFocus
              className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground"
            />
          </View>

          {/* List */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const isSelected = item.name.toLowerCase() === value.toLowerCase();
              return (
                <TouchableOpacity
                  onPress={() => handleSelect(item)}
                  className={`flex-row items-center px-4 py-3 border-b border-border/30 ${
                    isSelected ? "bg-primary/10" : ""
                  }`}
                  activeOpacity={0.7}
                >
                  <Text className="text-2xl mr-3">{item.flag}</Text>
                  <Text
                    className={`text-base flex-1 ${
                      isSelected ? "text-primary font-bold" : "text-foreground"
                    }`}
                  >
                    {item.name}
                  </Text>
                  {isSelected && <Text className="text-primary font-bold">✓</Text>}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
