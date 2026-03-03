import { View, Text } from 'react-native';

interface UnoLeagueHeaderProps {
  unoBalance?: number;
  showBalance?: boolean;
}

export function UnoLeagueHeader({ unoBalance = 0, showBalance = true }: UnoLeagueHeaderProps) {
  return (
    <View className="bg-black px-4 py-3 border-b border-red-500">
      <View className="flex-row items-center justify-between gap-3">
        {/* UNO LEAGUE Logo */}
        <View className="flex-row items-center gap-1">
          <Text className="text-white font-bold text-xl">UNO</Text>
          <Text className="text-red-600 font-bold text-xl">LEAGUE</Text>
        </View>

        {/* UNO Balance */}
        {showBalance && (
          <View className="flex-row items-center gap-1">
            <Text className="text-white text-sm">Solde UNO:</Text>
            <Text className="text-red-500 font-bold text-sm">{unoBalance}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
