# UNO League - Project TODO

## Phase 1: Setup & Configuration
- [x] Generate custom app logo
- [x] Configure theme colors (Tailwind + theme.config.js)
- [x] Setup mock data (players, matches, products, rankings)
- [x] Create navigation structure (Tab bar + modals)
- [x] Setup authentication context

## Phase 2: Core Screens - Authentication & Dashboard
- [x] Login Screen (integrated in auth context)
- [x] Dashboard/Home Screen
- [x] Profile Detail Screen
- [x] Tab navigation setup

## Phase 3: Gameplay & Scheduling
- [x] Calendar/Match Booking Screen
- [x] Match Detail Modal (integrated in calendar)
- [x] Modes de Jeu Screen
- [x] Match reservation logic (UI ready)

## Phase 4: Competitive Features
- [x] Ranking Screen (by division)
- [x] Player Stats Display
- [x] Leaderboard filters

## Phase 5: Economy & Shop
- [x] Wallet/Portfolio Screen
- [x] Transaction history
- [x] Webshop Screen
- [x] Product detail modal
- [x] Purchase logic (UNO points)

## Phase 6: Communication
- [x] Announcements/Notifications Screen
- [x] Notification detail modal
- [ ] Push notification setup

## Phase 7: Polish & Deployment
- [x] Test all user flows end-to-end
- [x] Verify theme consistency
- [ ] Test on iOS and Android (ready for testing)
- [x] Generate app logo and update branding
- [ ] Create checkpoint
- [ ] Publish to Expo

## Features Checklist

### Authentication
- [ ] Login with email/password
- [ ] Persist user session
- [ ] Mock user: Yassine, D1, 3500 UNO

### Dashboard
- [ ] Display player profile (name, division, UNO, XP, level)
- [ ] Show next 3 matches
- [ ] Display recent announcements
- [ ] Quick action buttons

### Calendar
- [ ] Display matches by division
- [ ] Show available time slots
- [ ] Reservation functionality
- [ ] Booked matches indicator

### Ranking
- [ ] Display by division (D1/D2/D3)
- [ ] Filter by statistic (buteur, passeur, défenseur)
- [ ] Show individual player stats
- [ ] Highlight current player

### Wallet
- [ ] Display UNO balance
- [ ] Show EUR equivalent (10 UNO = 1€)
- [ ] Send/Receive UNO
- [ ] Favorite contacts
- [ ] Transaction history

### Webshop
- [ ] Product catalog (headphones, watches, shoes, clothes)
- [ ] Product filtering by category
- [ ] Purchase with UNO points
- [ ] Purchase confirmation
- [ ] Order history

### Modes de Jeu
- [ ] UNO League
- [ ] Agora League
- [ ] Mini-jeux
- [ ] Entraînements
- [ ] Tournois

### Announcements
- [ ] Display announcements list
- [ ] Announcement detail view
- [ ] Mark as read

### Branding
- [ ] Custom app logo
- [ ] Update app.config.ts with branding
- [ ] Consistent color scheme throughout


## Phase 8: Corrections et Améliorations

### Webshop & Navigation
- [x] Corriger l'accès au webshop (ajouter route dans tab navigation)
- [x] Ajouter onglet "Informations" dans la navigation

### Calendrier & Matchs
- [x] Implémenter l'interaction avec les slots disponibles
- [x] Ajouter fonctionnalité pour s'ajouter à une proposition
- [x] Ajouter création de nouvelles propositions de matchs
- [x] Ajouter sélection du lieu (Fit Five Forest, Fit Five Laeken, YC Five, Arena, etc.)

### Wallet
- [x] Supprimer le bouton "Recevoir"
- [x] Corriger le bug du clavier iPhone dans le modal "Envoyer"
- [x] Ajouter bouton pour fermer le clavier ou TouchableWithoutFeedback

### Classement
- [x] Corriger les labels : "buts" au lieu de "buteurs"
- [x] Corriger les labels : "passes" au lieu de "passeurs"
- [x] Corriger les labels : "défenses" au lieu de "défenseurs"

### Annonces & Player of the Month
- [x] Ajouter section Player of the Month visible
- [x] Afficher statistiques du Player of the Month

### Panel Admin
- [x] Implémenter authentification admin (portedehal@gmail.com)
- [x] Créer dashboard admin avec KPI
- [x] Ajouter gestion du webshop (CRUD articles)
- [x] Ajouter gestion des UNO des joueurs
- [x] Afficher statistiques (joueurs, sessions, UNO distribués)

### Publication
- [x] Tester tous les changements
- [ ] Créer checkpoint final
- [ ] Publier via Expo
