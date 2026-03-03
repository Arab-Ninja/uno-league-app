import { useState, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useAuth } from '@/lib/auth-context';
import { useColors } from '@/hooks/use-colors';
import { cn } from '@/lib/utils';
import DateTimePicker from '@react-native-community/datetimepicker';

const LOCATIONS = [
  { id: 'fit-five-forest', name: 'Fit Five Forest', color: '#dc2626' },
  { id: 'yc-five', name: 'YC Five', color: '#334155' },
  { id: 'city-five', name: 'City Five', color: '#334155' },
  { id: 'arena', name: 'Arena', color: '#334155' },
];

const GAME_MODES = [
  { id: 'friendly', name: 'Match amical', minParticipants: 10, price: 10, duration: 1 },
  { id: 'league', name: 'UNO League', minParticipants: 15, price: 20, duration: 2 },
];

const TIME_SLOTS = ['14h-16h', '16h-18h', '18h-20h', '20h-22h', '22h-00h'];

export default function CalendarScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const [selectedLocation, setSelectedLocation] = useState(LOCATIONS[0]);
  const [selectedMode, setSelectedMode] = useState(GAME_MODES[0]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'propositions' | 'reservations' | 'sessions'>('propositions');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<any>(null);

  // Form state for creating proposal
  const [formDate, setFormDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState(TIME_SLOTS[0]);
  const [selectedGameMode, setSelectedGameMode] = useState(GAME_MODES[0]);
  const [selectedCreateLocation, setSelectedCreateLocation] = useState(LOCATIONS[0]);

  // Mock proposals with proper structure
  const [mockProposals, setMockProposals] = useState([
    {
      id: 'p1',
      date: new Date(2026, 2, 8),
      time: '20h-22h',
      location: LOCATIONS[0],
      mode: GAME_MODES[0],
      participants: [{ id: '1', name: 'Player1' }, { id: '2', name: 'Player2' }, { id: '3', name: 'Player3' }],
      price: 10,
      rewards: '50-150 UNO',
      status: 'proposition',
    },
    {
      id: 'p2',
      date: new Date(2026, 2, 9),
      time: '17h-19h',
      location: LOCATIONS[0],
      mode: GAME_MODES[1],
      participants: [{ id: '1', name: 'Player1' }, { id: '2', name: 'Player2' }],
      price: 20,
      rewards: '100-250 UNO',
      status: 'proposition',
    },
  ]);

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return first === 0 ? 6 : first - 1;
  };

  const formatDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setFormDate(selectedDate);
    }
  };

  const getMinimumDate = () => {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 2);
    return minDate;
  };

  const handleCreateProposal = () => {
    if (!selectedGameMode || !selectedCreateLocation || !selectedTime) {
      alert('Veuillez remplir tous les champs');
      return;
    }

    // Check if date is at least 2 days from today
    const minDate = getMinimumDate();
    if (formDate < minDate) {
      alert('La proposition doit être au minimum 2 jours à partir d\'aujourd\'hui');
      return;
    }

    const newProposal = {
      id: `p${Date.now()}`,
      date: formDate,
      time: selectedTime,
      location: selectedCreateLocation,
      mode: selectedGameMode,
      participants: [{ id: user?.id || 'user1', name: `${user?.firstName} ${user?.lastName}` }],
      price: selectedGameMode.price,
      rewards: selectedGameMode.id === 'friendly' ? '50-150 UNO' : '100-250 UNO',
      status: 'proposition',
    };

    setMockProposals([...mockProposals, newProposal]);
    setShowCreateModal(false);
    setFormDate(new Date());
    setSelectedTime(TIME_SLOTS[0]);
    setSelectedGameMode(GAME_MODES[0]);
    setSelectedCreateLocation(LOCATIONS[0]);
    alert('Proposition créée avec succès !');
  };

  const handleJoinProposal = (proposal: any) => {
    if (!user) return;

    const playerName = `${user.firstName} ${user.lastName}`;
    const playerExists = proposal.participants.some((p: any) => p.name === playerName);

    if (!playerExists) {
      proposal.participants.push({ id: user.id, name: playerName });
      
      // Check if proposal is now full
      if (proposal.participants.length === proposal.mode.minParticipants) {
        proposal.status = 'reservation';
      }
      
      setMockProposals([...mockProposals]);
    }
  };

  const handleLeaveProposal = (proposal: any) => {
    if (!user) return;

    const playerName = `${user.firstName} ${user.lastName}`;
    proposal.participants = proposal.participants.filter((p: any) => p.name !== playerName);
    proposal.status = 'proposition'; // Reset to proposition if not full
    setMockProposals([...mockProposals]);
  };

  // Filter proposals by location and tab
  const filteredProposals = mockProposals.filter(
    (p) => p.location.id === selectedLocation.id && p.status === activeTab
  );

  const monthName = currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);

  const calendarDays = Array(firstDay)
    .fill(null)
    .concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  const getProposalsForDay = (day: number) => {
    const dateToCheck = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return filteredProposals.filter((p) => {
      const proposalDate = new Date(p.date);
      return proposalDate.getDate() === day &&
        proposalDate.getMonth() === dateToCheck.getMonth() &&
        proposalDate.getFullYear() === dateToCheck.getFullYear();
    });
  };

  return (
    <ScreenContainer className="bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View className="bg-blue-900 px-4 py-4 gap-3">
            <View className="flex-row justify-between items-center">
              <Text className="text-white text-2xl font-bold">UNO LEAGUE</Text>
              <Text className="text-orange-500 font-bold">Solde UNO: {user?.unoBalance || 0}</Text>
            </View>

            {/* Game Mode Display */}
            <View className="bg-white rounded-lg px-4 py-3 items-center">
              <Text className="text-blue-900 font-bold text-lg">{selectedMode.name.toUpperCase()}</Text>
            </View>

            {/* Location Buttons */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
              {LOCATIONS.map((location) => (
                <TouchableOpacity
                  key={location.id}
                  onPress={() => {
                    setSelectedLocation(location);
                    setSelectedCreateLocation(location);
                  }}
                  className={cn(
                    'px-4 py-2 rounded-lg border-2 whitespace-nowrap',
                    selectedLocation.id === location.id ? 'border-white' : 'border-gray-400'
                  )}
                  style={{
                    backgroundColor: selectedLocation.id === location.id ? location.color : 'transparent',
                  }}
                >
                  <Text
                    className={cn(
                      'font-bold',
                      selectedLocation.id === location.id ? 'text-white' : 'text-gray-300'
                    )}
                  >
                    {location.name.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tabs */}
            <View className="flex-row gap-2">
              {[
                { id: 'propositions', label: 'PROPOSITIONS' },
                { id: 'reservations', label: 'RESERVATIONS', badge: mockProposals.filter(p => p.status === 'reservations').length },
                { id: 'sessions', label: 'SESSIONS' },
              ].map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id as any)}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-lg flex-row items-center justify-center gap-1',
                    activeTab === tab.id
                      ? tab.id === 'propositions'
                        ? 'bg-blue-700'
                        : tab.id === 'reservations'
                          ? 'bg-yellow-400'
                          : 'bg-green-600'
                      : 'bg-gray-600'
                  )}
                >
                  <Text className={cn('font-bold text-sm', activeTab === tab.id ? 'text-white' : 'text-gray-300')}>
                    {tab.label}
                  </Text>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <View className="bg-white rounded-full px-2 py-0.5">
                      <Text className="text-blue-900 font-bold text-xs">{tab.badge}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Calendar Section */}
          <View className="bg-white mx-4 my-4 rounded-lg p-4 gap-3">
            {/* Navigation */}
            <View className="flex-row items-center justify-between gap-2">
              <TouchableOpacity 
                onPress={() => setCurrentDate(new Date())}
                className="bg-gray-500 px-3 py-2 rounded"
              >
                <Text className="text-white font-bold text-sm">aujourd'hui</Text>
              </TouchableOpacity>
              <View className="flex-row gap-2 flex-1 justify-center">
                <TouchableOpacity
                  onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
                  className="bg-gray-800 px-3 py-2 rounded"
                >
                  <Text className="text-white font-bold">&lt;</Text>
                </TouchableOpacity>
                <Text className="text-gray-800 font-bold text-center min-w-32">{monthName}</Text>
                <TouchableOpacity
                  onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
                  className="bg-gray-800 px-3 py-2 rounded"
                >
                  <Text className="text-white font-bold">&gt;</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Calendar Grid */}
            <View className="gap-2">
              {/* Day Headers */}
              <View className="flex-row justify-between gap-1">
                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
                  <Text key={day} className="flex-1 text-center font-bold text-gray-600 text-xs">
                    {day}
                  </Text>
                ))}
              </View>

              {/* Calendar Days */}
              <View className="gap-1">
                {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map((_, weekIndex) => (
                  <View key={weekIndex} className="flex-row justify-between gap-1">
                    {calendarDays.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, dayIndex) => {
                      const dayProposals = day ? getProposalsForDay(day as number) : [];
                      return (
                        <View
                          key={dayIndex}
                          className={cn(
                            'flex-1 aspect-square rounded-lg border',
                            day ? 'bg-gray-100 border-gray-300' : 'bg-transparent border-transparent'
                          )}
                        >
                          {day && (
                            <View className="p-1 gap-0.5">
                              <Text className="text-gray-800 font-bold text-xs">{day}</Text>
                              {dayProposals.slice(0, 2).map((proposal) => (
                                <TouchableOpacity
                                  key={proposal.id}
                                  onPress={() => {
                                    setSelectedProposal(proposal);
                                    setShowDetailsModal(true);
                                  }}
                                  className="bg-blue-600 rounded px-1 py-0.5"
                                >
                                  <Text className="text-white text-xs font-bold">
                                    {proposal.time.split('-')[0]} {proposal.participants.length}/{proposal.mode.minParticipants}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Proposals List */}
          <View className="mx-4 mb-4 gap-3">
            <TouchableOpacity
              onPress={() => setShowCreateModal(true)}
              className="bg-blue-600 rounded-lg px-4 py-3 items-center"
            >
              <Text className="text-white font-bold">+ Créer une proposition</Text>
            </TouchableOpacity>

            {filteredProposals.map((proposal) => (
              <TouchableOpacity
                key={proposal.id}
                onPress={() => {
                  setSelectedProposal(proposal);
                  setShowDetailsModal(true);
                }}
                className="bg-gray-800 rounded-lg p-3 gap-2"
              >
                <View className="flex-row justify-between items-center">
                  <Text className="text-white font-bold">{proposal.time}</Text>
                  <Text className="text-orange-500 font-bold">
                    {proposal.participants.length}/{proposal.mode.minParticipants}
                  </Text>
                </View>
                <Text className="text-gray-300 text-sm">{proposal.mode.name}</Text>
                <Text className="text-gray-400 text-xs">{formatDate(proposal.date)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Create Proposal Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
          <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-gray-900 rounded-t-3xl p-6 gap-4">
              <Text className="text-white text-xl font-bold">Créer une proposition</Text>

              {/* Date Picker */}
              <View className="gap-2">
                <Text className="text-white font-bold">Date</Text>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  className="bg-gray-800 rounded-lg px-4 py-3"
                >
                  <Text className="text-white">{formatDate(formDate)}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={formDate}
                    mode="date"
                    display="spinner"
                    onChange={handleDateChange}
                    minimumDate={getMinimumDate()}
                  />
                )}
              </View>

              {/* Time Picker */}
              <View className="gap-2">
                <Text className="text-white font-bold">Heure</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
                  {TIME_SLOTS.map((time) => (
                    <TouchableOpacity
                      key={time}
                      onPress={() => setSelectedTime(time)}
                      className={cn(
                        'px-4 py-2 rounded-lg',
                        selectedTime === time ? 'bg-blue-600' : 'bg-gray-800'
                      )}
                    >
                      <Text className={cn('font-bold', selectedTime === time ? 'text-white' : 'text-gray-300')}>
                        {time}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Game Mode Picker */}
              <View className="gap-2">
                <Text className="text-white font-bold">Mode de jeu</Text>
                <View className="gap-2">
                  {GAME_MODES.map((mode) => (
                    <TouchableOpacity
                      key={mode.id}
                      onPress={() => setSelectedGameMode(mode)}
                      className={cn(
                        'px-4 py-3 rounded-lg border-2',
                        selectedGameMode.id === mode.id ? 'border-blue-600 bg-blue-600/20' : 'border-gray-600'
                      )}
                    >
                      <Text className="text-white font-bold">{mode.name}</Text>
                      <Text className="text-gray-300 text-sm">
                        {mode.minParticipants} joueurs • {mode.price}€ • {mode.duration}h
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Buttons */}
              <View className="flex-row gap-2 mt-4">
                <TouchableOpacity
                  onPress={() => setShowCreateModal(false)}
                  className="flex-1 bg-gray-700 rounded-lg px-4 py-3 items-center"
                >
                  <Text className="text-white font-bold">Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreateProposal}
                  className="flex-1 bg-blue-600 rounded-lg px-4 py-3 items-center"
                >
                  <Text className="text-white font-bold">Créer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Details Modal */}
      <Modal visible={showDetailsModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-gray-900 rounded-t-3xl p-6 gap-4 max-h-4/5">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-white text-xl font-bold">Détails de la proposition</Text>
              <TouchableOpacity onPress={() => setShowDetailsModal(false)}>
                <Text className="text-gray-400 text-2xl">✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedProposal && (
                <View className="gap-4">
                  <View className="gap-2">
                    <Text className="text-gray-400 text-sm">Mode</Text>
                    <Text className="text-white text-lg font-bold">{selectedProposal.mode.name}</Text>
                  </View>

                  <View className="gap-2">
                    <Text className="text-gray-400 text-sm">Date et heure</Text>
                    <Text className="text-white text-lg font-bold">
                      {formatDate(selectedProposal.date)} à {selectedProposal.time}
                    </Text>
                  </View>

                  <View className="gap-2">
                    <Text className="text-gray-400 text-sm">Lieu</Text>
                    <Text className="text-white text-lg font-bold">{selectedProposal.location.name}</Text>
                  </View>

                  <View className="gap-2">
                    <Text className="text-gray-400 text-sm">Participants</Text>
                    <Text className="text-white text-lg font-bold">
                      {selectedProposal.participants.length}/{selectedProposal.mode.minParticipants}
                    </Text>
                    <View className="gap-1">
                      {selectedProposal.participants.map((p: any) => (
                        <Text key={p.id} className="text-gray-300 text-sm">
                          • {p.name}
                        </Text>
                      ))}
                    </View>
                  </View>

                  <View className="gap-2">
                    <Text className="text-gray-400 text-sm">Prix par joueur</Text>
                    <Text className="text-white text-lg font-bold">{selectedProposal.price}€</Text>
                  </View>

                  <View className="gap-2">
                    <Text className="text-gray-400 text-sm">Récompenses</Text>
                    <Text className="text-white text-lg font-bold">{selectedProposal.rewards}</Text>
                  </View>

                  {/* Action Buttons */}
                  <View className="flex-row gap-2 mt-4">
                    <TouchableOpacity
                      onPress={() => {
                        handleJoinProposal(selectedProposal);
                        setMockProposals([...mockProposals]);
                      }}
                      className="flex-1 bg-green-600 rounded-lg px-4 py-3 items-center"
                    >
                      <Text className="text-white font-bold">Rejoindre</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        handleLeaveProposal(selectedProposal);
                        setMockProposals([...mockProposals]);
                      }}
                      className="flex-1 bg-red-600 rounded-lg px-4 py-3 items-center"
                    >
                      <Text className="text-white font-bold">Annuler</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
