import type { ErrorLabelFamily, Locale } from "@uno/shared";

/**
 * Les messages d'erreur du serveur en anglais et en néerlandais (I18N-002).
 *
 * **La clé est le texte français**, tel qu'il est écrit à l'endroit où
 * l'erreur est levée — gabarit à trous compris. Un identifiant abstrait
 * (`proposal.teamFull`) obligerait à ouvrir ce fichier pour savoir ce que lit
 * le joueur ; le texte, lui, se lit sur place.
 *
 * Le revers : corriger une virgule dans un message français le fait sortir du
 * catalogue. C'est voulu, et c'est surveillé — `i18n-errors.test.ts` relève
 * tous les messages du code et exige ici une traduction pour chacun, avec les
 * mêmes `{jetons}`. Une phrase retouchée sans sa traduction fait échouer la
 * suite ; elle ne s'affiche jamais en français à un anglophone.
 *
 * L'anglais est britannique sans excès, le néerlandais celui de Flandre, au
 * tutoiement (`je`) comme le reste de l'application.
 */

export type LangueTraduite = Exclude<Locale, "fr">;

type Traduction = Record<LangueTraduite, string>;

export const CATALOGUE_ERREURS: Record<string, Traduction> = {
  // --- Messages par défaut de chaque code -----------------------------------
  "Certaines informations saisies sont invalides.": {
    en: "Some of the information entered is invalid.",
    nl: "Sommige ingevulde gegevens zijn ongeldig.",
  },
  "Votre session a expiré. Veuillez vous reconnecter.": {
    en: "Your session has expired. Please sign in again.",
    nl: "Je sessie is verlopen. Meld je opnieuw aan.",
  },
  "Vous n'avez pas les droits nécessaires pour cette action.": {
    en: "You do not have the rights for this action.",
    nl: "Je hebt niet de rechten voor deze actie.",
  },
  "Cet élément est introuvable.": {
    en: "This item cannot be found.",
    nl: "Dit item is niet gevonden.",
  },
  "Email déjà utilisé.": {
    en: "Email already in use.",
    nl: "E-mailadres al in gebruik.",
  },
  "Email ou mot de passe incorrect.": {
    en: "Wrong email or password.",
    nl: "Verkeerd e-mailadres of wachtwoord.",
  },
  "Cette action entre en conflit avec l'état actuel.": {
    en: "This action conflicts with the current state.",
    nl: "Deze actie botst met de huidige toestand.",
  },
  "Cette session est complète.": {
    en: "This session is full.",
    nl: "Deze sessie is vol.",
  },
  "Les inscriptions pour cette session sont closes.": {
    en: "Sign-ups for this session are closed.",
    nl: "De inschrijvingen voor deze sessie zijn gesloten.",
  },
  "Votre participation est déjà payée.": {
    en: "Your place is already paid.",
    nl: "Je plaats is al betaald.",
  },
  "Vous ne participez pas à cette session.": {
    en: "You are not in this session.",
    nl: "Je neemt niet deel aan deze sessie.",
  },
  "Vous n'avez pas assez de points UNO.": {
    en: "You do not have enough UNO points.",
    nl: "Je hebt niet genoeg UNO-punten.",
  },
  "Cette action ne respecte pas les règles de la ligue.": {
    en: "This action does not follow the league's rules.",
    nl: "Deze actie volgt de regels van de competitie niet.",
  },
  "Le paiement n'a pas abouti.": {
    en: "The payment did not go through.",
    nl: "De betaling is niet doorgegaan.",
  },
  "Ce produit n'est plus disponible.": {
    en: "This product is no longer available.",
    nl: "Dit product is niet meer beschikbaar.",
  },
  "Trop de tentatives. Réessayez dans quelques instants.": {
    en: "Too many attempts. Try again in a moment.",
    nl: "Te veel pogingen. Probeer straks opnieuw.",
  },
  "Une erreur est survenue. Veuillez réessayer.": {
    en: "Something went wrong. Please try again.",
    nl: "Er is iets misgegaan. Probeer opnieuw.",
  },

  // --- Accès -----------------------------------------------------------------
  "La saisie des feuilles de match est réservée aux superviseurs.": {
    en: "Entering match sheets is reserved for supervisors.",
    nl: "Wedstrijdbladen invullen is voorbehouden aan supervisors.",
  },
  "Outil indisponible sur cet environnement.": {
    en: "This tool is not available on this environment.",
    nl: "Deze tool is niet beschikbaar in deze omgeving.",
  },
  "Vous avez pris part à cette session : sa saisie revient à un autre superviseur.":
    {
      en: "You took part in this session: another supervisor must enter it.",
      nl: "Je hebt aan deze sessie deelgenomen: een andere supervisor moet ze invullen.",
    },

  // --- Paiement ----------------------------------------------------------------
  "Le paiement par carte n'est pas encore disponible. Utilisez vos points UNO.":
    {
      en: "Card payment is not available yet. Use your UNO points.",
      nl: "Betalen met kaart is nog niet mogelijk. Gebruik je UNO-punten.",
    },
  "Le paiement en ligne n'est pas configuré.": {
    en: "Online payment is not set up.",
    nl: "Online betalen is niet ingesteld.",
  },
  "Moyen de paiement non supporté.": {
    en: "Payment method not supported.",
    nl: "Betaalmethode niet ondersteund.",
  },
  "Le paiement n'a pas pu être initié.": {
    en: "The payment could not be started.",
    nl: "De betaling kon niet worden gestart.",
  },
  "Cette session n'a pas encore atteint le nombre de joueurs requis.": {
    en: "This session has not reached the required number of players yet.",
    nl: "Deze sessie heeft het vereiste aantal spelers nog niet bereikt.",
  },
  "Cette session n'attend plus de paiement.": {
    en: "This session is no longer waiting for payment.",
    nl: "Deze sessie wacht niet meer op betaling.",
  },
  "Ce moyen de paiement n'est pas disponible actuellement.": {
    en: "This payment method is not available right now.",
    nl: "Deze betaalmethode is momenteel niet beschikbaar.",
  },
  "Ce paiement est déjà en cours de traitement.": {
    en: "This payment is already being processed.",
    nl: "Deze betaling wordt al verwerkt.",
  },

  // --- Comptes -------------------------------------------------------------------
  "Échec inattendu.": {
    en: "Unexpected failure.",
    nl: "Onverwachte fout.",
  },
  "Ce joueur n'existe pas.": {
    en: "This player does not exist.",
    nl: "Deze speler bestaat niet.",
  },
  "Ce compte est déjà supprimé.": {
    en: "This account has already been deleted.",
    nl: "Dit account is al verwijderd.",
  },
  "Vous ne pouvez pas supprimer votre propre compte depuis l'administration.": {
    en: "You cannot delete your own account from the admin panel.",
    nl: "Je kunt je eigen account niet verwijderen vanuit het beheer.",
  },
  "Ce compte est administrateur. Retirez-lui d'abord ce rôle, puis supprimez-le.":
    {
      en: "This is an administrator account. Remove that role first, then delete it.",
      nl: "Dit is een beheerdersaccount. Neem eerst die rol af en verwijder het daarna.",
    },
  "Ce joueur a fondé le club « {club} ». Dissolvez le club ou transmettez-en la fondation avant de supprimer le compte.":
    {
      en: "This player founded the club “{club}”. Disband the club or hand it over before deleting the account.",
      nl: "Deze speler heeft de club “{club}” opgericht. Hef de club op of draag ze over voor je het account verwijdert.",
    },
  "Joueur introuvable.": {
    en: "Player not found.",
    nl: "Speler niet gevonden.",
  },
  "Un arbitre n'a pas de division : il n'entre pas au classement.": {
    en: "A referee has no division: they are not in the rankings.",
    nl: "Een scheidsrechter heeft geen divisie: hij telt niet mee in het klassement.",
  },
  "Cet arbitre est engagé sur une session à venir. Retirez-le d'abord.": {
    en: "This referee is booked for an upcoming session. Remove them from it first.",
    nl: "Deze scheidsrechter is ingepland voor een komende sessie. Haal hem daar eerst weg.",
  },
  "Cet email est déjà utilisé par un autre compte.": {
    en: "This email is already used by another account.",
    nl: "Dit e-mailadres wordt al door een ander account gebruikt.",
  },
  "Cet email est déjà utilisé.": {
    en: "This email is already in use.",
    nl: "Dit e-mailadres is al in gebruik.",
  },
  "Ce compte est suspendu. Contactez un administrateur.": {
    en: "This account is suspended. Contact an administrator.",
    nl: "Dit account is geschorst. Neem contact op met een beheerder.",
  },
  "Compte introuvable.": {
    en: "Account not found.",
    nl: "Account niet gevonden.",
  },
  "Mot de passe actuel incorrect.": {
    en: "Current password is incorrect.",
    nl: "Huidig wachtwoord is onjuist.",
  },
  "Ce lien n'est plus valable. Demandez-en un nouveau : les liens de réinitialisation expirent après une heure et ne servent qu'une fois.":
    {
      en: "This link is no longer valid. Ask for a new one: reset links expire after one hour and work only once.",
      nl: "Deze link is niet meer geldig. Vraag een nieuwe aan: herstellinks vervallen na een uur en werken maar één keer.",
    },
  "Profil introuvable.": {
    en: "Profile not found.",
    nl: "Profiel niet gevonden.",
  },
  "Ce joueur est introuvable.": {
    en: "This player cannot be found.",
    nl: "Deze speler is niet gevonden.",
  },

  // --- Boutique, portefeuille ------------------------------------------------------
  "Produit introuvable.": {
    en: "Product not found.",
    nl: "Product niet gevonden.",
  },
  "Ce produit est introuvable.": {
    en: "This product cannot be found.",
    nl: "Dit product is niet gevonden.",
  },
  "Stock insuffisant pour « {produit} ».": {
    en: "Not enough stock for “{produit}”.",
    nl: "Onvoldoende voorraad voor “{produit}”.",
  },
  "Choisissez une taille pour « {produit} ».": {
    en: "Choose a size for “{produit}”.",
    nl: "Kies een maat voor “{produit}”.",
  },
  "La taille « {taille} » n'est pas proposée pour « {produit} ».": {
    en: "Size “{taille}” is not offered for “{produit}”.",
    nl: "Maat “{taille}” wordt niet aangeboden voor “{produit}”.",
  },
  "Choisissez une association pour « {produit} ».": {
    en: "Choose a charity for “{produit}”.",
    nl: "Kies een goed doel voor “{produit}”.",
  },
  "Cette association n'est plus proposée.": {
    en: "This charity is no longer offered.",
    nl: "Dit goede doel wordt niet meer aangeboden.",
  },
  "« {produit} » n'est pas un don.": {
    en: "“{produit}” is not a donation.",
    nl: "“{produit}” is geen gift.",
  },
  "Cet achat est déjà en cours de traitement.": {
    en: "This purchase is already being processed.",
    nl: "Deze aankoop wordt al verwerkt.",
  },
  "Cette commande est introuvable.": {
    en: "This order cannot be found.",
    nl: "Deze bestelling is niet gevonden.",
  },
  "Cette commande est {statut} : elle ne peut plus être annulée. Contactez l'organisation.":
    {
      en: "This order is {statut}: it can no longer be cancelled. Contact the organisers.",
      nl: "Deze bestelling is {statut}: ze kan niet meer geannuleerd worden. Neem contact op met de organisatie.",
    },
  "Une commande {de} ne peut pas passer à « {vers} ».": {
    en: "An order that is {de} cannot move to “{vers}”.",
    nl: "Een bestelling die {de} is, kan niet naar “{vers}” gaan.",
  },
  "Une association porte déjà ce nom.": {
    en: "A charity already has this name.",
    nl: "Er bestaat al een goed doel met deze naam.",
  },
  "Association introuvable.": {
    en: "Charity not found.",
    nl: "Goed doel niet gevonden.",
  },
  "Vous avez déjà {limite} propositions en attente. Attendez une réponse avant d'en envoyer d'autres.":
    {
      en: "You already have {limite} pending suggestions. Wait for an answer before sending more.",
      nl: "Je hebt al {limite} voorstellen in afwachting. Wacht op een antwoord voor je er nog stuurt.",
    },
  "Proposition introuvable.": {
    en: "Suggestion not found.",
    nl: "Voorstel niet gevonden.",
  },
  "Cette proposition a déjà été traitée.": {
    en: "This suggestion has already been handled.",
    nl: "Dit voorstel is al behandeld.",
  },
  "L'avis n'a pas pu être enregistré.": {
    en: "The review could not be saved.",
    nl: "De beoordeling kon niet worden opgeslagen.",
  },
  "Le montant doit être un nombre entier positif.": {
    en: "The amount must be a positive whole number.",
    nl: "Het bedrag moet een positief geheel getal zijn.",
  },
  "Cette opération est déjà en cours de traitement.": {
    en: "This operation is already being processed.",
    nl: "Deze verrichting wordt al verwerkt.",
  },
  "Vous ne pouvez pas vous envoyer des points à vous-même.": {
    en: "You cannot send points to yourself.",
    nl: "Je kunt geen punten naar jezelf sturen.",
  },
  "Cette annonce est introuvable.": {
    en: "This announcement cannot be found.",
    nl: "Deze aankondiging is niet gevonden.",
  },

  // --- Sessions : création ------------------------------------------------------
  "Cette session est introuvable.": {
    en: "This session cannot be found.",
    nl: "Deze sessie is niet gevonden.",
  },
  "Session introuvable.": {
    en: "Session not found.",
    nl: "Sessie niet gevonden.",
  },
  "Ce mode de jeu n'est pas disponible.": {
    en: "This game mode is not available.",
    nl: "Deze spelvorm is niet beschikbaar.",
  },
  "Mode fermé": {
    en: "Mode closed",
    nl: "Spelvorm gesloten",
  },
  "Ce créneau n'est pas disponible.": {
    en: "This time slot is not available.",
    nl: "Dit tijdslot is niet beschikbaar.",
  },
  "Créneau invalide pour ce mode": {
    en: "Invalid time slot for this mode",
    nl: "Ongeldig tijdslot voor deze spelvorm",
  },
  "Ce terrain n'accueille pas ce mode de jeu.": {
    en: "This pitch does not host this game mode.",
    nl: "Dit veld is niet voor deze spelvorm.",
  },
  "Terrain réservé à un autre mode": {
    en: "Pitch reserved for another mode",
    nl: "Veld voorbehouden aan een andere spelvorm",
  },
  "Choisissez le nombre de joueurs par équipe.": {
    en: "Choose the number of players per team.",
    nl: "Kies het aantal spelers per ploeg.",
  },
  "Valeur requise pour ce mode": {
    en: "Required for this mode",
    nl: "Verplicht voor deze spelvorm",
  },
  "L'effectif doit être compris entre {min} et {max} joueurs par équipe.": {
    en: "A team must have between {min} and {max} players.",
    nl: "Een ploeg telt tussen {min} en {max} spelers.",
  },
  "Entre {min} et {max}": {
    en: "Between {min} and {max}",
    nl: "Tussen {min} en {max}",
  },
  "Ce mode a un format fixe : l'effectif ne se choisit pas.": {
    en: "This mode has a fixed format: the team size cannot be chosen.",
    nl: "Deze spelvorm heeft een vast formaat: de ploeggrootte kies je niet.",
  },
  "Sans objet pour ce mode": {
    en: "Not applicable to this mode",
    nl: "Niet van toepassing op deze spelvorm",
  },
  "Une session de ce mode se crée au moins {heures} heures à l'avance.": {
    en: "A session in this mode must be created at least {heures} hours ahead.",
    nl: "Een sessie in deze spelvorm maak je minstens {heures} uur op voorhand aan.",
  },
  "Créneau trop proche": {
    en: "Time slot too soon",
    nl: "Tijdslot te dichtbij",
  },
  "Une session doit être créée au moins {jours} jours à l'avance.": {
    en: "A session must be created at least {jours} days ahead.",
    nl: "Een sessie moet minstens {jours} dagen op voorhand aangemaakt worden.",
  },
  "Date la plus proche possible : {date}": {
    en: "Earliest possible date: {date}",
    nl: "Vroegst mogelijke datum: {date}",
  },
  "Ce créneau vient d'être pris. Actualisez la liste.": {
    en: "This time slot has just been taken. Refresh the list.",
    nl: "Dit tijdslot is net ingenomen. Vernieuw de lijst.",
  },
  "Seules les séances sans participation se déplacent depuis l'application.": {
    en: "Only sessions nobody has joined can be moved from the app.",
    nl: "Alleen sessies zonder deelnemers kun je vanuit de app verplaatsen.",
  },
  "Cette séance est terminée : elle ne se déplace plus.": {
    en: "This session is over: it can no longer be moved.",
    nl: "Deze sessie is voorbij: ze kan niet meer verplaatst worden.",
  },
  "Une autre séance occupe déjà ce terrain à cette heure.": {
    en: "Another session already has this pitch at that time.",
    nl: "Een andere sessie gebruikt dit veld al op dat uur.",
  },

  // --- Sessions : équipes et places ----------------------------------------------
  "L'équipe {camp} est complète ({taille} joueurs). Rejoignez l'équipe {autre}.":
    {
      en: "Team {camp} is full ({taille} players). Join team {autre}.",
      nl: "Ploeg {camp} is volzet ({taille} spelers). Sluit je aan bij ploeg {autre}.",
    },
  "L'équipe {camp} est complète ({taille} joueurs).": {
    en: "Team {camp} is full ({taille} players).",
    nl: "Ploeg {camp} is volzet ({taille} spelers).",
  },
  "Les équipes de ce mode sont composées à la clôture.": {
    en: "Teams in this mode are drawn when sign-ups close.",
    nl: "In deze spelvorm worden de ploegen samengesteld bij het afsluiten.",
  },
  "Cette séance est terminée : les équipes n'y changent plus.": {
    en: "This session is over: the teams no longer change.",
    nl: "Deze sessie is voorbij: de ploegen veranderen niet meer.",
  },
  "Les équipes de ce mode ne se choisissent pas.": {
    en: "Teams cannot be chosen in this mode.",
    nl: "In deze spelvorm kies je je ploeg niet.",
  },
  "Cette équipe n'existe pas dans cette séance.": {
    en: "This team does not exist in this session.",
    nl: "Deze ploeg bestaat niet in deze sessie.",
  },
  "Équipe inconnue": {
    en: "Unknown team",
    nl: "Onbekende ploeg",
  },
  "{equipe} est complète ({taille} joueurs).": {
    en: "{equipe} is full ({taille} players).",
    nl: "{equipe} is volzet ({taille} spelers).",
  },
  "{equipe} est complète ({taille} joueurs). Il reste de la place en {libre}.":
    {
      en: "{equipe} is full ({taille} players). There is still room in {libre}.",
      nl: "{equipe} is volzet ({taille} spelers). Er is nog plaats in {libre}.",
    },
  "{equipe} est complète ({taille} joueurs). Il reste de la place en {libre} et en {autre}.":
    {
      en: "{equipe} is full ({taille} players). There is still room in {libre} and {autre}.",
      nl: "{equipe} is volzet ({taille} spelers). Er is nog plaats in {libre} en {autre}.",
    },
  "Les équipes ne sont pas encore formées.": {
    en: "The teams have not been formed yet.",
    nl: "De ploegen zijn nog niet gevormd.",
  },
  "Choisissez d'abord votre équipe : une place appartient à une équipe.": {
    en: "Choose your team first: a spot belongs to a team.",
    nl: "Kies eerst je ploeg: een positie hoort bij een ploeg.",
  },
  "Vous êtes sur le banc : réglez votre place pour entrer sur le terrain.": {
    en: "You are on the bench: pay for your place to get on the pitch.",
    nl: "Je zit op de bank: betaal je plaats om het veld op te gaan.",
  },
  "Cette place n'existe pas dans une formation à {taille}.": {
    en: "This spot does not exist in a {taille}-a-side formation.",
    nl: "Deze positie bestaat niet in een opstelling met {taille}.",
  },
  "Place inconnue pour cet effectif": {
    en: "Unknown spot for this team size",
    nl: "Onbekende positie voor deze ploeggrootte",
  },
  "Cette place est déjà prise : choisissez-en une autre.": {
    en: "This spot is already taken: choose another one.",
    nl: "Deze positie is al ingenomen: kies een andere.",
  },
  "Cette place vient d'être prise : choisissez-en une autre.": {
    en: "This spot has just been taken: choose another one.",
    nl: "Deze positie is net ingenomen: kies een andere.",
  },
  "Cette séance est terminée : le terrain n'y change plus.": {
    en: "This session is over: the pitch no longer changes.",
    nl: "Deze sessie is voorbij: het veld verandert niet meer.",
  },
  "Cette formation n'existe pas à {taille} joueurs.": {
    en: "This formation does not exist with {taille} players.",
    nl: "Deze opstelling bestaat niet met {taille} spelers.",
  },
  "Formation inconnue pour cet effectif": {
    en: "Unknown formation for this team size",
    nl: "Onbekende opstelling voor deze ploeggrootte",
  },
  "Choisissez d'abord votre équipe : une formation appartient à un camp.": {
    en: "Choose your team first: a formation belongs to a side.",
    nl: "Kies eerst je ploeg: een opstelling hoort bij een kamp.",
  },
  "Choisissez d'abord votre équipe : une formation appartient à une équipe.": {
    en: "Choose your team first: a formation belongs to a team.",
    nl: "Kies eerst je ploeg: een opstelling hoort bij een ploeg.",
  },
  "Vous n'êtes dans aucune équipe de cette séance.": {
    en: "You are not in any team in this session.",
    nl: "Je zit in geen enkele ploeg van deze sessie.",
  },
  "Choisissez d'abord votre équipe : une place appartient à un camp.": {
    en: "Choose your team first: a spot belongs to a side.",
    nl: "Kies eerst je ploeg: een positie hoort bij een kamp.",
  },
  "Les équipes ne se forment qu'une fois le plateau complet.": {
    en: "Teams are only formed once the session is full.",
    nl: "De ploegen worden pas gevormd als de sessie volzet is.",
  },

  // --- Sessions : inscription, remplaçants ------------------------------------------
  "Un compte arbitre ne participe pas comme joueur. Proposez-vous comme arbitre.":
    {
      en: "A referee account does not play. Offer to referee instead.",
      nl: "Een scheidsrechtersaccount speelt niet mee. Bied je aan als scheidsrechter.",
    },
  "Cette session est réservée à la division {division}.": {
    en: "This session is reserved for division {division}.",
    nl: "Deze sessie is voorbehouden aan divisie {division}.",
  },
  "Les inscriptions sont closes : contactez un administrateur pour vous désister.":
    {
      en: "Sign-ups are closed: contact an administrator to withdraw.",
      nl: "De inschrijvingen zijn gesloten: neem contact op met een beheerder om je af te melden.",
    },
  "Cette session est encore ouverte : inscrivez-vous directement.": {
    en: "This session is still open: sign up directly.",
    nl: "Deze sessie is nog open: schrijf je gewoon in.",
  },
  "Cette session n'attend plus de remplaçant.": {
    en: "This session no longer needs substitutes.",
    nl: "Deze sessie zoekt geen invallers meer.",
  },
  "Vous êtes déjà inscrit à cette session.": {
    en: "You are already signed up for this session.",
    nl: "Je bent al ingeschreven voor deze sessie.",
  },
  "Le délai de paiement de 24 heures n'est pas encore écoulé.": {
    en: "The 24-hour payment window has not ended yet.",
    nl: "De betaaltermijn van 24 uur is nog niet verstreken.",
  },
  "Déclarez-vous d'abord remplaçant sur cette session.": {
    en: "Sign up as a substitute for this session first.",
    nl: "Meld je eerst aan als invaller voor deze sessie.",
  },
  "Toutes les places de cette session sont réglées.": {
    en: "Every place in this session has been paid.",
    nl: "Alle plaatsen van deze sessie zijn betaald.",
  },
  "Le plateau de cette session est déjà complet.": {
    en: "This session is already full.",
    nl: "Deze sessie is al volzet.",
  },
  "Le plateau n'est pas complet : le paiement n'est pas encore ouvert.": {
    en: "The session is not full: payment is not open yet.",
    nl: "De sessie is niet volzet: betalen kan nog niet.",
  },

  "Limite atteinte : {max} invitations par jour.": {
    en: "Limit reached: {max} invitations per day.",
    nl: "Limiet bereikt: {max} uitnodigingen per dag.",
  },

  // --- Arbitrage -----------------------------------------------------------------
  "Seules les sessions UNO League sont arbitrées.": {
    en: "Only UNO League sessions have a referee.",
    nl: "Alleen UNO League-sessies hebben een scheidsrechter.",
  },
  "Seul un compte arbitre peut se proposer pour arbitrer une session.": {
    en: "Only a referee account can offer to referee a session.",
    nl: "Alleen een scheidsrechtersaccount kan zich aanbieden om een sessie te fluiten.",
  },
  "Cette session est terminée : elle n'attend plus d'arbitre.": {
    en: "This session is over: it no longer needs a referee.",
    nl: "Deze sessie is voorbij: ze zoekt geen scheidsrechter meer.",
  },
  "Cette session a déjà un arbitre.": {
    en: "This session already has a referee.",
    nl: "Deze sessie heeft al een scheidsrechter.",
  },
  "Arbitre introuvable.": {
    en: "Referee not found.",
    nl: "Scheidsrechter niet gevonden.",
  },
  "Cette session est clôturée : l'arbitrage est acquis.": {
    en: "This session is closed: the refereeing is settled.",
    nl: "Deze sessie is afgesloten: de scheidsrechter is al vergoed.",
  },

  // --- Matchs et clôture ------------------------------------------------------------
  "Cette session a des matchs validés : sa composition ne peut plus changer.": {
    en: "This session has validated matches: its line-up can no longer change.",
    nl: "Deze sessie heeft gevalideerde wedstrijden: de samenstelling kan niet meer veranderen.",
  },
  "Ce match est déjà validé. Utilisez la correction administrative.": {
    en: "This match is already validated. Use the admin correction.",
    nl: "Deze wedstrijd is al gevalideerd. Gebruik de correctie via het beheer.",
  },
  "Une statistique concerne un joueur qui n'a pas disputé ce match.": {
    en: "A statistic refers to a player who did not play this match.",
    nl: "Een statistiek gaat over een speler die deze wedstrijd niet speelde.",
  },
  "Un joueur ne peut avoir qu'une ligne de statistiques par match.": {
    en: "A player can only have one statistics line per match.",
    nl: "Een speler kan maar één statistiekregel per wedstrijd hebben.",
  },
  "Ce match est introuvable.": {
    en: "This match cannot be found.",
    nl: "Deze wedstrijd is niet gevonden.",
  },
  "Ce match a déjà été validé.": {
    en: "This match has already been validated.",
    nl: "Deze wedstrijd is al gevalideerd.",
  },
  "Le rapport de match doit être saisi avant validation.": {
    en: "The match report must be entered before validation.",
    nl: "Het wedstrijdverslag moet ingevuld zijn vóór de validatie.",
  },
  "Seule une session confirmée peut être clôturée.": {
    en: "Only a confirmed session can be closed.",
    nl: "Alleen een bevestigde sessie kan afgesloten worden.",
  },
  "Seule une session clôturée peut être rouverte pour correction.": {
    en: "Only a closed session can be reopened for correction.",
    nl: "Alleen een afgesloten sessie kan heropend worden voor correctie.",
  },
  "Ce match de club est réglé : sa mise a déjà changé de caisse. Annulez le défi pour rendre les mises, puis rejouez-le.":
    {
      en: "This club match is settled: its stake has already changed treasuries. Cancel the challenge to return the stakes, then replay it.",
      nl: "Deze clubwedstrijd is afgerekend: de inzet is al van kas gewisseld. Annuleer de uitdaging om de inzetten terug te geven en speel ze daarna opnieuw.",
    },
  "Un match saisi n'appartient pas à cette session.": {
    en: "A match entered does not belong to this session.",
    nl: "Een ingevulde wedstrijd hoort niet bij deze sessie.",
  },
  "Seule une session UNO League enchaîne plusieurs matchs.": {
    en: "Only a UNO League session has several matches in a row.",
    nl: "Alleen een UNO League-sessie heeft meerdere wedstrijden na elkaar.",
  },
  "Une équipe ne peut pas se rencontrer elle-même.": {
    en: "A team cannot play against itself.",
    nl: "Een ploeg kan niet tegen zichzelf spelen.",
  },
  "Une équipe désignée n'appartient pas à cette session.": {
    en: "A selected team does not belong to this session.",
    nl: "Een gekozen ploeg hoort niet bij deze sessie.",
  },
  "Ce match est validé : ses statistiques et récompenses sont déjà acquises.": {
    en: "This match is validated: its statistics and rewards are already granted.",
    nl: "Deze wedstrijd is gevalideerd: de statistieken en beloningen zijn al toegekend.",
  },
  "Les effectifs d'un match de club sont ceux des deux clubs : ils ne se réorganisent pas.":
    {
      en: "The squads in a club match are those of the two clubs: they cannot be rearranged.",
      nl: "De selecties van een clubwedstrijd zijn die van de twee clubs: ze worden niet herschikt.",
    },
  "Cette équipe n'appartient pas à la session.": {
    en: "This team does not belong to the session.",
    nl: "Deze ploeg hoort niet bij de sessie.",
  },
  "Un match est déjà validé : les équipes ne peuvent plus être modifiées.": {
    en: "A match is already validated: the teams can no longer be changed.",
    nl: "Er is al een wedstrijd gevalideerd: de ploegen kunnen niet meer gewijzigd worden.",
  },

  // --- Suppressions -------------------------------------------------------------------
  "Cette session est le match du défi #{defi} entre deux clubs. Annulez le défi — les mises et les places seront rendues — puis supprimez la session.":
    {
      en: "This session is the match of challenge #{defi} between two clubs. Cancel the challenge — stakes and places will be refunded — then delete the session.",
      nl: "Deze sessie is de wedstrijd van uitdaging #{defi} tussen twee clubs. Annuleer de uitdaging — inzetten en plaatsen worden terugbetaald — en verwijder daarna de sessie.",
    },
  "Ce club est déjà dissous.": {
    en: "This club has already been disbanded.",
    nl: "Deze club is al opgeheven.",
  },
  "Ce club est engagé dans « {tournoi} », dont le tableau est tiré. Annulez le tournoi ou attendez sa fin avant de dissoudre.":
    {
      en: "This club is entered in “{tournoi}”, whose draw has been made. Cancel the tournament or wait for it to end before disbanding.",
      nl: "Deze club neemt deel aan “{tournoi}”, waarvan de loting al gebeurd is. Annuleer het toernooi of wacht tot het afgelopen is voor je de club opheft.",
    },
  "La caisse de ce club retient encore {montant} UNO séquestrés. La dissolution est interrompue : signalez cette situation.":
    {
      en: "This club's treasury still holds {montant} UNO in escrow. Disbanding has been stopped: please report this.",
      nl: "De kas van deze club houdt nog {montant} UNO geblokkeerd. De opheffing is onderbroken: meld deze situatie.",
    },

  // --- Clubs : défis ------------------------------------------------------------------
  "Ce défi est introuvable.": {
    en: "This challenge cannot be found.",
    nl: "Deze uitdaging is niet gevonden.",
  },
  "Un défi dure 60 ou 120 minutes.": {
    en: "A challenge lasts 60 or 120 minutes.",
    nl: "Een uitdaging duurt 60 of 120 minuten.",
  },
  "Choisissez 60 ou 120 minutes.": {
    en: "Choose 60 or 120 minutes.",
    nl: "Kies 60 of 120 minuten.",
  },
  "Un club ne se défie pas lui-même.": {
    en: "A club cannot challenge itself.",
    nl: "Een club kan zichzelf niet uitdagen.",
  },
  "Ce club est introuvable.": {
    en: "This club cannot be found.",
    nl: "Deze club is niet gevonden.",
  },
  "Cette salle n'est pas disponible.": {
    en: "This venue is not available.",
    nl: "Deze zaal is niet beschikbaar.",
  },
  "Un défi se fixe à une date à venir.": {
    en: "A challenge must be set for a future date.",
    nl: "Een uitdaging leg je vast op een toekomstige datum.",
  },
  "La négociation est limitée à {limite} contre-offres. Acceptez la mise en vigueur ou refusez le défi.":
    {
      en: "Negotiation is limited to {limite} counter-offers. Accept the current stake or decline the challenge.",
      nl: "De onderhandeling is beperkt tot {limite} tegenbiedingen. Aanvaard de huidige inzet of weiger de uitdaging.",
    },
  "Une contre-offre monte la mise : au moins {minimum} UNO.": {
    en: "A counter-offer raises the stake: at least {minimum} UNO.",
    nl: "Een tegenbod verhoogt de inzet: minstens {minimum} UNO.",
  },
  "Au moins {minimum} UNO.": {
    en: "At least {minimum} UNO.",
    nl: "Minstens {minimum} UNO.",
  },
  "Ce défi n'est plus en négociation.": {
    en: "This challenge is no longer being negotiated.",
    nl: "Over deze uitdaging wordt niet meer onderhandeld.",
  },
  "Ce défi a expiré : les deux clubs doivent en relancer un.": {
    en: "This challenge has expired: the two clubs must start a new one.",
    nl: "Deze uitdaging is verlopen: de twee clubs moeten een nieuwe lanceren.",
  },
  "Seul un défi accepté peut être réglé.": {
    en: "Only an accepted challenge can be settled.",
    nl: "Alleen een aanvaarde uitdaging kan afgerekend worden.",
  },
  "Le vainqueur désigné ne participe pas à ce défi.": {
    en: "The selected winner is not part of this challenge.",
    nl: "De aangeduide winnaar neemt niet deel aan deze uitdaging.",
  },
  "Seul un défi accepté peut être annulé.": {
    en: "Only an accepted challenge can be cancelled.",
    nl: "Alleen een aanvaarde uitdaging kan geannuleerd worden.",
  },
  "Ce défi n'est plus en cours.": {
    en: "This challenge is no longer ongoing.",
    nl: "Deze uitdaging is niet meer lopende.",
  },

  // --- Clubs : composition --------------------------------------------------------
  "Cette formation n'existe pas à cinq joueurs.": {
    en: "This formation does not exist with five players.",
    nl: "Deze opstelling bestaat niet met vijf spelers.",
  },
  "Formation inconnue": {
    en: "Unknown formation",
    nl: "Onbekende opstelling",
  },
  "Un emplacement ne peut recevoir qu'un joueur.": {
    en: "A spot can only take one player.",
    nl: "Op een positie past maar één speler.",
  },
  "Un joueur ne peut occuper qu'un emplacement.": {
    en: "A player can only take one spot.",
    nl: "Een speler kan maar één positie innemen.",
  },
  "Cet emplacement n'existe pas dans cette formation.": {
    en: "This spot does not exist in this formation.",
    nl: "Deze positie bestaat niet in deze opstelling.",
  },
  "Place inconnue pour cette formation": {
    en: "Unknown spot for this formation",
    nl: "Onbekende positie voor deze opstelling",
  },
  "Un joueur aligné ne fait pas partie de l'effectif.": {
    en: "A player in the line-up is not in the squad.",
    nl: "Een opgestelde speler hoort niet bij de selectie.",
  },
  "Seul un défi accepté donne lieu à un match.": {
    en: "Only an accepted challenge leads to a match.",
    nl: "Alleen een aanvaarde uitdaging leidt tot een wedstrijd.",
  },
  "Le match de ce défi existe déjà.": {
    en: "The match for this challenge already exists.",
    nl: "De wedstrijd van deze uitdaging bestaat al.",
  },
  "{club} n'a pas ses {taille} joueurs : {inscrits} inscrit(s).": {
    en: "{club} does not have its {taille} players: {inscrits} signed up.",
    nl: "{club} heeft zijn {taille} spelers niet: {inscrits} ingeschreven.",
  },
  "{club} a {impayes} place(s) non réglée(s).": {
    en: "{club} has {impayes} unpaid place(s).",
    nl: "{club} heeft {impayes} onbetaalde plaats(en).",
  },
  "Cette salle n'est plus disponible.": {
    en: "This venue is no longer available.",
    nl: "Deze zaal is niet meer beschikbaar.",
  },
  "Le résultat du match doit être saisi et validé avant la clôture.": {
    en: "The match result must be entered and validated before closing.",
    nl: "De uitslag moet ingevuld en gevalideerd zijn vóór het afsluiten.",
  },
  "La composition s'ouvre une fois le défi accepté.": {
    en: "The line-up opens once the challenge is accepted.",
    nl: "De samenstelling gaat open zodra de uitdaging aanvaard is.",
  },
  "Ce défi est clos : sa composition n'est plus modifiable.": {
    en: "This challenge is closed: its line-up can no longer be changed.",
    nl: "Deze uitdaging is afgesloten: de samenstelling kan niet meer gewijzigd worden.",
  },
  "Le match est créé : la composition est figée.": {
    en: "The match has been created: the line-up is locked.",
    nl: "De wedstrijd is aangemaakt: de samenstelling ligt vast.",
  },
  "Ce club n'est pas partie à ce défi.": {
    en: "This club is not part of this challenge.",
    nl: "Deze club maakt geen deel uit van deze uitdaging.",
  },
  "Vous n'appartenez à aucun club.": {
    en: "You do not belong to any club.",
    nl: "Je hoort bij geen enkele club.",
  },
  "Ce joueur n'est pas membre actif de votre club.": {
    en: "This player is not an active member of your club.",
    nl: "Deze speler is geen actief lid van je club.",
  },
  "La feuille est complète : {taille} joueurs par équipe.": {
    en: "The sheet is full: {taille} players per team.",
    nl: "Het blad is vol: {taille} spelers per ploeg.",
  },
  "Ce joueur figure déjà sur la feuille de ce défi.": {
    en: "This player is already on the sheet for this challenge.",
    nl: "Deze speler staat al op het blad van deze uitdaging.",
  },
  "Votre club n'a pas encore de cinq type : composez-le depuis l'effectif.": {
    en: "Your club has no Best Five yet: build it from the squad.",
    nl: "Je club heeft nog geen Beste Vijf: stel ze samen vanuit de selectie.",
  },
  "La feuille est déjà complète.": {
    en: "The sheet is already full.",
    nl: "Het blad is al vol.",
  },
  "Le cinq type est déjà sur la feuille.": {
    en: "The Best Five is already on the sheet.",
    nl: "De Beste Vijf staat al op het blad.",
  },
  "Ce joueur n'est pas sur la feuille.": {
    en: "This player is not on the sheet.",
    nl: "Deze speler staat niet op het blad.",
  },
  "Vous ne figurez pas sur la feuille de ce défi.": {
    en: "You are not on the sheet for this challenge.",
    nl: "Je staat niet op het blad van deze uitdaging.",
  },
  "Un des joueurs désignés n'est pas sur la feuille.": {
    en: "One of the selected players is not on the sheet.",
    nl: "Een van de aangeduide spelers staat niet op het blad.",
  },

  // --- Clubs : messages ---------------------------------------------------------------
  "Le chat d'un club est réservé à ses membres.": {
    en: "A club's chat is for its members only.",
    nl: "De chat van een club is voorbehouden aan de leden.",
  },
  "Ce fil est réservé aux membres des deux clubs concernés.": {
    en: "This thread is for members of the two clubs involved only.",
    nl: "Deze draad is voorbehouden aan de leden van de twee betrokken clubs.",
  },
  "Ce défi est tranché : son fil reste lisible, mais ne reçoit plus de message.":
    {
      en: "This challenge is decided: its thread stays readable but takes no more messages.",
      nl: "Deze uitdaging is beslecht: de draad blijft leesbaar, maar krijgt geen berichten meer.",
    },
  "Le message est vide.": {
    en: "The message is empty.",
    nl: "Het bericht is leeg.",
  },

  // --- Clubs : transferts ---------------------------------------------------------------
  "Ce dossier est introuvable.": {
    en: "This deal cannot be found.",
    nl: "Dit dossier is niet gevonden.",
  },
  "Ce joueur est inscrit sur la feuille d'un défi à venir. Retirez-le de la composition avant de le transférer.":
    {
      en: "This player is on the sheet for an upcoming challenge. Take them out of the line-up before transferring them.",
      nl: "Deze speler staat op het blad van een komende uitdaging. Haal hem uit de samenstelling voor je hem transfereert.",
    },
  "Ce joueur n'appartient à aucun club : il peut demander à rejoindre le vôtre.":
    {
      en: "This player is not in any club: they can ask to join yours.",
      nl: "Deze speler hoort bij geen enkele club: hij kan vragen om bij de jouwe te komen.",
    },
  "Un fondateur ne peut pas être transféré : il doit d'abord transmettre son club.":
    {
      en: "A founder cannot be transferred: they must hand over their club first.",
      nl: "Een stichter kan niet getransfereerd worden: hij moet eerst zijn club overdragen.",
    },
  "Ce joueur vient d'être transféré : il reste {jours} jour(s) de carence.": {
    en: "This player has just been transferred: {jours} day(s) of waiting period left.",
    nl: "Deze speler is net getransfereerd: er blijft nog {jours} dag(en) wachttijd.",
  },
  "Ce joueur n'appartient à aucun club.": {
    en: "This player is not in any club.",
    nl: "Deze speler hoort bij geen enkele club.",
  },
  "Un fondateur ne se met pas sur la liste des transferts.": {
    en: "A founder cannot be put on the transfer list.",
    nl: "Een stichter komt niet op de transferlijst.",
  },
  "Ce joueur est déjà chez vous.": {
    en: "This player is already in your club.",
    nl: "Deze speler zit al bij jou.",
  },
  "Votre caisse ne couvre pas cette offre : {montant} UNO nécessaires.": {
    en: "Your treasury does not cover this offer: {montant} UNO needed.",
    nl: "Je kas dekt dit bod niet: {montant} UNO nodig.",
  },
  "L'offre est entre les mains du joueur : elle ne se négocie plus.": {
    en: "The offer is in the player's hands: it can no longer be negotiated.",
    nl: "Het bod ligt bij de speler: er wordt niet meer over onderhandeld.",
  },
  "Ce dossier est clos.": {
    en: "This deal is closed.",
    nl: "Dit dossier is afgesloten.",
  },
  "Le marchandage a assez duré : acceptez ou refusez.": {
    en: "The haggling has gone on long enough: accept or decline.",
    nl: "Er is lang genoeg gemarchandeerd: aanvaard of weiger.",
  },
  "Une contre-offre monte l'indemnité : au moins {minimum} UNO.": {
    en: "A counter-offer raises the fee: at least {minimum} UNO.",
    nl: "Een tegenbod verhoogt de vergoeding: minstens {minimum} UNO.",
  },
  "Ce joueur n'est plus dans votre club.": {
    en: "This player is no longer in your club.",
    nl: "Deze speler zit niet meer in je club.",
  },
  "Une autre offre est déjà entre les mains de ce joueur.": {
    en: "Another offer is already in this player's hands.",
    nl: "Er ligt al een ander bod bij deze speler.",
  },
  "Ce dossier n'attend pas votre décision.": {
    en: "This deal is not waiting for your decision.",
    nl: "Dit dossier wacht niet op jouw beslissing.",
  },
  "Seul le joueur concerné peut trancher.": {
    en: "Only the player concerned can decide.",
    nl: "Alleen de betrokken speler kan beslissen.",
  },
  "Vous n'êtes plus dans le club qui vous cédait.": {
    en: "You are no longer in the club that was releasing you.",
    nl: "Je zit niet meer in de club die je liet gaan.",
  },

  // --- Clubs : trésorerie et membres ---------------------------------------------------
  "La trésorerie du club ne couvre pas cette opération.": {
    en: "The club's treasury does not cover this operation.",
    nl: "De clubkas dekt deze verrichting niet.",
  },
  "Montant engagé incohérent.": {
    en: "Inconsistent committed amount.",
    nl: "Onsamenhangend vastgelegd bedrag.",
  },
  "Vous n'êtes pas membre de ce club.": {
    en: "You are not a member of this club.",
    nl: "Je bent geen lid van deze club.",
  },
  "Ce club est dissous.": {
    en: "This club has been disbanded.",
    nl: "Deze club is opgeheven.",
  },
  "Ce joueur n'est pas membre de votre club.": {
    en: "This player is not a member of your club.",
    nl: "Deze speler is geen lid van je club.",
  },
  "Le registre d'un club est réservé à ses membres.": {
    en: "A club's ledger is for its members only.",
    nl: "Het register van een club is voorbehouden aan de leden.",
  },
  "Seul le fondateur peut effectuer cette action.": {
    en: "Only the founder can do this.",
    nl: "Alleen de stichter kan dit doen.",
  },
  "Cette action est réservée au fondateur et aux capitaines.": {
    en: "This action is reserved for the founder and captains.",
    nl: "Deze actie is voorbehouden aan de stichter en de kapiteins.",
  },
  "Vous appartenez déjà à un club. Quittez-le avant d'en fonder un autre.": {
    en: "You already belong to a club. Leave it before founding another.",
    nl: "Je hoort al bij een club. Verlaat die voor je een andere opricht.",
  },
  "Ce nom de club est déjà pris.": {
    en: "This club name is already taken.",
    nl: "Deze clubnaam is al in gebruik.",
  },
  "Ce club ne recrute plus.": {
    en: "This club is no longer recruiting.",
    nl: "Deze club rekruteert niet meer.",
  },
  "Vous êtes déjà membre de ce club.": {
    en: "You are already a member of this club.",
    nl: "Je bent al lid van deze club.",
  },
  "Vous appartenez déjà à un club. Quittez-le avant d'en rejoindre un autre.": {
    en: "You already belong to a club. Leave it before joining another.",
    nl: "Je hoort al bij een club. Verlaat die voor je bij een andere gaat.",
  },
  "Votre demande est déjà en attente auprès de ce club.": {
    en: "Your request is already pending with this club.",
    nl: "Je aanvraag bij deze club is al in behandeling.",
  },
  "Cette demande est introuvable.": {
    en: "This request cannot be found.",
    nl: "Deze aanvraag is niet gevonden.",
  },
  "Cette demande a déjà été traitée.": {
    en: "This request has already been handled.",
    nl: "Deze aanvraag is al behandeld.",
  },
  "Ce joueur a rejoint un autre club entre-temps.": {
    en: "This player has joined another club in the meantime.",
    nl: "Deze speler is intussen bij een andere club gegaan.",
  },
  "Ce joueur n'est pas membre de ce club.": {
    en: "This player is not a member of this club.",
    nl: "Deze speler is geen lid van deze club.",
  },
  "Le rôle de fondateur se transmet, il ne se retire pas.": {
    en: "The founder role is handed over, not removed.",
    nl: "De rol van stichter draag je over, die neem je niet af.",
  },
  "Transmettez d'abord le club à un autre membre : un club sans fondateur ne peut plus être administré.":
    {
      en: "Hand the club over to another member first: a club without a founder can no longer be managed.",
      nl: "Draag de club eerst over aan een ander lid: een club zonder stichter kan niet meer beheerd worden.",
    },
  "Pour partir vous-même, utilisez « Quitter le club ».": {
    en: "To leave yourself, use “Leave the club”.",
    nl: "Om zelf te vertrekken, gebruik je “De club verlaten”.",
  },
  "Le fondateur ne peut pas être exclu.": {
    en: "The founder cannot be removed.",
    nl: "De stichter kan niet uitgesloten worden.",
  },
  "Seul le fondateur peut exclure un capitaine.": {
    en: "Only the founder can remove a captain.",
    nl: "Alleen de stichter kan een kapitein uitsluiten.",
  },
  "Vous êtes déjà fondateur.": {
    en: "You are already the founder.",
    nl: "Je bent al stichter.",
  },

  // --- Vidéos ------------------------------------------------------------------------
  "Les vidéos d'une session sont réservées à ceux qui y ont joué.": {
    en: "A session's videos are for those who played in it.",
    nl: "De video's van een sessie zijn voorbehouden aan wie meegespeeld heeft.",
  },
  "Cette adresse n'est pas exploitable. Collez le lien complet de la vidéo.": {
    en: "This address cannot be used. Paste the video's full link.",
    nl: "Dit adres is niet bruikbaar. Plak de volledige link van de video.",
  },
  "Une session ne peut pas porter plus de {limite} vidéos.": {
    en: "A session cannot have more than {limite} videos.",
    nl: "Een sessie kan niet meer dan {limite} video's hebben.",
  },
  "Cette vidéo n'existe plus.": {
    en: "This video no longer exists.",
    nl: "Deze video bestaat niet meer.",
  },

  // --- Tournois --------------------------------------------------------------------------
  "Cet engagement est introuvable.": {
    en: "This entry cannot be found.",
    nl: "Deze inschrijving is niet gevonden.",
  },
  "Ce tournoi est introuvable.": {
    en: "This tournament cannot be found.",
    nl: "Dit toernooi is niet gevonden.",
  },
  "Ce tournoi est terminé : sa feuille n'est plus modifiable.": {
    en: "This tournament is over: its sheet can no longer be changed.",
    nl: "Dit toernooi is voorbij: het blad kan niet meer gewijzigd worden.",
  },
  "Ce tournoi est annulé.": {
    en: "This tournament has been cancelled.",
    nl: "Dit toernooi is geannuleerd.",
  },
  "Un tournoi doit être créé au moins {jours} jours à l'avance.": {
    en: "A tournament must be created at least {jours} days ahead.",
    nl: "Een toernooi moet minstens {jours} dagen op voorhand aangemaakt worden.",
  },
  "Un tournoi terminé ne s'annule pas : corrigez ses résultats.": {
    en: "A finished tournament cannot be cancelled: correct its results.",
    nl: "Een afgelopen toernooi annuleer je niet: verbeter de uitslagen.",
  },
  "Ce format est introuvable.": {
    en: "This format cannot be found.",
    nl: "Dit formaat is niet gevonden.",
  },
  "Ce format n'accueille plus de nouveaux tournois.": {
    en: "This format no longer takes new tournaments.",
    nl: "Dit formaat neemt geen nieuwe toernooien meer aan.",
  },
  "Un tournoi doit être proposé au moins {jours} jours à l'avance.": {
    en: "A tournament must be proposed at least {jours} days ahead.",
    nl: "Een toernooi moet minstens {jours} dagen op voorhand voorgesteld worden.",
  },
  "Le tableau de ce tournoi est déjà tiré.": {
    en: "The draw for this tournament has already been made.",
    nl: "De loting van dit toernooi is al gebeurd.",
  },
  "Ce tournoi n'accueille plus d'inscriptions.": {
    en: "This tournament no longer takes entries.",
    nl: "Dit toernooi neemt geen inschrijvingen meer aan.",
  },
  "Le plateau de ce tournoi est complet.": {
    en: "This tournament is full.",
    nl: "Dit toernooi is volzet.",
  },
  "Un club dissous ne s'engage pas en tournoi.": {
    en: "A disbanded club cannot enter a tournament.",
    nl: "Een opgeheven club kan niet deelnemen aan een toernooi.",
  },
  "Ce club est déjà engagé dans ce tournoi.": {
    en: "This club is already entered in this tournament.",
    nl: "Deze club is al ingeschreven voor dit toernooi.",
  },
  "Cet engagement a déjà été enregistré.": {
    en: "This entry has already been recorded.",
    nl: "Deze inschrijving is al geregistreerd.",
  },
  "Le tableau est tiré : le retrait passe désormais par l'administration.": {
    en: "The draw has been made: withdrawing now goes through the admins.",
    nl: "De loting is gebeurd: terugtrekken gaat nu via het beheer.",
  },
  "Ce club n'est pas engagé.": {
    en: "This club is not entered.",
    nl: "Deze club is niet ingeschreven.",
  },
  "Le plateau n'est pas complet : {inscrits} club(s) sur {taille}.": {
    en: "The tournament is not full: {inscrits} club(s) out of {taille}.",
    nl: "Het toernooi is niet volzet: {inscrits} club(s) op {taille}.",
  },
  "Cette affiche est introuvable.": {
    en: "This fixture cannot be found.",
    nl: "Deze affiche is niet gevonden.",
  },
  "Ce tournoi est terminé.": {
    en: "This tournament is over.",
    nl: "Dit toernooi is voorbij.",
  },
  "Le tableau de ce tournoi n'est pas tiré.": {
    en: "The draw for this tournament has not been made.",
    nl: "De loting van dit toernooi is nog niet gebeurd.",
  },
  "Cette affiche attend encore ses qualifiés.": {
    en: "This fixture is still waiting for its qualifiers.",
    nl: "Deze affiche wacht nog op haar gekwalificeerden.",
  },
  "Le vainqueur doit être l'un des deux clubs de l'affiche.": {
    en: "The winner must be one of the fixture's two clubs.",
    nl: "De winnaar moet een van de twee clubs van de affiche zijn.",
  },
  "Le vainqueur désigné ne correspond pas au score saisi.": {
    en: "The selected winner does not match the score entered.",
    nl: "De aangeduide winnaar komt niet overeen met de ingevulde score.",
  },
  "Le tour suivant est déjà joué ({tour}) : corrigez-le d'abord.": {
    en: "The next round has already been played ({tour}): correct it first.",
    nl: "De volgende ronde is al gespeeld ({tour}): verbeter die eerst.",
  },
  "Le vainqueur n'est pas un club engagé.": {
    en: "The winner is not an entered club.",
    nl: "De winnaar is geen ingeschreven club.",
  },
  "Rejoignez un club pour participer à un tournoi.": {
    en: "Join a club to take part in a tournament.",
    nl: "Sluit je aan bij een club om aan een toernooi deel te nemen.",
  },

  // --- Saisie vidéo ---------------------------------------------------------------------
  "Cette feuille de saisie est introuvable.": {
    en: "This entry sheet cannot be found.",
    nl: "Dit invulblad is niet gevonden.",
  },
  "Cette feuille est publiée : ses statistiques sont déjà comptabilisées.": {
    en: "This sheet is published: its statistics have already been counted.",
    nl: "Dit blad is gepubliceerd: de statistieken zijn al verwerkt.",
  },
  "Vous figurez sur cette feuille : sa saisie revient à un autre superviseur.":
    {
      en: "You are on this sheet: another supervisor must enter it.",
      nl: "Je staat op dit blad: een andere supervisor moet het invullen.",
    },
  "Cette session réservée est introuvable.": {
    en: "This booked session cannot be found.",
    nl: "Deze gereserveerde sessie is niet gevonden.",
  },
  "Cette équipe n'appartient pas à la feuille.": {
    en: "This team is not on the sheet.",
    nl: "Deze ploeg staat niet op het blad.",
  },
  "Ce joueur figure déjà sur la feuille de cette session.": {
    en: "This player is already on this session's sheet.",
    nl: "Deze speler staat al op het blad van deze sessie.",
  },
  "Des actions sont attribuées à ce joueur : supprimez-les d'abord.": {
    en: "Actions are credited to this player: delete them first.",
    nl: "Er zijn acties aan deze speler toegekend: verwijder die eerst.",
  },
  "Ce joueur figure déjà sur la feuille : fusionnez les lignes à la main.": {
    en: "This player is already on the sheet: merge the rows by hand.",
    nl: "Deze speler staat al op het blad: voeg de regels met de hand samen.",
  },
  "Le tirage des équipes n'est plus possible : des actions ont déjà été saisies.":
    {
      en: "Drawing the teams is no longer possible: actions have already been entered.",
      nl: "De ploegen loten kan niet meer: er zijn al acties ingevuld.",
    },
  "Reprendre une composition n'est plus possible : des actions ont déjà été saisies.":
    {
      en: "Reusing a line-up is no longer possible: actions have already been entered.",
      nl: "Een samenstelling overnemen kan niet meer: er zijn al acties ingevuld.",
    },
  "Cette feuille source n'a aucune équipe.": {
    en: "This source sheet has no teams.",
    nl: "Dit bronblad heeft geen ploegen.",
  },
  "Une feuille ne peut pas porter plus de {limite} enregistrements.": {
    en: "A sheet cannot have more than {limite} recordings.",
    nl: "Een blad kan niet meer dan {limite} opnames hebben.",
  },
  "YouTube et Vimeo ne peuvent pas être pilotés image par image. Utilisez un lien direct vers le fichier vidéo, ou ouvrez le fichier depuis votre disque.":
    {
      en: "YouTube and Vimeo cannot be stepped frame by frame. Use a direct link to the video file, or open the file from your disk.",
      nl: "YouTube en Vimeo kun je niet beeld per beeld afspelen. Gebruik een rechtstreekse link naar het videobestand, of open het bestand vanaf je schijf.",
    },
  "Ce match porte des actions saisies : supprimez-les d'abord.": {
    en: "This match has actions entered: delete them first.",
    nl: "Deze wedstrijd heeft ingevulde acties: verwijder die eerst.",
  },
  "Une action désigne un match qui n'appartient pas à cette feuille.": {
    en: "An action refers to a match that is not on this sheet.",
    nl: "Een actie verwijst naar een wedstrijd die niet op dit blad staat.",
  },
  "Une action désigne un joueur absent de la feuille.": {
    en: "An action refers to a player who is not on the sheet.",
    nl: "Een actie verwijst naar een speler die niet op het blad staat.",
  },
  "Une passe décisive désigne un joueur absent de la feuille.": {
    en: "An assist refers to a player who is not on the sheet.",
    nl: "Een assist verwijst naar een speler die niet op het blad staat.",
  },
  "Une action désigne une équipe qui ne dispute pas ce match.": {
    en: "An action refers to a team not playing this match.",
    nl: "Een actie verwijst naar een ploeg die deze wedstrijd niet speelt.",
  },
  "Seul un but peut porter une passe décisive.": {
    en: "Only a goal can have an assist.",
    nl: "Alleen een doelpunt kan een assist hebben.",
  },
  "Un joueur ne peut pas se donner la passe décisive.": {
    en: "A player cannot assist themselves.",
    nl: "Een speler kan zichzelf geen assist geven.",
  },
  "Cette feuille est déjà publiée.": {
    en: "This sheet is already published.",
    nl: "Dit blad is al gepubliceerd.",
  },
  "Vous figurez sur cette feuille : sa publication revient à un autre superviseur.":
    {
      en: "You are on this sheet: another supervisor must publish it.",
      nl: "Je staat op dit blad: een andere supervisor moet het publiceren.",
    },
  "La session réservée rattachée à cette feuille n'existe plus.": {
    en: "The booked session linked to this sheet no longer exists.",
    nl: "De gereserveerde sessie die aan dit blad gekoppeld is, bestaat niet meer.",
  },
  "La session rattachée n'est pas dans l'état « confirmée » : elle ne peut pas recevoir de feuille.":
    {
      en: "The linked session is not “confirmed”: it cannot take a sheet.",
      nl: "De gekoppelde sessie is niet “bevestigd”: ze kan geen blad krijgen.",
    },
  "Cette session a déjà des matchs validés : sa feuille est close.": {
    en: "This session already has validated matches: its sheet is closed.",
    nl: "Deze sessie heeft al gevalideerde wedstrijden: het blad is afgesloten.",
  },
  "Score relevé {releveA}–{releveB}, buts saisis {saisiA}–{saisiB} : il manque un buteur, ou un but a été compté deux fois.":
    {
      en: "Score noted {releveA}–{releveB}, goals entered {saisiA}–{saisiB}: a scorer is missing, or a goal was counted twice.",
      nl: "Genoteerde score {releveA}–{releveB}, ingevulde doelpunten {saisiA}–{saisiB}: er ontbreekt een doelpuntenmaker, of een doelpunt is dubbel geteld.",
    },
  "Match terminé sans aucune action saisie.": {
    en: "Match finished without any action entered.",
    nl: "Wedstrijd afgelopen zonder enige ingevulde actie.",
  },
  "Aucun gardien désigné pour une équipe qui a encaissé : {buts} but(s) encaissé(s) ne seront attribués à personne.":
    {
      en: "No goalkeeper selected for a team that conceded: {buts} goal(s) conceded will be credited to nobody.",
      nl: "Geen doelman aangeduid voor een ploeg die tegendoelpunten kreeg: {buts} tegendoelpunt(en) worden aan niemand toegekend.",
    },
  "Aucun match terminé : il n'y a rien à publier.": {
    en: "No finished match: there is nothing to publish.",
    nl: "Geen afgelopen wedstrijd: er valt niets te publiceren.",
  },
  "Rattachez l'invité à un compte : {noms}. Sans compte, ses points n'iraient nulle part.":
    {
      en: "Link the guest to an account: {noms}. Without an account, their points would go nowhere.",
      nl: "Koppel de gast aan een account: {noms}. Zonder account gaan zijn punten nergens heen.",
    },
  "Rattachez les invités à un compte : {noms}. Sans compte, leurs points n'iraient nulle part.":
    {
      en: "Link the guests to an account: {noms}. Without an account, their points would go nowhere.",
      nl: "Koppel de gasten aan een account: {noms}. Zonder account gaan hun punten nergens heen.",
    },
  "Choisissez la division de la session : elle commande le barème des récompenses et les montées comme les descentes.":
    {
      en: "Choose the session's division: it sets the reward scale as well as promotions and relegations.",
      nl: "Kies de divisie van de sessie: die bepaalt de beloningsschaal en de promoties en degradaties.",
    },

  // --- Salles --------------------------------------------------------------------------
  "Une salle porte déjà ce nom.": {
    en: "A venue already has this name.",
    nl: "Er bestaat al een zaal met deze naam.",
  },
  "Cette salle est introuvable.": {
    en: "This venue cannot be found.",
    nl: "Deze zaal is niet gevonden.",
  },
  "Cette salle n'accueille plus de nouvelles sessions.": {
    en: "This venue no longer takes new sessions.",
    nl: "Deze zaal neemt geen nieuwe sessies meer aan.",
  },

  // --- Images --------------------------------------------------------------------------
  "Fichier vide.": {
    en: "Empty file.",
    nl: "Leeg bestand.",
  },
  "L'image ne doit pas dépasser {taille} Mo.": {
    en: "The image must not exceed {taille} MB.",
    nl: "De afbeelding mag niet groter zijn dan {taille} MB.",
  },
  "Format non supporté. Utilisez une image JPEG, PNG ou WebP.": {
    en: "Format not supported. Use a JPEG, PNG or WebP image.",
    nl: "Formaat niet ondersteund. Gebruik een JPEG-, PNG- of WebP-afbeelding.",
  },
  "URL d'image trop longue.": {
    en: "Image URL too long.",
    nl: "Afbeeldings-URL te lang.",
  },
  "Le téléversement a échoué.": {
    en: "The upload failed.",
    nl: "Het uploaden is mislukt.",
  },
  "URL d'image invalide.": {
    en: "Invalid image URL.",
    nl: "Ongeldige afbeeldings-URL.",
  },
};

