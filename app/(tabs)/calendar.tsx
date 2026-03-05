import { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenContainer } from '@/components/screen-container';
import { UnoLeagueHeader } from '@/components/uno-league-header';
import { useAuth } from '@/lib/auth-context';
import { useProposals, type Proposal } from '@/lib/proposals-context';
import { cn } from '@/lib/utils';
import { allPlayers } from '@/lib/mock-data';
import DateTimePicker from '@react-native-community/datetimepicker';

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCATIONS = [
  { id: 'fit-five-forest', name: 'Fit Five Forest', color: '#dc2626' },
  { id: 'yc-five',          name: 'YC Five',         color: '#334155' },
  { id: 'city-five',        name: 'City Five',        color: '#334155' },
  { id: 'arena',            name: 'Arena',            color: '#334155' },
];

const GAME_MODES = [
  { id: 'friendly', name: 'Match amical', minParticipants: 10, price: 10, duration: 1 },
  { id: 'league',   name: 'UNO League',   minParticipants: 15, price: 20, duration: 2 },
];

const TIME_SLOTS = ['14h-16h', '16h-18h', '18h-20h', '20h-22h', '22h-00h'];

const TAB_STATUS: Record<string, Proposal['status']> = {
  propositions: 'proposition',
  reservations: 'reservation',
  sessions:     'session',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const getDaysInMonth  = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

const getFirstDayOfMonth = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  return d === 0 ? 6 : d - 1; // Mon=0 … Sun=6
};

