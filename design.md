# UNO League - Mobile App Design

## Design Philosophy
L'application UNO League adopte un thème visuel **sombre et sportif** inspiré de l'univers **manga/anime**. L'interface est conçue pour une utilisation **en portrait (9:16)** et optimisée pour une **utilisation à une main**.

## Palette de Couleurs

| Élément | Couleur | Code | Usage |
|---------|---------|------|-------|
| Primary | Bleu Foncé | #1E3A8A | Boutons, accents, highlights |
| Secondary | Rouge/Orange | #DC2626 | Alertes, badges, emphasis |
| Accent | Orange Vif | #F97316 | Highlights, CTAs secondaires |
| Background | Noir Profond | #0F172A | Arrière-plan principal |
| Surface | Gris Foncé | #1E293B | Cartes, panneaux |
| Foreground | Blanc | #FFFFFF | Texte principal |
| Muted | Gris Clair | #94A3B8 | Texte secondaire |
| Border | Gris Moyen | #334155 | Bordures, séparateurs |
| Success | Vert | #10B981 | Succès, promotions |
| Warning | Jaune | #F59E0B | Avertissements |
| Error | Rouge | #DC2626 | Erreurs |

## Structure des Écrans

### 1. Login Screen
**Objectif :** Authentification utilisateur simple
- Logo UNO League (anime-style)
- Champ email
- Champ mot de passe
- Bouton "Se connecter"
- Lien "Créer un compte"
- Thème full-screen avec gradient bleu foncé

### 2. Dashboard Principal (Home)
**Objectif :** Vue d'ensemble du profil et des actions rapides
- En-tête avec salutation et profil
- Carte profil : Nom, Division, Points UNO, Équivalent €
- Barre de progression XP/Niveau
- Boutons d'action rapides : Calendrier, Webshop, Wallet
- Section "Prochains matchs" (3 prochains)
- Section "Annonces" (2-3 dernières)

### 3. Profil Détaillé
**Objectif :** Statistiques complètes et historique
- En-tête avec photo/avatar et infos principales
- Statistiques détaillées (buts, passes, défenses, arrêts, MOTM)
- Progression saison (XP/Niveau)
- Historique des matchs (liste scrollable)
- Historique promotions/relégations
- Onglets : Stats | Historique | Récompenses

### 4. Calendrier des Matchs
**Objectif :** Réservation et consultation des sessions
- Vue calendrier par mois
- Filtres : Division (D1/D2/D3), Type (Officiel/Proposé/Organisé)
- Liste des créneaux disponibles (14h-16h, 16h-18h, etc.)
- Bouton "Réserver" pour chaque créneau
- Indicateur de statut (Réservé, Complet, Disponible)
- Détails du match au tap

### 5. Classement
**Objectif :** Suivi des positions et statistiques
- Onglets : Par Division (D1/D2/D3) | Individuel
- Filtre par statistique (Buteurs, Passeurs, Défenseurs)
- Liste classée avec position, nom, stats
- Mise en avant du joueur actuel
- Indicateur "Mise à jour dans X jours"
- Cartes style FIFA pour les top 3

### 6. Wallet/Portefeuille
**Objectif :** Gestion de la monnaie virtuelle
- Solde UNO prominent (gros chiffre)
- Équivalent en € (10 UNO = 1€)
- Boutons : Envoyer | Recevoir
- Liste des contacts favoris
- Historique des transactions (dernières 10)
- Détails transaction au tap

### 7. Webshop
**Objectif :** Achat de produits avec points UNO
- Grille de produits (2 colonnes)
- Chaque produit : image, nom, prix en UNO
- Bouton "Acheter" avec confirmation
- Filtre par catégorie (Écouteurs, Montres, Chaussures, etc.)
- Panier (nombre d'articles)
- Historique des commandes

### 8. Modes de Jeu
**Objectif :** Accès aux différents modes disponibles
- Grille de 5 modes : UNO League | Agora League | Mini-jeux | Entraînements | Tournois
- Chaque mode : icône, nom, description courte
- Bouton "Jouer" ou "En savoir plus"
- Indicateur de récompenses disponibles

### 9. Annonces/Notifications
**Objectif :** Communication des mises à jour importantes
- Liste des annonces (dernières en haut)
- Chaque annonce : titre, date, icône de type
- Types : Info, Alerte, Récompense, Maintenance
- Détail au tap avec contenu complet
- Marquer comme lue

## Navigation

**Tab Bar Principal (5 onglets) :**
1. Home (Dashboard)
2. Calendrier
3. Classement
4. Wallet
5. Profil

**Écrans Modaux/Stack :**
- Login (avant authentification)
- Détail Match
- Détail Produit
- Détail Annonce
- Modes de Jeu
- Historique Transactions

## Typographie

| Élément | Font | Taille | Poids |
|---------|------|--------|-------|
| Titre Principal | SF Pro Display | 28px | Bold (700) |
| Titre Écran | SF Pro Display | 24px | Semibold (600) |
| Titre Carte | SF Pro Display | 18px | Semibold (600) |
| Texte Principal | SF Pro Text | 16px | Regular (400) |
| Texte Secondaire | SF Pro Text | 14px | Regular (400) |
| Label/Caption | SF Pro Text | 12px | Regular (400) |
| Chiffres Importants | SF Pro Display | 32px | Bold (700) |

## Composants Réutilisables

- **Card** : Surface arrondie avec bordure légère
- **Button** : Primaire (bleu), Secondaire (gris), Danger (rouge)
- **Badge** : Petits labels (Division, Statut)
- **StatBox** : Affichage stat (nombre + label)
- **PlayerCard** : Carte joueur style FIFA
- **MatchCard** : Affichage match avec équipes
- **ProductCard** : Produit webshop
- **TransactionItem** : Ligne transaction

## Interactions

- **Press Feedback** : Opacity 0.7 sur les éléments tactiles
- **Haptics** : Léger retour haptique sur les actions principales
- **Animations** : Transitions fluides (250-300ms) entre écrans
- **Loading** : Spinner avec texte "Chargement..."
- **Empty States** : Illustrations avec message encourageant

## Responsive Design

- **Portrait** : Optimisé pour 375px-430px (iPhone standard)
- **Notch** : SafeArea gérée automatiquement
- **Tab Bar** : Toujours visible, 56px + safe area bottom
- **Padding** : 16px horizontal standard, 12px vertical entre sections
