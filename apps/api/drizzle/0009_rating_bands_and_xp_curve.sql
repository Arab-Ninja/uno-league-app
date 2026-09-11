-- Bandes de note par division (CARD-003) et courbe d'XP progressive (XP-002).
--
-- Deux barèmes changent en même temps ; tous deux se recalculent à partir des
-- chiffres déjà en base, sans rien perdre.

-- ---------------------------------------------------------------------------
-- 1. La note se replace dans la bande de sa division
-- ---------------------------------------------------------------------------
--
-- Toutes les cartes étaient parties de 50 : un très bon D1 plafonnait à 55,
-- autant qu'un débutant de D3 après trois bonnes soirées. La division fixe
-- désormais le socle et la forme fait bouger la note à l'intérieur :
--
--   D3 : 50 → 72     D2 : 62 → 84     D1 : 74 → 99
--
-- On rejoue ici la courbe logarithmique du palmarès, étalée dans la bande :
--   note = plancher + (plafond − plancher) × (1 − e^(−points / 90))
--
-- Un arbitre n'a pas de division (ROLE-003) : sa carte n'affiche pas de note,
-- la valeur stockée reste au plancher général.
UPDATE `players`
SET `rating` = CASE `division`
  WHEN 'D1' THEN LEAST(99, GREATEST(74, ROUND(74 + 25 * (1 - EXP(-(
    1.5 * `goals` + 1.0 * `assists` + 0.5 * `defenses` + 0.5 * `saves`) / 90)))))
  WHEN 'D2' THEN LEAST(84, GREATEST(62, ROUND(62 + 22 * (1 - EXP(-(
    1.5 * `goals` + 1.0 * `assists` + 0.5 * `defenses` + 0.5 * `saves`) / 90)))))
  ELSE LEAST(72, GREATEST(50, ROUND(50 + 22 * (1 - EXP(-(
    1.5 * `goals` + 1.0 * `assists` + 0.5 * `defenses` + 0.5 * `saves`) / 90)))))
END
WHERE `account_type` = 'player';--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Le niveau suit la nouvelle courbe d'XP
-- ---------------------------------------------------------------------------
--
-- Chaque palier coûtait 500 XP, quel qu'il soit. Il coûte désormais
-- 300 + 100 × (niveau − 1), si bien que l'XP cumulée pour atteindre le
-- niveau n vaut :
--
--   300 × (n − 1) + 50 × (n − 1) × (n − 2)
--
-- Résolue pour n, la réciproque donne :
--
--   n = floor( (−250 + sqrt(250² + 200 × xp)) / 100 ) + 2,  pour xp > 0
--
-- L'XP acquise n'est pas retouchée : seul le niveau qu'on en déduit change.
-- Un joueur peut donc voir son niveau baisser à la migration — c'est le prix
-- d'une courbe qui ne s'aplatit plus, et c'est volontaire.
UPDATE `players`
SET `level` = GREATEST(1, FLOOR((-250 + SQRT(62500 + 200 * `xp`)) / 100) + 2)
WHERE `xp` > 0;--> statement-breakpoint

UPDATE `players` SET `level` = 1 WHERE `xp` <= 0;
