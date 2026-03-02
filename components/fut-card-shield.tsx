import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface FUTCardProps {
  playerName: string;
  position: string;
  country: string;
  stats: {
    pac: number;
    sho: number;
    pas: number;
    dri: number;
    def: number;
    phy: number;
  };
  profilePhoto?: string;
}

const COUNTRY_FLAGS: { [key: string]: string } = {
  'Maroc': '🇲🇦',
  'France': '🇫🇷',
  'Belgique': '🇧🇪',
  'Espagne': '🇪🇸',
  'Italie': '🇮🇹',
  'Allemagne': '🇩🇪',
  'Portugal': '🇵🇹',
  'Pays-Bas': '🇳🇱',
  'Angleterre': '🇬🇧',
  'Suisse': '🇨🇭',
  'Suède': '🇸🇪',
  'Norvège': '🇳🇴',
  'Danemark': '🇩🇰',
  'Pologne': '🇵🇱',
  'République Tchèque': '🇨🇿',
  'Roumanie': '🇷🇴',
  'Hongrie': '🇭🇺',
  'Slovaquie': '🇸🇰',
  'Slovénie': '🇸🇮',
  'Croatie': '🇭🇷',
  'Serbie': '🇷🇸',
  'Bosnie-Herzégovine': '🇧🇦',
  'Monténégro': '🇲🇪',
  'Albanie': '🇦🇱',
  'Macédoine': '🇲🇰',
  'Grèce': '🇬🇷',
  'Chypre': '🇨🇾',
  'Malte': '🇲🇹',
  'Irlande': '🇮🇪',
  'Irlande du Nord': '🇬🇧',
  'Écosse': '🇬🇧',
  'Pays de Galles': '🇬🇧',
  'Turquie': '🇹🇷',
  'Israël': '🇮🇱',
  'Liban': '🇱🇧',
  'Syrie': '🇸🇾',
  'Irak': '🇮🇶',
  'Iran': '🇮🇷',
  'Afghanistan': '🇦🇫',
  'Pakistan': '🇵🇰',
  'Inde': '🇮🇳',
  'Bangladesh': '🇧🇩',
  'Népal': '🇳🇵',
  'Sri Lanka': '🇱🇰',
  'Thaïlande': '🇹🇭',
  'Cambodge': '🇰🇭',
  'Laos': '🇱🇦',
  'Vietnam': '🇻🇳',
  'Malaisie': '🇲🇾',
  'Singapour': '🇸🇬',
  'Indonésie': '🇮🇩',
  'Philippines': '🇵🇭',
  'Brunei': '🇧🇳',
  'Timor oriental': '🇹🇱',
  'Japon': '🇯🇵',
  'Corée du Sud': '🇰🇷',
  'Corée du Nord': '🇰🇵',
  'Chine': '🇨🇳',
  'Taïwan': '🇹🇼',
  'Hong Kong': '🇭🇰',
  'Macao': '🇲🇴',
  'Mongolie': '🇲🇳',
  'Kazakhstan': '🇰🇿',
  'Ouzbékistan': '🇺🇿',
  'Turkménistan': '🇹🇲',
  'Kirghizistan': '🇰🇬',
  'Tadjikistan': '🇹🇯',
  'Russie': '🇷🇺',
  'Ukraine': '🇺🇦',
  'Biélorussie': '🇧🇾',
  'Moldavie': '🇲🇩',
  'Géorgie': '🇬🇪',
  'Arménie': '🇦🇲',
  'Azerbaïdjan': '🇦🇿',
  'Égypte': '🇪🇬',
  'Libye': '🇱🇾',
  'Tunisie': '🇹🇳',
  'Algérie': '🇩🇿',
  'Mauritanie': '🇲🇷',
  'Sénégal': '🇸🇳',
  'Gambie': '🇬🇲',
  'Guinée-Bissau': '🇬🇼',
  'Guinée': '🇬🇳',
  'Sierra Leone': '🇸🇱',
  'Liberia': '🇱🇷',
  'Mali': '🇲🇱',
  'Burkina Faso': '🇧🇫',
  'Côte d\'Ivoire': '🇨🇮',
  'Ghana': '🇬🇭',
  'Togo': '🇹🇬',
  'Bénin': '🇧🇯',
  'Niger': '🇳🇪',
  'Nigeria': '🇳🇬',
  'Cameroun': '🇨🇲',
  'Gabon': '🇬🇦',
  'Congo': '🇨🇬',
  'République Démocratique du Congo': '🇨🇩',
  'Angola': '🇦🇴',
  'Zambie': '🇿🇲',
  'Zimbabwe': '🇿🇼',
  'Malawi': '🇲🇼',
  'Mozambique': '🇲🇿',
  'Afrique du Sud': '🇿🇦',
  'Namibie': '🇳🇦',
  'Botswana': '🇧🇼',
  'Lesotho': '🇱🇸',
  'Eswatini': '🇸🇿',
  'Madagascar': '🇲🇬',
  'Maurice': '🇲🇺',
  'Seychelles': '🇸🇨',
  'Comores': '🇰🇲',
  'Djibouti': '🇩🇯',
  'Somalie': '🇸🇴',
  'Éthiopie': '🇪🇹',
  'Érythrée': '🇪🇷',
  'Soudan': '🇸🇩',
  'Soudan du Sud': '🇸🇸',
  'Kenya': '🇰🇪',
  'Ouganda': '🇺🇬',
  'Tanzanie': '🇹🇿',
  'Rwanda': '🇷🇼',
  'Burundi': '🇧🇮',
  'Canada': '🇨🇦',
  'États-Unis': '🇺🇸',
  'Mexique': '🇲🇽',
  'Guatemala': '🇬🇹',
  'Belize': '🇧🇿',
  'Honduras': '🇭🇳',
  'El Salvador': '🇸🇻',
  'Nicaragua': '🇳🇮',
  'Costa Rica': '🇨🇷',
  'Panama': '🇵🇦',
  'Cuba': '🇨🇺',
  'République Dominicaine': '🇩🇴',
  'Haïti': '🇭🇹',
  'Jamaïque': '🇯🇲',
  'Trinité-et-Tobago': '🇹🇹',
  'Bahamas': '🇧🇸',
  'Barbade': '🇧🇧',
  'Sainte-Lucie': '🇱🇨',
  'Grenade': '🇬🇩',
  'Colombie': '🇨🇴',
  'Venezuela': '🇻🇪',
  'Équateur': '🇪🇨',
  'Pérou': '🇵🇪',
  'Brésil': '🇧🇷',
  'Bolivie': '🇧🇴',
  'Chili': '🇨🇱',
  'Argentine': '🇦🇷',
  'Uruguay': '🇺🇾',
  'Paraguay': '🇵🇾',
  'Guyana': '🇬🇾',
  'Suriname': '🇸🇷',
  'Australie': '🇦🇺',
  'Nouvelle-Zélande': '🇳🇿',
  'Fidji': '🇫🇯',
  'Samoa': '🇼🇸',
  'Tonga': '🇹🇴',
  'Kiribati': '🇰🇮',
  'Nauru': '🇳🇷',
  'Palaos': '🇵🇼',
  'Îles Mariannes du Nord': '🇲🇵',
  'Guam': '🇬🇺',
  'Micronésie': '🇫🇲',
  'Îles Marshall': '🇲🇭',
  'Vanuatu': '🇻🇺',
  'Papouasie-Nouvelle-Guinée': '🇵🇬',
  'Îles Salomon': '🇸🇧',
  'Palestine': '🇵🇸',
};

