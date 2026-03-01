# UNO League - Guide de Publication Expo

## 📱 Accès Immédiat via Expo Go

### Option 1: Scan du Code QR
Scannez ce code QR avec votre téléphone (iOS Camera app ou Android Google Lens) :

**URL Expo Go:** `exps://8081-iytul9lp9epebgnt1d9hv-354143cf.us2.manus.computer`

Le code QR est disponible dans `expo-qr-code.png`

### Option 2: Lien Direct
Ouvrez ce lien sur votre téléphone avec Expo Go installé :
```
exps://8081-iytul9lp9epebgnt1d9hv-354143cf.us2.manus.computer
```

---

## 🚀 Publication sur Expo EAS (Recommandé)

### Prérequis
1. Créer un compte Expo : https://expo.dev
2. Installer Expo CLI : `npm install -g eas-cli`
3. Se connecter : `eas login`

### Étapes de Publication

#### 1. Configurer le projet pour EAS
```bash
cd /home/ubuntu/uno-league-app
eas build:configure
```

#### 2. Générer les builds
```bash
# Build pour iOS
eas build --platform ios

# Build pour Android
eas build --platform android

# Build pour les deux
eas build --platform all
```

#### 3. Publier sur les stores
```bash
# Publier sur App Store (iOS)
eas submit --platform ios

# Publier sur Google Play (Android)
eas submit --platform android
```

---

## 📊 Configuration Actuelle

| Propriété | Valeur |
|-----------|--------|
| **Nom de l'app** | UNO League |
| **Slug** | uno-league-app |
| **Version** | 1.0.0 |
| **Bundle ID (iOS)** | space.manus.uno.league.app.t20240115103045 |
| **Package (Android)** | space.manus.uno.league.app.t20240115103045 |
| **Logo** | assets/images/icon.png |

---

## 🎮 Fonctionnalités Implémentées

### Écrans Principaux
- ✅ **Dashboard/Accueil** - Profil joueur, solde UNO, prochains matchs
- ✅ **Calendrier** - Réservation de sessions par division
- ✅ **Classement** - Leaderboard par division avec filtres
- ✅ **Wallet** - Portefeuille UNO, historique, transferts
- ✅ **Webshop** - Catalogue de produits achetables en UNO
- ✅ **Profil** - Statistiques détaillées et achievements
- ✅ **Modes de Jeu** - 5 modes (UNO League, Agora, Mini-jeux, Entraînement, Tournois)
- ✅ **Annonces** - Notifications et actualités

### Système de Points UNO
- 10 UNO = 1€
- Récompenses par division (D1/D2/D3)
- Meilleur buteur, passeur, défenseur
- Homme du match (MOTM)

### Thème Visuel
- 🎨 Thème sombre/sportif
- 🎨 Couleurs : Bleu foncé (#1e3a8a), Rouge/Orange (#dc2626), Blanc
- 🎨 Inspiré de l'univers manga/anime
- 🎨 Responsive mobile-first design

---

## 🔧 Données Mockées

L'application utilise des données fictives pour démonstration :
- **Joueur par défaut** : Yassine, Division D1, 3500 UNO
- **Matchs** : 12 sessions disponibles par division
- **Produits** : 20 articles de merchandise
- **Transactions** : Historique d'exemple
- **Joueurs** : 50+ joueurs avec statistiques

---

## 📝 Notes Importantes

1. **Données Locales** : Toutes les données sont stockées localement via AsyncStorage
2. **Pas de Backend Requis** : L'app fonctionne entièrement en mode offline avec données mockées
3. **Authentification** : Système d'authentification simple basé sur le contexte React
4. **Persistance** : Les données utilisateur sont sauvegardées localement

---

## 🎯 Prochaines Étapes Recommandées

1. **Intégration Backend** : Connecter à une API pour les données réelles
2. **Push Notifications** : Implémenter les notifications en temps réel
3. **Paiements** : Intégrer Stripe ou PayPal pour les achats réels
4. **Analytics** : Ajouter le suivi des événements utilisateur
5. **Internationalization** : Support multilingue (FR/EN/ES)

---

## 📞 Support

Pour plus d'informations sur Expo :
- Documentation : https://docs.expo.dev
- Community : https://forums.expo.dev
- GitHub : https://github.com/expo/expo

---

**Créé avec ❤️ pour UNO League - The Ultimate Number One**
