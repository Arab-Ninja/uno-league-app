import { View, Text } from 'react-native';
import { useColors } from '@/hooks/use-colors';

interface UnoLeagueHeaderProps {
  unoBalance?: number;
  showBalance?: boolean;
}

export function UnoLeagueHeader({ unoBalance = 0, showBalance = true }: UnoLeagueHeaderProps) {
  const colors = useColors();

  return (
    <View className="bg-black px-4 py-3 border-b border-border">
      <View className="flex-row items-center justify-between">
        {/* UNO LEAGUE Logo */}
        <View className="flex-row items-center gap-2">
          <Text className="text-white font-bold text-lg">UNO</Text>
          <Text className="text-red-500 font-bold text-lg">LEAGUE</Text>
        </View>

        {/* UNO Balance */}
        {showBalance && (
          <View className="flex-row items-center gap-1">
            <Text className="text-white text-sm">Solde UNO :</Text>
            <Text className="text-red-500 font-bold text-sm">{unoBalance}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
