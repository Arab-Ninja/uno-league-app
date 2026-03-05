import { ScrollView, Text, View, TouchableOpacity, TextInput, Modal, Alert, FlatList, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useColors } from "@/hooks/use-colors";
import { products as initialProducts, Product } from "@/lib/mock-data";
import { useState } from "react";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";

// Named colour tokens used in the DB-status panel
const DB_COLORS = {
  green:  '#22c55e',
  amber:  '#f59e0b',
  red:    '#ef4444',
  blue:   '#3b82f6',
  orange: '#f97316',
  purple: '#a855f7',
  gray:   '#6b7280',
} as const;

/** Converts a hex colour + 0-1 alpha to an rgba() string. */
function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const DB_STAT_CARDS = [
  { label: "Joueurs",       key: "players"      as const, color: DB_COLORS.blue   },
  { label: "Propositions",  key: "proposals"    as const, color: DB_COLORS.orange },
  { label: "Participants",  key: "participants" as const, color: DB_COLORS.purple },
  { label: "Équipes",       key: "teams"        as const, color: '#7c3aed'        },
  { label: "Matchs",        key: "matches"      as const, color: '#0891b2'        },
  { label: "Boutique",      key: "shopItems"    as const, color: '#059669'        },
  { label: "Transactions",  key: "transactions" as const, color: DB_COLORS.green  },
  { label: "Users auth",    key: "users"        as const, color: DB_COLORS.gray   },
];