/**
 * Les libellés cités dans les messages, dans chaque langue.
 *
 * Minuscules en anglais comme en néerlandais pour les statuts : ils viennent
 * au milieu d'une phrase (« This order is delivered »).
 */
export const LIBELLES_ERREURS: Record<
  LangueTraduite,
  Record<ErrorLabelFamily, Record<string, string>>
> = {
  en: {
    orderStatus: {
      pending: "pending",
      paid: "paid",
      fulfilled: "delivered",
      cancelled: "cancelled",
      refunded: "refunded",
    },
    tournamentRound: {
      of32: "round of 32",
      of16: "round of 16",
      quarter: "quarter-finals",
      semi: "semi-finals",
      final: "final",
    },
    team: { "0": "Team A", "1": "Team B", "2": "Team C", "3": "Team D" },
  },
  nl: {
    orderStatus: {
      pending: "in afwachting",
      paid: "betaald",
      fulfilled: "geleverd",
      cancelled: "geannuleerd",
      refunded: "terugbetaald",
    },
    tournamentRound: {
      of32: "zestiende finales",
      of16: "achtste finales",
      quarter: "kwartfinales",
      semi: "halve finales",
      final: "finale",
    },
    team: { "0": "Ploeg A", "1": "Ploeg B", "2": "Ploeg C", "3": "Ploeg D" },
  },
};
