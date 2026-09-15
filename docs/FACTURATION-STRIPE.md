# Facturation récurrente — conception

Ce document décrit **une intégration qui n'existe pas encore**. Il fixe le
modèle avant d'écrire le code, parce que les erreurs de facturation
récurrente se paient en argent réel et en confiance : un abonnement qu'on
croit annulé et qui continue de prélever, une place ouverte à qui n'a pas
payé, un remboursement introuvable.

L'état actuel, lui, est entièrement décrit ailleurs : le paiement **à l'unité**
d'une participation (CAL-009, CAL-010) est en place et fonctionne. Rien de ce
qui suit ne le remplace.

---

## 1. Ce qu'on facture, et à qui

**Le point n'est pas tranché**, et c'est la première décision à prendre. Deux
modèles se défendent, et ils ne demandent pas le même code.

### a) Abonnement joueur — le modèle par défaut

Le joueur paie une cotisation mensuelle ou annuelle. En échange, au choix de
la ligue : un crédit de points UNO versé à chaque période, un tarif de session
réduit, ou l'accès aux sessions classées.

C'est le modèle recommandé pour commencer. Il se greffe sur ce qui existe —
un joueur, un compte, un portefeuille de points — sans toucher aux SQUAD, et
il rend le revenu prévisible là où le paiement à la session ne l'est pas.

**Le crédit de points est la contrepartie la plus simple à tenir** : elle
réutilise `ledger.service.ts` et son idempotence, au lieu d'inventer une
notion d'accès à vérifier à chaque route.

### b) Abonnement SQUAD

L'équipe paie, et la trésorerie existante (`squad-treasury.service.ts`)
encaisse. Plus proche du fonctionnement réel d'un club, mais nettement plus
lourd : il faut désigner qui paie pour l'équipe, décider ce qu'il advient de
l'abonnement quand ce joueur part, et gérer un moyen de paiement qui engage
d'autres personnes que son porteur.

**À ne pas retenir en premier.** Le modèle (a) peut évoluer vers (b) ; la
réciproque est fausse.

> La suite du document décrit le modèle **(a)**. Le passage à (b) changerait
> la clé étrangère (`squad_id` au lieu de `player_id`) et l'endroit où le
> crédit atterrit, pas la mécanique Stripe.

---

## 2. Ce qu'on n'écrit pas soi-même

La tentation, avec une base de données sous la main, est de modéliser les
échéances et de relancer les impayés à coups de tâches planifiées. **Il ne
faut pas.** Stripe Billing gère le renouvellement, les relances (*dunning*),
les tentatives échelonnées après un échec de carte, la proratisation lors d'un
changement de formule et les périodes d'essai. Réécrire cela, c'est réécrire
un moteur de facturation — et en hériter les bugs.

Concrètement :

- **Pas** de `PaymentIntent` renouvelé à la main, pas de cron de prélèvement ;
- le catalogue vit chez Stripe (`Product` + `Price`), pas dans une table ;
- notre base ne garde qu'un **reflet** de l'état Stripe, jamais la vérité.

C'est le point le plus important de ce document. Tout le reste en découle.

---

## 3. Catalogue

**Un `Product` par formule**, un `Price` par variante de facturation de cette
formule :

```
Product « Abonnement Joueur »      → Price mensuel  (eur, recurring: month)
                                   → Price annuel   (eur, recurring: year)
Product « Abonnement Joueur Plus » → Price mensuel
                                   → Price annuel
```

**Ne pas empiler les formules sur un seul produit.** Les sessions Checkout et
les factures affichent le nom du *produit* sur chaque ligne : deux formules
partageant un produit produisent deux lignes identiques à l'écran, et le
joueur ne sait plus ce qu'il paie. Mensuel et annuel, eux, sont bien deux
variantes d'une même formule : même produit, deux prix.

L'objet `plan`, qu'on croise encore dans d'anciens exemples, est **obsolète** :
c'est `Price` qu'on utilise.