const formatDate = (date: Date) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getFullYear()}`;
};

const findPlayer = (id: string) => allPlayers.find((p) => p.id === id);

// ── Screen ────────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { user } = useAuth();
  const { proposals, createProposal, joinProposal, leaveProposal } = useProposals();

  const [selectedLocation, setSelectedLocation] = useState(LOCATIONS[0]);
  const [selectedMode,     setSelectedMode]     = useState(GAME_MODES[0]);
  const [currentDate,      setCurrentDate]      = useState(new Date());
  const [activeTab,        setActiveTab]        = useState<'propositions' | 'reservations' | 'sessions'>('propositions');

  const [showCreateModal,  setShowCreateModal]  = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);

  // Day-overflow mini-modal
  const [showDayModal,      setShowDayModal]      = useState(false);
  const [dayModalProposals, setDayModalProposals] = useState<Proposal[]>([]);
  const [dayModalLabel,     setDayModalLabel]     = useState('');

  // Create-form state
  const [formDate,               setFormDate]               = useState(new Date());
  const [showDatePicker,         setShowDatePicker]         = useState(false);
  const [selectedTime,           setSelectedTime]           = useState(TIME_SLOTS[0]);
  const [selectedGameMode,       setSelectedGameMode]       = useState(GAME_MODES[0]);
  const [selectedCreateLocation, setSelectedCreateLocation] = useState(LOCATIONS[0]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const currentStatus = TAB_STATUS[activeTab];

  const filteredProposals = proposals.filter(
    (p) =>
      p.location.id === selectedLocation.id &&
      p.mode.id     === selectedMode.id     &&
      p.status      === currentStatus        &&
      (user ? p.division === user.division : true),
  );

  const reservationCount = proposals.filter(
    (p) =>
      p.location.id === selectedLocation.id &&
      p.mode.id     === selectedMode.id     &&
      p.status      === 'reservation',
  ).length;

  const monthName   = currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay    = getFirstDayOfMonth(currentDate);

  const calendarDays = (Array(firstDay).fill(null) as (number | null)[]).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1),
  );

  const getProposalsForDay = (day: number) =>
    filteredProposals.filter((p) => {
      const d = new Date(p.date);
      return (
        d.getDate()     === day                   &&
        d.getMonth()    === currentDate.getMonth() &&
        d.getFullYear() === currentDate.getFullYear()
      );
    });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const getMinimumDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d;
  };

  const handleDateChange = (_event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) setFormDate(date);
  };

  const handleCreateProposal = async () => {
    if (!selectedGameMode || !selectedCreateLocation || !selectedTime) {
      alert('Veuillez remplir tous les champs');
      return;
    }
    if (formDate < getMinimumDate()) {
      alert("La proposition doit être au minimum 2 jours à partir d'aujourd'hui");
      return;
    }

    const creator = user
      ? { id: user.email ?? user.id, name: user.name }
      : { id: 'guest', name: 'Joueur Anonyme' };

    await createProposal({
      date: new Date(formDate),
      time: selectedTime,
      location: selectedCreateLocation,
      mode: selectedGameMode,
      participants: [creator],
      price: selectedGameMode.price,
      rewards: selectedGameMode.id === 'friendly' ? '50-150 UNO' : '100-250 UNO',
      division: user?.division ?? 'D3',
      creatorOpenId: creator.id,
    });

    setShowCreateModal(false);
    setFormDate(new Date());
    setSelectedTime(TIME_SLOTS[0]);
    setSelectedGameMode(GAME_MODES[0]);
    setSelectedCreateLocation(LOCATIONS[0]);
    alert('Proposition créée avec succès !');
  };

  const handleJoinProposal = async (proposal: Proposal) => {
    if (!user) return;
    const playerOpenId = user.email ?? user.id;
    const alreadyIn = proposal.participants.some((p) => p.id === playerOpenId);
    if (alreadyIn) {
      alert('Vous êtes déjà inscrit à cette proposition.');
      setShowDetailsModal(false);
      return;
    }
    await joinProposal(proposal.id, { id: playerOpenId, name: user.name });
    setShowDetailsModal(false);
  };

  const handleLeaveProposal = async (proposal: Proposal) => {
    if (!user) return;
    const playerOpenId = user.email ?? user.id;
    await leaveProposal(proposal.id, playerOpenId);
    setShowDetailsModal(false);
    setSelectedProposal(null);
  };

  const cycleGameMode = () => {
    setSelectedMode((prev) => {
      const idx = GAME_MODES.findIndex((m) => m.id === prev.id);
      return GAME_MODES[(idx + 1) % GAME_MODES.length];
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScreenContainer className="bg-background">
      <UnoLeagueHeader unoBalance={user?.unoPoints ?? 0} showBalance={true} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          {/* ── Header band ── */}
          <View className="bg-blue-900 px-4 py-4 gap-3">

            {/* Game Mode toggle */}
            <TouchableOpacity
              onPress={cycleGameMode}
              className="bg-white rounded-lg px-4 py-3 items-center flex-row justify-center gap-2"
            >
              <Text className="text-blue-900 font-bold text-lg">
                {selectedMode.name.toUpperCase()}
              </Text>
              <Text className="text-blue-500 text-xs font-semibold">↕ changer</Text>
            </TouchableOpacity>

            {/* Location selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
              {LOCATIONS.map((location) => (
                <TouchableOpacity
                  key={location.id}
                  onPress={() => {
                    setSelectedLocation(location);
                    setSelectedCreateLocation(location);
                  }}
                  className={cn(
                    'px-4 py-2 rounded-lg border-2 mr-2',
                    selectedLocation.id === location.id ? 'border-white' : 'border-gray-400',
                  )}
                  style={{
                    backgroundColor:
                      selectedLocation.id === location.id ? '#dc2626' : 'transparent',
                  }}
                >
                  <Text
                    className={cn(
                      'font-bold',
                      selectedLocation.id === location.id ? 'text-white' : 'text-gray-300',
                    )}
                  >
                    {location.name.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Tabs */}
            <View className="flex-row gap-2">
              {(
                [
                  { id: 'propositions', label: 'PROPOSITIONS' },
                  { id: 'reservations', label: 'RÉSERVATIONS', badge: reservationCount },
                  { id: 'sessions',     label: 'SESSIONS' },
                ] as const
              ).map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-lg flex-row items-center justify-center gap-1',
                    activeTab === tab.id
                      ? tab.id === 'propositions'
                        ? 'bg-blue-700'
                        : tab.id === 'reservations'
                          ? 'bg-yellow-400'
                          : 'bg-green-600'
                      : 'bg-gray-600',
                  )}
                >
                  <Text
                    className={cn(
                      'font-bold text-xs',
                      activeTab === tab.id ? 'text-white' : 'text-gray-300',
                    )}
                  >
                    {tab.label}
                  </Text>
                  {'badge' in tab && tab.badge > 0 && (
                    <View className="bg-white rounded-full px-2 py-0.5">
                      <Text className="text-blue-900 font-bold text-xs">{tab.badge}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Division badge — space between header band and calendar ── */}
          {user?.division && (
            <View className="items-center pt-3 pb-1">
              <View className="bg-blue-800 rounded-full px-5 py-1">
                <Text className="text-white font-bold text-sm tracking-widest">
                  {'DIVISION '}{{ D1: '1', D2: '2', D3: '3' }[user.division]}
                </Text>
              </View>
            </View>
          )}

          {/* ── Calendar grid ── */}
          <View className="bg-white mx-4 my-4 rounded-lg p-4 gap-3">
            {/* Month navigation */}
            <View className="flex-row items-center justify-between gap-2">
              <TouchableOpacity
                onPress={() => setCurrentDate(new Date())}
                className="bg-gray-500 px-3 py-2 rounded"
              >
                <Text className="text-white font-bold text-sm">{"aujourd'hui"}</Text>
              </TouchableOpacity>

              <View className="flex-row gap-2 flex-1 justify-center items-center">
                <TouchableOpacity
                  onPress={() =>
                    setCurrentDate(
                      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1),
                    )
                  }
                  className="bg-gray-800 px-3 py-2 rounded"
                >
                  <Text className="text-white font-bold">{'<'}</Text>
                </TouchableOpacity>

                <Text className="text-gray-800 font-bold text-center min-w-32 capitalize">
                  {monthName}
                </Text>

                <TouchableOpacity
                  onPress={() =>
                    setCurrentDate(
                      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1),
                    )
                  }
                  className="bg-gray-800 px-3 py-2 rounded"
                >
                  <Text className="text-white font-bold">{'>'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Day headers */}
            <View className="flex-row justify-between gap-1">
              {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
                <Text key={d} className="flex-1 text-center font-bold text-gray-600 text-xs">
                  {d}
                </Text>
              ))}
            </View>

            {/* Weeks */}
            <View className="gap-1">
              {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map((_, wi) => (
                <View key={wi} className="flex-row justify-between gap-1">
                  {calendarDays.slice(wi * 7, wi * 7 + 7).map((day, di) => {
                    const dayProposals = day ? getProposalsForDay(day as number) : [];
                    const hasMany = dayProposals.length > 1;
                    return (
                      <View
                        key={di}
                        className={cn(
                          'flex-1 rounded-lg border',
                          day
                            ? 'bg-gray-100 border-gray-300'
                            : 'bg-transparent border-transparent',
                        )}
                        style={{ height: 58 }}
                      >
                        {day && (
                          <View className="p-1 gap-0.5">
                            <Text className="text-gray-800 font-bold text-xs">{day}</Text>
                            {hasMany ? (
                              <TouchableOpacity
                                onPress={() => {
                                  setDayModalProposals(dayProposals);
                                  setDayModalLabel(
                                    `${String(day).padStart(2, '0')}/${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
                                  );
                                  setShowDayModal(true);
                                }}
                                className="bg-blue-500 rounded px-1 py-0.5 items-center"
                              >
                                <Text className="text-white text-xs font-bold">
                                  +{dayProposals.length}
                                </Text>
                              </TouchableOpacity>
                            ) : (
                              dayProposals.slice(0, 1).map((proposal) => (
                                <TouchableOpacity
                                  key={proposal.id}
                                  onPress={() => {
                                    setSelectedProposal(proposal);
                                    setShowDetailsModal(true);
                                  }}
                                  className="bg-blue-600 rounded px-1 py-0.5"
                                >
                                  <Text className="text-white text-xs font-bold">
                                    {proposal.time.split('-')[0]}{' '}
                                    {proposal.participants.length}/{proposal.mode.minParticipants}
                                  </Text>
                                </TouchableOpacity>
                              ))
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>

          {/* ── Proposal / Reservation / Session list below calendar ── */}
          <View className="mx-4 mb-4 gap-3">
            {/* "Créer une proposition" only visible in propositions tab */}
            {activeTab === 'propositions' && (
              <TouchableOpacity
                onPress={() => setShowCreateModal(true)}
                className="bg-blue-600 rounded-lg px-4 py-3 items-center"
              >
                <Text className="text-white font-bold">+ Créer une proposition</Text>
              </TouchableOpacity>
            )}

            {filteredProposals.length === 0 && (
              <View className="bg-gray-800 rounded-lg p-4 items-center">
                <Text className="text-gray-400 text-sm text-center">
                  {activeTab === 'reservations'
                    ? `Aucune réservation pour ${selectedLocation.name} — ${selectedMode.name}`
                    : activeTab === 'sessions'
                      ? `Aucune session pour ${selectedLocation.name} — ${selectedMode.name}`
                      : `Aucune proposition pour ${selectedLocation.name} — ${selectedMode.name}`}
                </Text>
              </View>
            )}

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
                <Text className="text-gray-400 text-xs">{formatDate(new Date(proposal.date))}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Day mini-modal (multiple events in one cell) ── */}
      <Modal visible={showDayModal} animationType="fade" transparent>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={() => setShowDayModal(false)}
        >
          <View
            style={{ backgroundColor: '#1f2937', borderRadius: 16, padding: 20, width: '85%', maxHeight: '70%' }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
                Propositions du {dayModalLabel}
              </Text>
              <TouchableOpacity onPress={() => setShowDayModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={{ color: '#9ca3af', fontSize: 22 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {dayModalProposals.map((proposal) => (
                <TouchableOpacity
                  key={proposal.id}
                  onPress={() => {
                    setShowDayModal(false);
                    setSelectedProposal(proposal);
                    setShowDetailsModal(true);
                  }}
                  style={{ backgroundColor: '#374151', borderRadius: 10, padding: 12, marginBottom: 10 }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>{proposal.time}</Text>
                    <Text style={{ color: '#f97316', fontWeight: 'bold' }}>
                      {proposal.participants.length}/{proposal.mode.minParticipants}
                    </Text>
                  </View>
                  <Text style={{ color: '#d1d5db', fontSize: 13, marginTop: 4 }}>{proposal.mode.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Create proposal modal ── */}
      <Modal visible={showCreateModal} animationType="slide" transparent={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#111827' }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            {/* Sticky header with X */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 24,
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#374151',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
                Créer une proposition
              </Text>
              <TouchableOpacity
                onPress={() => setShowCreateModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: '#374151',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 20, lineHeight: 22 }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
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

              {/* Time slot */}
              <View className="gap-2">
                <Text className="text-white font-bold">Heure</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {TIME_SLOTS.map((time) => (
                    <TouchableOpacity
                      key={time}
                      onPress={() => setSelectedTime(time)}
                      className={cn(
                        'px-4 py-2 rounded-lg mr-2',
                        selectedTime === time ? 'bg-blue-600' : 'bg-gray-800',
                      )}
                    >
                      <Text
                        className={cn(
                          'font-bold',
                          selectedTime === time ? 'text-white' : 'text-gray-300',
                        )}
                      >
                        {time}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Game mode */}
              <View className="gap-2">
                <Text className="text-white font-bold">Mode de jeu</Text>
                {GAME_MODES.map((mode) => (
                  <TouchableOpacity
                    key={mode.id}
                    onPress={() => setSelectedGameMode(mode)}
                    className={cn(
                      'px-4 py-3 rounded-lg border-2',
                      selectedGameMode.id === mode.id
                        ? 'border-blue-600 bg-blue-600/20'
                        : 'border-gray-600',
                    )}
                  >
                    <Text className="text-white font-bold">{mode.name}</Text>
                    <Text className="text-gray-300 text-sm">
                      {mode.minParticipants} joueurs • {mode.price}€ • {mode.duration}h
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Location */}
              <View className="gap-2">
                <Text className="text-white font-bold">Lieu</Text>
                {LOCATIONS.map((loc) => (
                  <TouchableOpacity
                    key={loc.id}
                    onPress={() => setSelectedCreateLocation(loc)}
                    className={cn(
                      'px-4 py-3 rounded-lg border-2',
                      selectedCreateLocation.id === loc.id
                        ? 'border-blue-600 bg-blue-600/20'
                        : 'border-gray-600',
                    )}
                  >
                    <Text className="text-white font-bold">{loc.name}</Text>
                  </TouchableOpacity>
                ))}
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
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Details modal ── */}
      <Modal visible={showDetailsModal} animationType="slide" transparent={false}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#111827' }}>
          {/* Sticky header — same pattern as the create modal so the ✕ is always reachable */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 24,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: '#374151',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
              Détails de la proposition
            </Text>
            <TouchableOpacity
              onPress={() => setShowDetailsModal(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: '#374151',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 20, lineHeight: 22 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {selectedProposal && (
                <View className="gap-4">
                  {/* Mode */}
                  <View className="gap-1">
                    <Text className="text-gray-400 text-sm">Mode</Text>
                    <Text className="text-white text-lg font-bold">
                      {selectedProposal.mode.name}
                    </Text>
                  </View>

                  {/* Date & time */}
                  <View className="gap-1">
                    <Text className="text-gray-400 text-sm">Date et heure</Text>
                    <Text className="text-white text-lg font-bold">
                      {formatDate(new Date(selectedProposal.date))} à {selectedProposal.time}
                    </Text>
                  </View>

                  {/* Lieu */}
                  <View className="gap-1">
                    <Text className="text-gray-400 text-sm">Lieu</Text>
                    <Text className="text-white text-lg font-bold">
                      {selectedProposal.location.name}
                    </Text>
                  </View>

                  {/* Participants */}
                  <View className="gap-2">
                    <Text className="text-gray-400 text-sm">
                      Joueurs inscrits ({selectedProposal.participants.length}/
                      {selectedProposal.mode.minParticipants})
                    </Text>

                    {selectedProposal.participants.length === 0 && (
                      <Text className="text-gray-500 text-sm italic">
                        Aucun joueur inscrit pour {"l'instant"}
                      </Text>
                    )}

                    {selectedProposal.participants.map((participant) => {
                      const player = findPlayer(participant.id);
                      return (
                        <View
                          key={participant.id}
                          className="flex-row items-center gap-3 bg-gray-800 rounded-lg p-3"
                        >
                          {player?.profilePhoto ? (
                            <Image
                              source={{ uri: player.profilePhoto }}
                              style={{ width: 40, height: 40, borderRadius: 20 }}
                              resizeMode="cover"
                            />
                          ) : (
                            <View className="w-10 h-10 rounded-full bg-gray-700 items-center justify-center">
                              <Text className="text-xl">{player?.avatar ?? '👤'}</Text>
                            </View>
                          )}

                          <View className="flex-1">
                            <Text className="text-white font-bold">{participant.name}</Text>
                            {player && (
                              <Text className="text-gray-400 text-xs">
                                {player.division} • Niveau {player.level}
                              </Text>
                            )}
                          </View>

                          {player && (
                            <View
                              className={cn(
                                'px-2 py-1 rounded-full',
                                player.division === 'D1'
                                  ? 'bg-yellow-500'
                                  : player.division === 'D2'
                                    ? 'bg-gray-400'
                                    : 'bg-orange-600',
                              )}
                            >
                              <Text className="text-white font-bold text-xs">
                                {player.division}
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* Price */}
                  <View className="gap-1">
                    <Text className="text-gray-400 text-sm">Prix par joueur</Text>
                    <Text className="text-white text-lg font-bold">
                      {selectedProposal.price}€
                    </Text>
                  </View>

                  {/* Rewards */}
                  <View className="gap-1">
                    <Text className="text-gray-400 text-sm">Récompenses</Text>
                    <Text className="text-white text-lg font-bold">
                      {selectedProposal.rewards}
                    </Text>
                  </View>

                  {/* Action buttons */}
                  <View className="flex-row gap-2 mt-4">
                    <TouchableOpacity
                      onPress={() => handleJoinProposal(selectedProposal)}
                      className="flex-1 bg-green-600 rounded-lg px-4 py-3 items-center"
                    >
                      <Text className="text-white font-bold">Rejoindre</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleLeaveProposal(selectedProposal)}
                      className="flex-1 bg-red-600 rounded-lg px-4 py-3 items-center"
                    >
                      <Text className="text-white font-bold">Quitter</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </ScreenContainer>
  );
}