const getCountryFlag = (country: string): string => {
  return COUNTRY_FLAGS[country] || '🏳️';
};

const getOverallRating = (stats: FUTCardProps['stats']): number => {
  return Math.round((stats.pac + stats.sho + stats.pas + stats.dri + stats.def + stats.phy) / 6);
};

const getStatColor = (value: number): string => {
  if (value >= 85) return '#FFD700'; // Gold
  if (value >= 75) return '#FFA500'; // Orange
  if (value >= 65) return '#90EE90'; // Light Green
  return '#87CEEB'; // Sky Blue
};

export function FUTCardShield({
  playerName,
  position,
  country,
  stats,
  profilePhoto,
}: FUTCardProps) {
  const overall = getOverallRating(stats);
  const flag = getCountryFlag(country);

  return (
    <View className="items-center justify-center py-6">
      <LinearGradient
        colors={['#1e3a8a', '#0f172a', '#1e3a8a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="w-72 rounded-3xl p-4 border-4 border-yellow-500 shadow-2xl"
      >
        {/* Shield Top */}
        <View className="w-full items-center mb-3">
          {/* Player Name */}
          <Text className="text-white font-bold text-2xl text-center tracking-wider mb-2">
            {playerName.toUpperCase()}
          </Text>

          {/* Overall Rating and Position */}
          <View className="flex-row items-center justify-between w-full px-4 mb-3">
            <View className="items-center">
              <Text className="text-white font-bold text-4xl">{overall}</Text>
              <Text className="text-yellow-300 font-bold text-sm">{position}</Text>
            </View>

            {/* Country Flag */}
            <View className="items-center">
              <Text className="text-5xl">{flag}</Text>
            </View>
          </View>
        </View>

        {/* Player Photo Area */}
        <View className="w-full h-48 bg-gradient-to-b from-yellow-400 to-yellow-600 rounded-2xl mb-4 items-center justify-center overflow-hidden border-2 border-yellow-500">
          {profilePhoto ? (
            <Text className="text-6xl">👤</Text>
          ) : (
            <Text className="text-6xl">👤</Text>
          )}
        </View>

        {/* Stats Section */}
        <View className="w-full bg-black/40 rounded-2xl p-4">
          {/* Row 1 */}
          <View className="flex-row justify-between mb-3">
            <View className="flex-1 items-center mr-2">
              <Text className="text-white font-bold text-lg">{stats.pac}</Text>
              <Text className="text-white font-bold text-xs">PAC</Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-white font-bold text-lg">{stats.dri}</Text>
              <Text className="text-white font-bold text-xs">DRI</Text>
            </View>
          </View>

          {/* Row 2 */}
          <View className="flex-row justify-between mb-3">
            <View className="flex-1 items-center mr-2">
              <Text className="text-white font-bold text-lg">{stats.sho}</Text>
              <Text className="text-white font-bold text-xs">SHO</Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-white font-bold text-lg">{stats.def}</Text>
              <Text className="text-white font-bold text-xs">DEF</Text>
            </View>
          </View>

          {/* Row 3 */}
          <View className="flex-row justify-between">
            <View className="flex-1 items-center mr-2">
              <Text className="text-white font-bold text-lg">{stats.pas}</Text>
              <Text className="text-white font-bold text-xs">PAS</Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-white font-bold text-lg">{stats.phy}</Text>
              <Text className="text-white font-bold text-xs">PHY</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}