Les identifiants de prix (`price_…`) ne sont pas des secrets, mais ils
diffèrent entre le bac à sable et la production : ils vont en variables
d'environnement, pas en dur dans le code.

---

## 4. Parcours de souscription

Même principe qu'à l'unité : **l'application ne voit jamais un moyen de
paiement**, et ne conclut jamais elle-même.

1. Le joueur choisit une formule dans l'application.
2. Le serveur crée — ou retrouve — le `Customer` Stripe du joueur, puis ouvre
   une session Checkout en `mode: "subscription"`.
3. Le joueur paie sur la page Stripe.
4. **Le webhook, et lui seul, ouvre les droits.**

```ts
const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer: stripeCustomerId,
  // Pas de payment_method_types : voir §7.
  line_items: [{ price: priceId, quantity: 1 }],
  client_reference_id: reference,
  success_url: `${returnUrl}&abonnement=succes`,
  cancel_url: `${returnUrl}&abonnement=annule`,
});
```

Le `Customer` doit être **créé une fois et réutilisé**. En créer un à chaque
souscription éparpille l'historique du joueur sur plusieurs fiches Stripe :
les remboursements, les relances et le portail ne retrouvent plus rien.

### Gérer son abonnement : le portail Stripe

Changer de formule, mettre à jour sa carte, résilier, télécharger ses
factures : tout cela passe par le **portail client** Stripe, une page hébergée
qu'on ouvre depuis l'application.

Le construire nous-mêmes demanderait de gérer la proratisation, les factures
au format légal et les moyens de paiement — pour un résultat moins fiable.
Une seule chose à coder : un bouton qui appelle
`billingPortal.sessions.create({ customer, return_url })` et redirige.

---

## 5. Modèle de données

Deux tables, et **aussi peu de champs que possible** : chaque colonne recopiée
de Stripe est une colonne qui peut diverger.

```
stripe_customers
  player_id             → players.id, unique
  stripe_customer_id    unique
  created_at

subscriptions
  id
  player_id             → players.id
  stripe_subscription_id  unique
  stripe_price_id         quelle formule, pour l'affichage
  status                  reflet de Stripe (voir plus bas)
  current_period_end      jusqu'à quand les droits sont ouverts
  cancel_at_period_end    résiliation demandée, pas encore effective
  created_at / updated_at
```

`status` reprend les valeurs de Stripe (`trialing`, `active`, `past_due`,
`canceled`, `unpaid`, `incomplete`…) plutôt qu'une traduction maison : le jour
où un état inattendu arrive, on veut le lire tel quel dans la base, pas
découvrir qu'il a été replié sur « actif » par une conversion trop zélée.

**Les droits se déduisent de `status` et `current_period_end`**, jamais d'un
booléen `is_premium` écrit à la main — un booléen se désynchronise en silence.

---

## 6. Webhooks : la partie qui n'est pas optionnelle

À l'unité, le webhook confirme un paiement. En abonnement, **presque tout
l'état arrive par webhook** : le renouvellement, l'échec de carte, la
résiliation et la fin d'essai se produisent des semaines après le passage en
caisse, alors que personne n'a l'application ouverte.

Évènements à souscrire, en plus des quatre évènements `checkout.session.*`
déjà en place :

| Évènement | Effet |
| --- | --- |
| `customer.subscription.created` | Enregistre l'abonnement, ouvre les droits |
| `customer.subscription.updated` | Changement de formule, résiliation programmée, fin d'essai |
| `customer.subscription.deleted` | Ferme les droits |
| `invoice.paid` | Période renouvelée : repousse `current_period_end`, verse le crédit UNO |
| `invoice.payment_failed` | Carte refusée : prévient le joueur, laisse Stripe relancer |

Trois règles héritées de l'existant, et qui valent tout autant ici :

- **la signature est vérifiée avant toute chose** — un webhook non signé ne
  doit jamais pouvoir ouvrir des droits ;
