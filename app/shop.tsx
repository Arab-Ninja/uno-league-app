import { ScrollView, Text, View, TouchableOpacity, FlatList, Modal } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { products } from "@/lib/mock-data";
import { useState } from "react";
import { IconSymbol } from "@/components/ui/icon-symbol";

type Category = "all" | "headphones" | "watches" | "shoes" | "clothes" | "accessories";

export default function ShopScreen() {
  const { user, updateUnoPoints } = useAuth();
  const colors = useColors();
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!user) {
    return (
      <ScreenContainer className="flex items-center justify-center">
        <Text className="text-foreground text-lg">Chargement...</Text>
      </ScreenContainer>
    );
  }

  const filteredProducts =
    selectedCategory === "all"
      ? products
      : products.filter((p) => p.category === selectedCategory);

  const categories: { id: Category; label: string }[] = [
    { id: "all", label: "Tous" },
    { id: "headphones", label: "Écouteurs" },
    { id: "watches", label: "Montres" },
    { id: "shoes", label: "Chaussures" },
    { id: "clothes", label: "Vêtements" },
    { id: "accessories", label: "Accessoires" },
  ];

  const handlePurchase = async () => {
    if (!selectedProduct) return;
    if (user.unoPoints < selectedProduct.price) return;

    await updateUnoPoints(-selectedProduct.price);
    setShowConfirm(false);
    setSelectedProduct(null);
  };

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border">
          <Text className="text-2xl font-bold text-foreground">Webshop</Text>
          <Text className="text-muted text-sm mt-1">Le talent ça paie ! Et cela, toute l'année</Text>
        </View>

        {/* Balance Info */}
        <View className="mx-4 mt-4 bg-primary/10 rounded-lg p-3 border border-primary/20 flex-row items-center justify-between">
          <View>
            <Text className="text-muted text-xs">Solde disponible</Text>
            <Text className="text-foreground font-bold text-lg">{user.unoPoints} UNO</Text>
          </View>
          <Text className="text-primary font-bold text-lg">{(user.unoPoints / 10).toFixed(2)}€</Text>
        </View>

        {/* Category Filter */}
        <View className="px-4 mt-4 mb-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                onPress={() => setSelectedCategory(cat.id)}
                className={`py-2 px-4 rounded-full border ${
                  selectedCategory === cat.id
                    ? "bg-primary border-primary"
                    : "bg-surface border-border"
                }`}
              >
                <Text
                  className={`font-semibold text-sm ${
                    selectedCategory === cat.id ? "text-white" : "text-foreground"
                  }`}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Products Grid */}
        <View className="px-4 mb-6">
          <View className="flex-row flex-wrap gap-3">
            {filteredProducts.map((product) => (
              <TouchableOpacity
                key={product.id}
                onPress={() => {
                  setSelectedProduct(product);
                  setShowConfirm(true);
                }}
                className="flex-1 min-w-[45%] bg-surface rounded-xl border border-border overflow-hidden"
              >
                <View className="aspect-square bg-background items-center justify-center">
                  <Text className="text-5xl">{product.image}</Text>
                </View>
                <View className="p-3">
                  <Text className="text-foreground font-semibold text-sm mb-1 line-clamp-2">
                    {product.name}
                  </Text>
                  <View className="flex-row items-center justify-between">
                    <View className="bg-primary/20 px-2 py-1 rounded">
                      <Text className="text-primary font-bold text-xs">{product.price} UNO</Text>
                    </View>
                    {user.unoPoints >= product.price ? (
                      <View className="bg-success/20 px-2 py-1 rounded">
                        <Text className="text-success text-xs font-semibold">✓</Text>
                      </View>
                    ) : (
                      <View className="bg-error/20 px-2 py-1 rounded">
                        <Text className="text-error text-xs font-semibold">✕</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Purchase Confirmation Modal */}
      <Modal
        visible={showConfirm && selectedProduct !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirm(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-3xl p-6 pb-8">
            {selectedProduct && (
              <>
                <View className="items-center mb-6">
                  <Text className="text-6xl mb-4">{selectedProduct.image}</Text>
                  <Text className="text-foreground font-bold text-xl text-center">
                    {selectedProduct.name}
                  </Text>
                </View>

                <View className="bg-surface rounded-xl p-4 border border-border mb-6">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-muted text-sm">Prix</Text>
                    <Text className="text-foreground font-bold text-lg">
                      {selectedProduct.price} UNO
                    </Text>
                  </View>
                  <View className="border-t border-border pt-3 flex-row items-center justify-between">
                    <Text className="text-muted text-sm">Équivalent EUR</Text>
                    <Text className="text-foreground font-bold text-lg">
                      {(selectedProduct.price / 10).toFixed(2)}€
                    </Text>
                  </View>
                </View>

                <View className="bg-primary/10 rounded-xl p-4 border border-primary/20 mb-6">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-muted text-sm">Solde actuel</Text>
                    <Text className="text-foreground font-bold">{user.unoPoints} UNO</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-muted text-sm">Après achat</Text>
                    <Text
                      className={`font-bold ${
                        user.unoPoints - selectedProduct.price >= 0
                          ? "text-success"
                          : "text-error"
                      }`}
                    >
                      {user.unoPoints - selectedProduct.price} UNO
                    </Text>
                  </View>
                </View>

                <View className="flex-row gap-3">
                  <TouchableOpacity
                    onPress={() => setShowConfirm(false)}
                    className="flex-1 bg-surface border border-border rounded-lg py-3"
                  >
                    <Text className="text-foreground text-center font-semibold">Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handlePurchase}
                    disabled={user.unoPoints < selectedProduct.price}
                    className={`flex-1 rounded-lg py-3 ${
                      user.unoPoints >= selectedProduct.price
                        ? "bg-primary"
                        : "bg-muted/20"
                    }`}
                  >
                    <Text
                      className={`text-center font-bold ${
                        user.unoPoints >= selectedProduct.price
                          ? "text-white"
                          : "text-muted"
                      }`}
                    >
                      Acheter
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