export default function AdminScreen() {
  const { user, allUsers, logout, updateUnoPoints, updatePlayerDivision, updateAllUsers } = useAuth();
  const colors = useColors();
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(true);

  // Webshop management
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", price: "", description: "" });

  // Player management
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [unoAmount, setUnoAmount] = useState("");
  const [selectedDivision, setSelectedDivision] = useState<"D1" | "D2" | "D3">("D1");

  const ADMIN_EMAIL = "portedehal@gmail.com";
  const ADMIN_PASSWORD = "admin123";

  // Live database stats (refetch on demand)
  const {
    data: dbStats,
    isFetching: dbLoading,
    error: dbError,
    refetch: refetchDb,
  } = trpc.admin.dbStats.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const handleAdminLogin = () => {
    if (adminEmail === ADMIN_EMAIL && adminPassword === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setShowLoginModal(false);
      setAdminEmail("");
      setAdminPassword("");
    } else {
      Alert.alert("Erreur", "Email ou mot de passe incorrect");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setShowLoginModal(true);
    setAdminEmail("");
    setAdminPassword("");
  };

  const handleAddProduct = () => {
    if (!newProduct.name || !newProduct.price || !newProduct.description) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs");
      return;
    }

    const product: Product = {
      id: `prod-${Date.now()}`,
      name: newProduct.name,
      category: "accessories",
      price: parseInt(newProduct.price),
      image: "📦",
      description: newProduct.description,
    };

    setProducts([...products, product]);
    setNewProduct({ name: "", price: "", description: "" });
    setShowAddProduct(false);
    Alert.alert("Succès", "Produit ajouté avec succès");
  };

  const handleDeleteProduct = (id: string) => {
    setProducts(products.filter((p) => p.id !== id));
    Alert.alert("Succès", "Produit supprimé");
  };

  const handleUpdateUno = async () => {
    if (!selectedPlayer || !unoAmount) {
      Alert.alert("Erreur", "Veuillez sélectionner un joueur et un montant");
      return;
    }

    const amount = parseInt(unoAmount);
    await updateUnoPoints(selectedPlayer, amount);
    setUnoAmount("");
    Alert.alert("Succès", `${amount} UNO ${amount > 0 ? "ajoutés" : "retirés"}`);
  };

  const handleUpdateDivision = async () => {
    if (!selectedPlayer) {
      Alert.alert("Erreur", "Veuillez sélectionner un joueur");
      return;
    }

    await updatePlayerDivision(selectedPlayer, selectedDivision);
    Alert.alert("Succès", `Division mise à jour en ${selectedDivision}`);
  };

  if (!isAuthenticated) {
    return (
      <ScreenContainer className="flex-1 bg-background items-center justify-center">
        <Modal
          visible={showLoginModal}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View className="flex-1 bg-black/50 items-center justify-center">
            <View className="bg-surface rounded-2xl p-6 w-80 border border-border">
              <Text className="text-foreground font-bold text-2xl text-center mb-6">
                Admin Panel
              </Text>

              <View className="mb-4">
                <Text className="text-foreground font-semibold text-sm mb-2">Email</Text>
                <TextInput
                  placeholder="portedehal@gmail.com"
                  placeholderTextColor={colors.muted}
                  value={adminEmail}
                  onChangeText={setAdminEmail}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-foreground"
                />
              </View>

              <View className="mb-6">
                <Text className="text-foreground font-semibold text-sm mb-2">Mot de passe</Text>
                <TextInput
                  placeholder="••••••••"
                  placeholderTextColor={colors.muted}
                  value={adminPassword}
                  onChangeText={setAdminPassword}
                  secureTextEntry
                  className="bg-background border border-border rounded-lg px-3 py-2 text-foreground"
                />
              </View>

              <TouchableOpacity
                onPress={handleAdminLogin}
                className="bg-primary rounded-lg py-3 mb-3"
              >
                <Text className="text-white text-center font-bold">Se connecter</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.back()}
                className="bg-surface border border-border rounded-lg py-3"
              >
                <Text className="text-foreground text-center font-semibold">Retour</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-4 pb-6 border-b border-border flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-foreground">Admin Panel</Text>
            <Text className="text-muted text-sm mt-1">Gestion UNO League</Text>
          </View>
          <TouchableOpacity
            onPress={handleLogout}
            className="bg-error/10 px-3 py-2 rounded-lg border border-error/20"
          >
            <Text className="text-error text-xs font-bold">Déconnexion</Text>
          </TouchableOpacity>
        </View>

        {/* KPI Dashboard */}
        <View className="px-4 mt-6 mb-6">
          <Text className="text-foreground font-bold text-lg mb-3">Tableau de Bord</Text>
          <View className="flex-row gap-3 mb-3">
            <View className="flex-1 bg-primary/10 rounded-xl p-4 border border-primary/20">
              <Text className="text-muted text-xs mb-1">Joueurs Actifs</Text>
              <Text className="text-foreground font-bold text-2xl">{allUsers.length}</Text>
            </View>
            <View className="flex-1 bg-success/10 rounded-xl p-4 border border-success/20">
              <Text className="text-muted text-xs mb-1">Produits</Text>
              <Text className="text-foreground font-bold text-2xl">{products.length}</Text>
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1 bg-warning/10 rounded-xl p-4 border border-warning/20">
              <Text className="text-muted text-xs mb-1">UNO Total</Text>
              <Text className="text-foreground font-bold text-2xl">
                {allUsers.reduce((sum, p) => sum + p.unoPoints, 0) / 1000}K
              </Text>
            </View>
            <View className="flex-1 bg-accent/10 rounded-xl p-4 border border-accent/20">
              <Text className="text-muted text-xs mb-1">Joueurs D1</Text>
              <Text className="text-foreground font-bold text-2xl">
                {allUsers.filter((p) => p.division === "D1").length}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Database Status Panel ─────────────────────────────────── */}
        <View className="px-4 mb-6">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor:
                    dbStats?.connected
                      ? DB_COLORS.green
                      : dbError || (dbStats !== undefined && !dbStats.connected)
                        ? DB_COLORS.red
                        : DB_COLORS.amber,
                }}
              />
              <Text className="text-foreground font-bold text-lg">État de la Base de Données</Text>
            </View>
            <TouchableOpacity
              onPress={() => refetchDb()}
              className="bg-primary/10 border border-primary/30 px-3 py-1 rounded-lg"
            >
              {dbLoading ? (
                <ActivityIndicator size="small" color={DB_COLORS.blue} />
              ) : (
                <Text className="text-primary text-xs font-bold">↻ Rafraîchir</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Connection status banner */}
          {(dbError || (dbStats && !dbStats.connected)) && (
            <View className="bg-error/10 border border-error/30 rounded-xl p-3 mb-3">
              <Text className="text-error font-bold text-sm">⚠ Base de données non connectée</Text>
              <Text className="text-error text-xs mt-1">
                {dbError
                  ? String(dbError.message)
                  : dbStats && "error" in dbStats && dbStats.error
                    ? String(dbStats.error)
                    : "Erreur inattendue du serveur. Vérifiez les logs du serveur."}
              </Text>
            </View>
          )}

          {/* Row counts */}
          {dbStats?.connected && dbStats.counts && (
            <>
              <View className="flex-row flex-wrap gap-2 mb-3">
                {DB_STAT_CARDS.map((stat) => (
                  <View
                    key={stat.label}
                    style={{ backgroundColor: rgba(stat.color, 0.09), borderColor: rgba(stat.color, 0.27), borderWidth: 1 }}
                    className="flex-1 min-w-[90px] rounded-xl p-3 items-center"
                  >
                    <Text className="text-muted text-xs mb-1">{stat.label}</Text>
                    <Text style={{ color: stat.color }} className="font-bold text-2xl">
                      {dbStats!.counts![stat.key]}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Recent players */}
              {dbStats.recent && dbStats.recent.players.length > 0 && (
                <View className="bg-surface border border-border rounded-xl p-3 mb-3">
                  <Text className="text-foreground font-bold text-sm mb-2">
                    Derniers joueurs inscrits en DB
                  </Text>
                  {dbStats.recent.players.map((p) => (
                    <View key={p.id} className="flex-row justify-between items-center py-1 border-b border-border/40">
                      <Text className="text-foreground text-xs flex-1">{p.name ?? "—"}</Text>
                      <Text className="text-muted text-xs">{p.division}</Text>
                      <Text className="text-primary text-xs ml-2">{p.unoPoints} UNO</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Recent proposals */}
              {dbStats.recent && dbStats.recent.proposals.length > 0 && (
                <View className="bg-surface border border-border rounded-xl p-3 mb-3">
                  <Text className="text-foreground font-bold text-sm mb-2">
                    Dernières propositions en DB
                  </Text>
                  {dbStats.recent.proposals.map((p) => (
                    <View key={p.id} className="flex-row justify-between items-center py-1 border-b border-border/40">
                      <Text className="text-foreground text-xs flex-1">{p.locationName}</Text>
                      <Text className="text-muted text-xs">{p.time}</Text>
                      <Text
                        style={{
                          color:
                            p.status === 'session'
                              ? DB_COLORS.green
                              : p.status === 'reservation'
                                ? DB_COLORS.amber
                                : DB_COLORS.blue,
                        }}
                        className="text-xs font-bold ml-2"
                      >
                        {p.status}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Recent transactions */}
              {dbStats.recent && dbStats.recent.transactions.length > 0 && (
                <View className="bg-surface border border-border rounded-xl p-3">
                  <Text className="text-foreground font-bold text-sm mb-2">
                    Dernières transactions UNO en DB
                  </Text>
                  {dbStats.recent.transactions.map((t) => (
                    <View key={t.id} className="flex-row justify-between items-center py-1 border-b border-border/40">
                      <Text className="text-foreground text-xs flex-1" numberOfLines={1}>{t.description}</Text>
                      <Text
                        style={{ color: t.amount >= 0 ? DB_COLORS.green : DB_COLORS.red }}
                        className="font-bold text-xs ml-2"
                      >
                        {t.amount >= 0 ? '+' : ''}{t.amount}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* All-empty state */}
              {dbStats.counts.players === 0 &&
                dbStats.counts.proposals === 0 &&
                dbStats.counts.transactions === 0 && (
                <View className="bg-surface border border-border rounded-xl p-4 items-center">
                  <Text className="text-muted text-sm text-center">
                    La base de données est vide. Inscrivez-vous et créez une proposition pour voir les données apparaître ici.
                  </Text>
                </View>
              )}
            </>
          )}

          {!dbStats && !dbLoading && !dbError && (
            <View className="bg-surface border border-border rounded-xl p-4 items-center">
              <Text className="text-muted text-sm">Appuyez sur ↻ Rafraîchir pour voir les statistiques de la base de données SQLite.</Text>
            </View>
          )}
        </View>

        {/* Webshop Management */}
        <View className="px-4 mb-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground font-bold text-lg">Webshop</Text>
            <TouchableOpacity
              onPress={() => setShowAddProduct(true)}
              className="bg-primary px-3 py-1 rounded-lg"
            >
              <Text className="text-white text-xs font-bold">+ Produit</Text>
            </TouchableOpacity>
          </View>

          {products.map((product) => (
            <View key={product.id} className="bg-surface rounded-xl p-3 border border-border mb-2 flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-foreground font-bold text-sm">{product.name}</Text>
                <Text className="text-muted text-xs">{product.price} UNO</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDeleteProduct(product.id)}
                className="bg-error/10 px-2 py-1 rounded"
              >
                <Text className="text-error text-xs font-bold">Supprimer</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Player Management */}
        <View className="px-4 mb-6">
          <Text className="text-foreground font-bold text-lg mb-3">Gestion Joueurs</Text>

          {/* Select Player */}
          <View className="mb-4">
            <Text className="text-foreground font-semibold text-sm mb-2">Sélectionner un joueur</Text>
            <View className="bg-surface border border-border rounded-lg max-h-40 overflow-hidden">
              <ScrollView>
                {allUsers.map((player) => (
                  <TouchableOpacity
                    key={player.id}
                    onPress={() => setSelectedPlayer(player.id)}
                    className={`p-3 border-b border-border ${
                      selectedPlayer === player.id ? "bg-primary/20" : ""
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        selectedPlayer === player.id
                          ? "text-primary font-bold"
                          : "text-foreground"
                      }`}
                    >
                      {player.name} ({player.division}) - {player.unoPoints} UNO
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* Update UNO */}
          <View className="mb-4">
            <Text className="text-foreground font-semibold text-sm mb-2">Modifier UNO</Text>
            <View className="flex-row gap-2">
              <TextInput
                placeholder="Montant (ex: 100 ou -50)"
                placeholderTextColor={colors.muted}
                value={unoAmount}
                onChangeText={setUnoAmount}
                keyboardType="number-pad"
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-foreground"
              />
              <TouchableOpacity
                onPress={handleUpdateUno}
                className="bg-primary px-4 rounded-lg items-center justify-center"
              >
                <Text className="text-white font-bold text-xs">Valider</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Update Division */}
          <View className="mb-6">
            <Text className="text-foreground font-semibold text-sm mb-2">Modifier Division</Text>
            <View className="flex-row gap-2 mb-2">
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
            <TouchableOpacity
              onPress={handleUpdateDivision}
              className="bg-primary rounded-lg py-2 px-4"
            >
              <Text className="text-white text-center font-bold text-sm">Mettre à jour</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Add Product Modal */}
        <Modal
          visible={showAddProduct}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAddProduct(false)}
        >
          <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-background rounded-t-3xl p-6 pb-8">
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-foreground font-bold text-lg">Ajouter un produit</Text>
                <TouchableOpacity onPress={() => setShowAddProduct(false)}>
                  <Text className="text-2xl">✕</Text>
                </TouchableOpacity>
              </View>

              <View className="mb-4">
                <Text className="text-foreground font-semibold text-sm mb-2">Nom</Text>
                <TextInput
                  placeholder="Nom du produit"
                  placeholderTextColor={colors.muted}
                  value={newProduct.name}
                  onChangeText={(text) => setNewProduct({ ...newProduct, name: text })}
                  className="bg-surface border border-border rounded-lg px-3 py-2 text-foreground"
                />
              </View>

              <View className="mb-4">
                <Text className="text-foreground font-semibold text-sm mb-2">Prix (UNO)</Text>
                <TextInput
                  placeholder="500"
                  placeholderTextColor={colors.muted}
                  value={newProduct.price}
                  onChangeText={(text) => setNewProduct({ ...newProduct, price: text })}
                  keyboardType="number-pad"
                  className="bg-surface border border-border rounded-lg px-3 py-2 text-foreground"
                />
              </View>

              <View className="mb-6">
                <Text className="text-foreground font-semibold text-sm mb-2">Description</Text>
                <TextInput
                  placeholder="Description du produit"
                  placeholderTextColor={colors.muted}
                  value={newProduct.description}
                  onChangeText={(text) => setNewProduct({ ...newProduct, description: text })}
                  multiline
                  numberOfLines={3}
                  className="bg-surface border border-border rounded-lg px-3 py-2 text-foreground"
                />
              </View>

              <TouchableOpacity
                onPress={handleAddProduct}
                className="bg-primary rounded-lg py-3 px-4"
              >
                <Text className="text-white text-center font-bold">Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </ScreenContainer>
  );
}
