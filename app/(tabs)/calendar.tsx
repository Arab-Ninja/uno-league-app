import { useState } from 'react';
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
  { id: 'friendly', name: 'Match amical', minParticipants: 10 },
  { id: 'league', name: 'UNO League', minParticipants: 15 },
];

const TIME_SLOTS = ['14h-16h', '16h-18h', '18h-20h', '20h-22h', '22h-00h'];

export default function CalendarScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const [selectedLocation, setSelectedLocation] = useState(LOCATIONS[0]);
  const [selectedMode, setSelectedMode] = useState(GAME_MODES[0]);
  const [currentDate, setCurrentDate] = useState(new Date(2024, 11, 1));
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [activeTab, setActiveTab] = useState<'propositions' | 'reservations' | 'sessions'>('propositions');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [userParticipations, setUserParticipations] = useState<string[]>([]);

  // Form state for creating proposal
  const [formDate, setFormDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState(TIME_SLOTS[0]);
  const [selectedGameMode, setSelectedGameMode] = useState(GAME_MODES[0]);
  const [selectedCreateLocation, setSelectedCreateLocation] = useState(LOCATIONS[0]);

  // Mock proposals
  const [mockProposals, setMockProposals] = useState([
    {
      id: 'p1',
      date: new Date(2024, 11, 28),
      time: '20h-22h',
      location: LOCATIONS[0],
      mode: GAME_MODES[0],
      participants: ['Player1', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6'],
      price: 15,
      rewards: '50-150 UNO',
    },
    {
      id: 'p2',
      date: new Date(2024, 11, 29),
      time: '17h-19h',
      location: LOCATIONS[0],
      mode: GAME_MODES[1],
      participants: ['Player1', 'Player2', 'Player3', 'Player4', 'Player5', 'Player6', 'Player7', 'Player8'],
      price: 20,
      rewards: '100-250 UNO',
    },
  ]);

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return first === 0 ? 6 : first - 1; // Convert to Monday = 0
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

  const handleCreateProposal = () => {
    if (!selectedGameMode || !selectedCreateLocation || !selectedTime) {
      alert('Veuillez remplir tous les champs');
      return;
    }

    const newProposal = {
      id: `p${Date.now()}`,
      date: formDate,
      time: selectedTime,
      location: selectedCreateLocation,
      mode: selectedGameMode,
      participants: [user?.firstName || 'Vous'],
      price: selectedGameMode.id === 'friendly' ? 15 : 20,
      rewards: selectedGameMode.id === 'friendly' ? '50-150 UNO' : '100-250 UNO',
    };

    setMockProposals([...mockProposals, newProposal]);
    setUserParticipations([...userParticipations, newProposal.id]);

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
    if (!proposal.participants.includes(playerName)) {
      proposal.participants.push(playerName);
      setUserParticipations([...userParticipations, proposal.id]);
    }
  };

  const handleLeaveProposal = (proposal: any) => {
    if (!user) return;

    const playerName = `${user.firstName} ${user.lastName}`;
    proposal.participants = proposal.participants.filter((p: string) => p !== playerName);
    setUserParticipations(userParticipations.filter((id) => id !== proposal.id));
  };

  const monthName = currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);

  const calendarDays = Array(firstDay)
    .fill(null)
    .concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  const reservationCount = userParticipations.length;

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
                  onPress={() => setSelectedLocation(location)}
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
                { id: 'reservations', label: 'RESERVATIONS', badge: reservationCount },
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
              <TouchableOpacity className="bg-gray-500 px-3 py-2 rounded">
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

            {/* View Mode Tabs */}
            <View className="flex-row gap-2">
              {['mois', 'la semaine', 'journée'].map((mode) => (
                <TouchableOpacity
                  key={mode}
                  onPress={() => setViewMode(mode.split(' ')[0] as any)}
                  className={cn(
                    'px-3 py-2 rounded',
                    viewMode === mode.split(' ')[0] ? 'bg-gray-800' : 'bg-gray-400'
                  )}
                >
                  <Text className={cn('font-bold text-sm', viewMode === mode.split(' ')[0] ? 'text-white' : 'text-gray-800')}>
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Calendar Grid */}
            <View>
              {/* Day Headers */}
              <View className="flex-row justify-between mb-2">
                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day) => (
                  <Text key={day} className="text-gray-800 font-bold text-center flex-1 text-sm">
                    {day}
                  </Text>
                ))}
              </View>

              {/* Calendar Days */}
              <View className="gap-1">
                {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map((_, weekIndex) => (
                  <View key={weekIndex} className="flex-row justify-between gap-1">
                    {calendarDays.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, dayIndex) => {
                      const eventsOnDay = day
                        ? mockProposals.filter(
                            (p) =>
                              p.date.getDate() === day &&
                              p.date.getMonth() === currentDate.getMonth() &&
                              p.date.getFullYear() === currentDate.getFullYear()
                          )
                        : [];

                      return (
                        <View
                          key={dayIndex}
                          className={cn(
                            'flex-1 aspect-square rounded border items-center justify-center p-1',
                            day ? 'bg-gray-100 border-gray-300' : 'bg-transparent border-transparent'
                          )}
                        >
                          {day && (
                            <View className="w-full h-full items-center justify-center gap-0.5">
                              <Text className="font-bold text-gray-800 text-sm">{day}</Text>
                              {eventsOnDay.slice(0, 2).map((event, idx) => (
                                <TouchableOpacity
                                  key={idx}
                                  onPress={() => {
                                    setSelectedProposal(event);
                                    setShowDetailsModal(true);
                                  }}
                                  className="bg-blue-900 rounded px-1 py-0.5"
                                >
                                  <Text className="text-white text-xs font-bold">
                                    {event.time.split('-')[0]} {event.participants.length}/{event.mode.minParticipants}
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

          {/* Location Footer */}
          <View className="bg-blue-900 mx-4 mb-4 rounded-lg px-4 py-3 items-center">
            <Text className="text-white font-bold text-lg">au {selectedLocation.name}</Text>
          </View>

          {/* Create Proposal Button */}
          <TouchableOpacity
            onPress={() => setShowCreateModal(true)}
            className="bg-orange-500 mx-4 mb-4 rounded-lg px-4 py-3 items-center"
          >
            <Text className="text-white font-bold text-lg">+ Créer une proposition</Text>
          </TouchableOpacity>

          {/* Proposals List */}
          {activeTab === 'propositions' && (
            <View className="px-4 gap-3 pb-4">
              {mockProposals.map((proposal) => (
                <TouchableOpacity
                  key={proposal.id}
                  onPress={() => {
                    setSelectedProposal(proposal);
                    setShowDetailsModal(true);
                  }}
                  className="bg-surface rounded-lg p-4 border border-border"
                >
                  <View className="flex-row justify-between items-start mb-2">
                    <View>
                      <Text className="text-foreground font-bold text-lg">{proposal.mode.name}</Text>
                      <Text className="text-muted text-sm">{formatDate(proposal.date)} - {proposal.time}</Text>
                    </View>
                    <View className="bg-blue-900 rounded-lg px-3 py-1">
                      <Text className="text-white font-bold">
                        {proposal.participants.length}/{proposal.mode.minParticipants}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-muted text-sm">{proposal.location.name}</Text>
                  <Text className="text-orange-500 font-bold mt-2">{proposal.price}€ / joueur</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Reservations List */}
          {activeTab === 'reservations' && (
            <View className="px-4 gap-3 pb-4">
              {mockProposals
                .filter((p) => userParticipations.includes(p.id))
                .map((proposal) => (
                  <TouchableOpacity
                    key={proposal.id}
                    onPress={() => {
                      setSelectedProposal(proposal);
                      setShowDetailsModal(true);
                    }}
                    className="bg-surface rounded-lg p-4 border border-border"
                  >
                    <View className="flex-row justify-between items-start mb-2">
                      <View>
                        <Text className="text-foreground font-bold text-lg">{proposal.mode.name}</Text>
                        <Text className="text-muted text-sm">{formatDate(proposal.date)} - {proposal.time}</Text>
                      </View>
                      <View className="bg-green-600 rounded-lg px-3 py-1">
                        <Text className="text-white font-bold text-sm">Inscrit</Text>
                      </View>
                    </View>
                    <Text className="text-muted text-sm">{proposal.location.name}</Text>
                    <Text className="text-orange-500 font-bold mt-2">{proposal.price}€ / joueur</Text>
                  </TouchableOpacity>
                ))}
              {userParticipations.length === 0 && (
                <View className="bg-surface rounded-lg p-8 border border-border items-center">
                  <Text className="text-2xl mb-2">📅</Text>
                  <Text className="text-foreground font-semibold">Aucune réservation</Text>
                  <Text className="text-muted text-sm text-center mt-2">
                    Rejoignez une proposition pour voir vos réservations
                  </Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Create Proposal Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
          <View className="flex-1 bg-black/50 justify-end">
            <View className="bg-background rounded-t-3xl p-6 gap-4 max-h-[90%]">
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text className="text-foreground font-bold text-xl mb-4">Créer une proposition</Text>

                {/* Game Mode Selection */}
                <View className="gap-2 mb-4">
                  <Text className="text-foreground font-bold">Mode de jeu</Text>
                  {GAME_MODES.map((mode) => (
                    <TouchableOpacity
                      key={mode.id}
                      onPress={() => setSelectedGameMode(mode)}
                      className={cn(
                        'p-3 rounded-lg border-2',
                        selectedGameMode.id === mode.id ? 'border-primary bg-primary/10' : 'border-border'
                      )}
                    >
                      <Text
                        className={cn('font-bold', selectedGameMode.id === mode.id ? 'text-primary' : 'text-foreground')}
                      >
                        {mode.name} ({mode.minParticipants} participants)
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Location Selection */}
                <View className="gap-2 mb-4">
                  <Text className="text-foreground font-bold">Lieu</Text>
                  {LOCATIONS.map((location) => (
                    <TouchableOpacity
                      key={location.id}
                      onPress={() => setSelectedCreateLocation(location)}
                      className={cn(
                        'p-3 rounded-lg border-2',
                        selectedCreateLocation.id === location.id ? 'border-primary bg-primary/10' : 'border-border'
                      )}
                    >
                      <Text
                        className={cn('font-bold', selectedCreateLocation.id === location.id ? 'text-primary' : 'text-foreground')}
                      >
                        {location.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Date Selection */}
                <View className="gap-2 mb-4">
                  <Text className="text-foreground font-bold">Date</Text>
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(true)}
                    className="p-3 rounded-lg border-2 border-border"
                  >
                    <Text className="text-foreground font-bold">{formatDate(formDate)}</Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker value={formDate} mode="date" display="spinner" onChange={handleDateChange} />
                  )}
                </View>

                {/* Time Selection */}
                <View className="gap-2 mb-4">
                  <Text className="text-foreground font-bold">Créneau horaire</Text>
                  <View className="gap-2">
                    {TIME_SLOTS.map((slot) => (
                      <TouchableOpacity
                        key={slot}
                        onPress={() => setSelectedTime(slot)}
                        className={cn(
                          'p-3 rounded-lg border-2',
                          selectedTime === slot ? 'border-primary bg-primary/10' : 'border-border'
                        )}
                      >
                        <Text className={cn('font-bold', selectedTime === slot ? 'text-primary' : 'text-foreground')}>
                          {slot}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Action Buttons */}
                <View className="flex-row gap-3 mt-4">
                  <TouchableOpacity
                    onPress={() => setShowCreateModal(false)}
                    className="flex-1 bg-border rounded-lg p-3"
                  >
                    <Text className="text-foreground font-bold text-center">Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreateProposal}
                    className="flex-1 bg-primary rounded-lg p-3"
                  >
                    <Text className="text-background font-bold text-center">Créer</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Details Modal */}
      <Modal visible={showDetailsModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-background rounded-t-3xl p-6 gap-4 max-h-[90%]">
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedProposal && (
                <>
                  <Text className="text-foreground font-bold text-xl mb-4">{selectedProposal.mode.name}</Text>

                  <View className="gap-2 mb-4">
                    <View className="flex-row justify-between">
                      <Text className="text-muted">Date:</Text>
                      <Text className="text-foreground font-bold">{formatDate(selectedProposal.date)}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-muted">Heure:</Text>
                      <Text className="text-foreground font-bold">{selectedProposal.time}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-muted">Lieu:</Text>
                      <Text className="text-foreground font-bold">{selectedProposal.location.name}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-muted">Participants:</Text>
                      <Text className="text-foreground font-bold">
                        {selectedProposal.participants.length}/{selectedProposal.mode.minParticipants}
                      </Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-muted">Prix:</Text>
                      <Text className="text-orange-500 font-bold">{selectedProposal.price}€</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-muted">Récompenses:</Text>
                      <Text className="text-green-500 font-bold">{selectedProposal.rewards}</Text>
                    </View>
                  </View>

                  <View className="gap-2 mb-4">
                    <Text className="text-foreground font-bold">Participants inscrits:</Text>
                    {selectedProposal.participants.map((participant: string, idx: number) => (
                      <Text key={idx} className="text-muted">
                        • {participant}
                      </Text>
                    ))}
                  </View>

                  {/* Action Buttons */}
                  <View className="flex-row gap-3 mt-4">
                    <TouchableOpacity
                      onPress={() => setShowDetailsModal(false)}
                      className="flex-1 bg-border rounded-lg p-3"
                    >
                      <Text className="text-foreground font-bold text-center">Fermer</Text>
                    </TouchableOpacity>
                    {userParticipations.includes(selectedProposal.id) ? (
                      <TouchableOpacity
                        onPress={() => {
                          handleLeaveProposal(selectedProposal);
                          setShowDetailsModal(false);
                        }}
                        className="flex-1 bg-error rounded-lg p-3"
                      >
                        <Text className="text-background font-bold text-center">Se désinscrire</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          handleJoinProposal(selectedProposal);
                          setShowDetailsModal(false);
                        }}
                        className="flex-1 bg-primary rounded-lg p-3"
                      >
                        <Text className="text-background font-bold text-center">Rejoindre</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