- **le traitement est idempotent** — Stripe rejoue ses évènements, et les
  livre parfois dans le désordre. Un `invoice.paid` appliqué deux fois ne doit
  pas créditer deux fois : la clé d'idempotence du registre
  (`ledger.service.ts`) sert exactement à cela, adossée à l'identifiant de la
  facture ;
- **un évènement hors périmètre répond 200**, jamais 400. C'est déjà le
  comportement de `/webhooks/payments` (voir `WebhookVerification`), et la
  raison devient évidente ici : la liste d'évènements souscrits s'allonge, et
  un 400 répété fait désactiver l'endpoint par Stripe.

### Conséquence sur l'abstraction actuelle

`PaymentAdapter` est taillé pour un paiement à l'unité : `createIntent` +
`verifyWebhook` renvoyant une issue `paid` / `failed` / `pending`. Un
abonnement n'entre pas dans ce moule — il n'a pas d'« issue », il a un cycle
de vie.

Il faudra donc **un second canal**, et non tordre le premier : un
`SubscriptionAdapter`, ou un `verifyWebhook` renvoyant une union discriminée
(`{ kind: "payment" } | { kind: "subscription" }`). L'important est que
l'endpoint reste unique et la vérification de signature unique ; c'est
l'interprétation qui bifurque.

---

## 7. Les moyens de paiement, encore une fois

**Ne pas passer `payment_method_types`**, pas plus en abonnement qu'à
l'unité — ni dans la session Checkout, ni dans `payment_settings` de
l'abonnement. Stripe détermine les moyens éligibles à partir du tableau de
bord, de la devise et du client. Voir `docs/DECISIONS.md` §21 pour le
raisonnement complet et le revirement qui l'a motivé.

---

## 8. TVA — à traiter avant la première vraie facture

Une cotisation vendue à des particuliers en Belgique est une prestation
soumise à la TVA. Stripe Tax sait la calculer et l'afficher
(`automatic_tax: { enabled: true }`), **mais il ne le fait qu'à partir d'une
immatriculation active dans la juridiction concernée**.

C'est le piège classique, et il est silencieux : sans immatriculation
déclarée, Stripe ne collecte **rien** et ne renvoie **aucune erreur**. La
ligue croit facturer TVA comprise pendant des mois, et découvre l'écart en
régularisant.

Donc, dans cet ordre : d'abord l'immatriculation (auprès de l'administration,
puis déclarée dans Stripe), ensuite `automatic_tax`. Et il faut décider si les
prix affichés sont HT ou TTC — ce qui se règle sur le `Price`, et ne se change
pas ensuite sans en créer un nouveau.

À lire avant de coder :
<https://docs.stripe.com/billing/taxes/collect-taxes.md>

---

## 9. Facturation à l'usage

Sans objet ici — une cotisation n'est pas de l'usage. Si le besoin
apparaissait (facturer au match joué, par exemple), c'est **Metronome** qui
est aujourd'hui la voie recommandée par Stripe pour une nouvelle intégration,
et non l'API Billing Meters.

---

## 10. Ordre de mise en œuvre

1. Bac à sable Stripe dédié, distinct du compte de production
   (<https://docs.stripe.com/sandboxes>), et clé **restreinte** (`rk_…`).
2. Catalogue : un produit, deux prix. Identifiants en variables
   d'environnement.
3. Table `stripe_customers` et création/réutilisation du `Customer`.
4. Checkout `mode: "subscription"` derrière un drapeau de fonctionnalité,
   sur le modèle de `FEATURE_SQUAD` — les routes le vérifient, pas seulement
   l'interface.
5. **Webhooks d'abonnement, avant toute ouverture de droits.** Rien ne part en
   production tant que cette étape n'est pas éprouvée avec
   `stripe listen` et `stripe trigger`.
6. Portail client.
7. TVA (§8).
8. Contrepartie effective : crédit UNO à chaque `invoice.paid`, via le
   registre et sa clé d'idempotence.

Les étapes 1 à 5 forment le socle : tout ce qui vient après peut attendre, le
webhook non.
