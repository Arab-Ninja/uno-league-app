import { useEffect, useState } from "react";
import { Search, UserPen } from "lucide-react";
import { DIVISIONS, type Division } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { tapFeedback } from "@/lib/native.js";
import { Async } from "@/components/ui/async.js";
import { PlayerPhotoEditor } from "./player-photo.js";
import {
  Button,
  Card,
  ConfirmButton,
  Field,
  Input,
  Select,
} from "@/components/ui/index.js";

/**
 * Suppression d'un compte (ADMIN-012).
 *
 * Isolé dans son propre composant pour une raison précise : il interroge le
 * serveur avant d'agir. L'écran annonce le solde qui sera perdu et le motif
 * d'un éventuel refus **avant** la confirmation — un administrateur qui
 * découvre l'un ou l'autre après avoir cliqué a le sentiment d'avoir cassé
 * quelque chose, alors même que rien n'a bougé.
 */
function PlayerDeletion({
  playerId,
  onDeleted,
}: {
  playerId: number;
  onDeleted: () => Promise<void>;
}) {
  const preview = trpc.admin.previewPlayerDeletion.useQuery({ playerId });
  const remove = trpc.admin.deletePlayerAccount.useMutation();
  const [error, setError] = useState<string | null>(null);

  if (!preview.data) return null;
  const info = preview.data;

  if (info.alreadyDeleted) {
    return (
      <p className="rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-xs text-muted">
        Ce compte est déjà supprimé. Les lignes qui le citent ne désignent plus
        personne.
      </p>
    );
  }

  // Le refus est annoncé, pas seulement opposé : il dit quoi faire avant.
  const blocked = info.isSelf
    ? "Vous ne pouvez pas supprimer votre propre compte depuis l'administration."
    : info.isAdmin
      ? "Ce compte est administrateur. Retirez-lui d'abord ce rôle."
      : info.foundedSquadName
        ? `Ce joueur a fondé le club « ${info.foundedSquadName} ». Dissolvez le club ou transmettez-en la fondation d'abord.`
        : null;

  return (
    <div className="space-y-3 rounded-xl border border-error/40 bg-error/5 px-3 py-3">
      <div>
        <p className="text-sm font-semibold text-red-200">
          Supprimer le compte
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Irréversible. L'identité, la photo, l'adresse et les identifiants de
          connexion sont effacés. Le registre financier et les résultats
          sportifs sont conservés, détachés du nom — c'est ce qu'annonce la page
          publique de suppression.
        </p>
        {info.unoPoints > 0 && (
          <p className="mt-2 text-[11px] leading-relaxed text-red-200">
            Les {info.unoPoints} UNO de ce compte sont repris et perdus : ils ne
            sont ni remboursés, ni transférés.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}

      {blocked ? (
        <p className="text-[11px] leading-relaxed text-muted">{blocked}</p>
      ) : (
        <ConfirmButton
          label="Supprimer le compte"
          confirmLabel="Oui, supprimer définitivement"
          loading={remove.isPending}
          onConfirm={() => {
            setError(null);
            void remove
              .mutateAsync({ playerId })
              .then(onDeleted)
              .catch((caught: unknown) => {
                setError(describeError(caught).message);
              });
          }}
        />
      )}
    </div>
  );
}

/**
 * Gestion des joueurs : division, solde UNO et identité (ADMIN-002, ADMIN-003,
 * ADMIN-008).
 */
export function AdminPlayers() {
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const players = trpc.admin.players.useQuery({
    limit: 50,
    ...(query.trim() ? { query: query.trim() } : {}),
  });

  const setDivision = trpc.admin.setDivision.useMutation();
  const setSupervisor = trpc.admin.setSupervisor.useMutation();
  const adjustUno = trpc.admin.adjustUno.useMutation();
  const zeroAll = trpc.admin.zeroAllBalances.useMutation();

  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    await utils.admin.players.invalidate();
    await utils.admin.stats.invalidate();
  }

  async function changeDivision(playerId: number, division: Division) {
    setError(null);
    setNotice(null);
    try {
      await setDivision.mutateAsync({ playerId, division });
      await refresh();
      setNotice("Division mise à jour.");
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  /**
   * Accorde ou retire le droit de saisir les feuilles de match (SUP-001).
   *
   * Le superviseur reste joueur ou arbitre : ce droit s'ajoute à son compte,
   * il ne le remplace pas.
   */
  async function toggleSupervisor(playerId: number, isSupervisor: boolean) {
    setError(null);
    setNotice(null);
    try {
      await setSupervisor.mutateAsync({ playerId, isSupervisor });
      await refresh();
      setNotice(
        isSupervisor
          ? "Ce joueur peut désormais saisir les feuilles de match."
          : "Droit de supervision retiré.",
      );
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  async function applyAdjustment(playerId: number) {
    setError(null);
    setNotice(null);
    const value = Number.parseInt(amount, 10);
    if (!Number.isInteger(value) || value <= 0) {
      setError("Saisissez un montant entier positif.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Indiquez un motif (3 caractères minimum).");
      return;
    }

    try {
      const result = await adjustUno.mutateAsync({
        playerId,
        amount: value,
        direction,
        reason: reason.trim(),
      });
      await refresh();
      setAmount("");
      setReason("");
      setNotice(`Nouveau solde : ${result.balanceAfter} UNO.`);
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  /**
   * Reprend les UNO de toute la ligue (ADMIN-010).
   *
   * Le motif est fixé ici plutôt que saisi : cette remise à zéro répond à une
   * question précise — le bonus de bienvenue a disparu, les comptes ouverts
   * avant doivent cesser d'en profiter — et c'est ce texte que chaque joueur
   * lira dans son portefeuille.
   */
  async function clearAllBalances() {
    setError(null);
    setNotice(null);
    try {
      const result = await zeroAll.mutateAsync({
        reason: "Retrait du bonus de bienvenue",
      });
      await refresh();
      setNotice(
        result.playersCleared === 0
          ? "Tous les soldes étaient déjà à zéro."
          : `${result.playersCleared} compte(s) remis à zéro, ` +
              `${result.unoRemoved} UNO repris.`,
      );
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          className="pl-10"
          placeholder="Rechercher un joueur ou un email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {notice}
        </div>
      )}

      {/*
        Remise à zéro générale (ADMIN-010).

        Placée au-dessus de la liste et non dans la fiche d'un joueur : elle
        ne concerne personne en particulier. Le chiffre repris s'affiche
        ensuite, parce qu'une action qui touche toute la ligue doit dire ce
        qu'elle a fait.
      */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Remettre tous les soldes à zéro
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Reprend les UNO de tous les comptes, y compris le vôtre. Chaque
              joueur verra la reprise dans son portefeuille. Irréversible.
            </p>
          </div>
          <ConfirmButton
            label="Tout remettre à zéro"
            confirmLabel="Oui, tout reprendre"
            loading={zeroAll.isPending}
            onConfirm={() => void clearAllBalances()}
          />
        </div>
      </Card>

      <Async query={players}>
        {(page) => (
          <div className="space-y-3">
            {page.items.map((player) => (
              <Card key={player.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() =>
                    setSelected(selected === player.id ? null : player.id)
                  }
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {player.displayName}
                      {player.role === "admin" && (
                        <span className="ml-2 text-[10px] uppercase text-accent">
                          admin
                        </span>
                      )}
                      {player.isSupervisor && player.role !== "admin" && (
                        <span className="ml-2 text-[10px] uppercase text-emerald-300">
                          superviseur
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {player.email}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-accent">
                      {player.unoPoints}
                    </p>
                    <p className="text-[11px] text-muted">
                      {player.accountType === "referee"
                        ? "Arbitre"
                        : player.division}
                    </p>
                  </div>
                </button>

                {selected === player.id && (
                  <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
                    {/*
                      SUP-001 : le droit de saisie se donne joueur par joueur.
                      L'administration l'a d'office, il n'y a donc rien à lui
                      proposer.
                    */}
                    {player.role !== "admin" && (
                      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface-raised px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">Superviseur</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                            Peut saisir les feuilles de match, sauf celles des
                            sessions qu'il a jouées.
                          </p>
                        </div>
                        <Button
                          variant={player.isSupervisor ? "secondary" : "accent"}
                          loading={setSupervisor.isPending}
                          onClick={() =>
                            void toggleSupervisor(
                              player.id,
                              !player.isSupervisor,
                            )
                          }
                        >
                          {player.isSupervisor ? "Retirer" : "Nommer"}
                        </Button>
                      </div>
                    )}

                    {player.accountType === "referee" ? (
                      <p className="rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-xs text-muted">
                        Un arbitre n'a pas de division : il n'entre ni au
                        classement ni dans les montées et descentes.
                      </p>
                    ) : (
                      <Field label="Division" htmlFor={`division-${player.id}`}>
                        <Select
                          id={`division-${player.id}`}
                          value={player.division}
                          onChange={(event) =>
                            void changeDivision(
                              player.id,
                              event.target.value as Division,
                            )
                          }
                        >
                          {DIVISIONS.map((division) => (
                            <option key={division} value={division}>
                              {division}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <Field
                        label="Montant UNO"
                        htmlFor={`amount-${player.id}`}
                      >
                        <Input
                          id={`amount-${player.id}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={amount}
                          onChange={(event) =>
                            setAmount(event.target.value.replace(/\D/g, ""))
                          }
                        />
                      </Field>
                      <Field label="Sens" htmlFor={`direction-${player.id}`}>
                        <Select
                          id={`direction-${player.id}`}
                          value={direction}
                          onChange={(event) =>
                            setDirection(
                              event.target.value as "credit" | "debit",
                            )
                          }
                        >
                          <option value="credit">Créditer (+)</option>
                          <option value="debit">Débiter (−)</option>
                        </Select>
                      </Field>
                    </div>

                    <Field label="Motif" htmlFor={`reason-${player.id}`}>
                      <Input
                        id={`reason-${player.id}`}
                        placeholder="Journalisé dans l'audit"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </Field>

                    <Button
                      variant="accent"
                      fullWidth
                      loading={adjustUno.isPending}
                      onClick={() => void applyAdjustment(player.id)}
                    >
                      Appliquer l'ajustement
                    </Button>

                    {/* ADMIN-008 : corriger l'identité, y compris ce que le
                        joueur ne peut plus toucher lui-même. */}
                    <PlayerIdentityEditor playerId={player.id} />

                    {/* ADMIN-009 : poser ou retirer le visage de la carte. */}
                    <PlayerPhotoEditor playerId={player.id} />

                    {/* ADMIN-012 : exécuter une demande de suppression. */}
                    <PlayerDeletion
                      playerId={player.id}
                      onDeleted={async () => {
                        await refresh();
                        setNotice("Compte supprimé.");
                      }}
                    />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}

/**
 * Correction de l'identité d'un joueur (ADMIN-008).
 *
 * Depuis qu'un joueur ne peut plus modifier sa date de naissance ni son
 * adresse e-mail (AUTH-009), quelqu'un doit pouvoir réparer une faute de
 * frappe faite à l'inscription. Sans cela, la seule issue serait un second
 * compte — exactement ce que le verrouillage cherche à éviter.
 *
 * Le formulaire est replié par défaut : c'est un geste rare, et l'ouvrir
 * d'office inviterait à modifier ce qui n'a pas à l'être.
 */
function PlayerIdentityEditor({ playerId }: { playerId: number }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const profile = trpc.admin.player.useQuery({ playerId }, { enabled: open });
  const update = trpc.admin.updatePlayer.useMutation();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    dateOfBirth: "",
    reason: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.data) return;
    setForm({
      firstName: profile.data.firstName,
      lastName: profile.data.lastName,
      email: profile.data.email,
      dateOfBirth: profile.data.dateOfBirth,
      reason: "",
    });
  }, [profile.data]);

  async function save() {
    void tapFeedback();
    setFieldErrors({});
    setMessage(null);

    try {
      await update.mutateAsync({
        playerId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        dateOfBirth: form.dateOfBirth,
        ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
      });
      await utils.admin.players.invalidate();
      await utils.admin.player.invalidate({ playerId });
      setMessage("Identité corrigée.");
    } catch (caught) {
      const described = describeError(caught);
      setFieldErrors(described.fields);
      setMessage(described.message);
    }
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        fullWidth
        onClick={() => {
          void tapFeedback();
          setOpen(true);
        }}
      >
        <UserPen className="size-4" aria-hidden />
        Corriger l'identité
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-surface p-3">
      <p className="text-xs leading-relaxed text-muted">
        Le joueur ne peut modifier lui-même ni son adresse e-mail ni sa date de
        naissance. Corrigez ici une erreur d'inscription plutôt que de créer un
        second compte.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Prénom"
          error={fieldErrors["firstName"]}
          htmlFor={`fn-${playerId}`}
        >
          <Input
            id={`fn-${playerId}`}
            value={form.firstName}
            onChange={(event) =>
              setForm((c) => ({ ...c, firstName: event.target.value }))
            }
          />
        </Field>
        <Field
          label="Nom"
          error={fieldErrors["lastName"]}
          htmlFor={`ln-${playerId}`}
        >
          <Input
            id={`ln-${playerId}`}
            value={form.lastName}
            onChange={(event) =>
              setForm((c) => ({ ...c, lastName: event.target.value }))
            }
          />
        </Field>
      </div>

      <Field
        label="Adresse e-mail"
        error={fieldErrors["email"]}
        htmlFor={`em-${playerId}`}
      >
        <Input
          id={`em-${playerId}`}
          type="email"
          inputMode="email"
          autoComplete="off"
          value={form.email}
          onChange={(event) =>
            setForm((c) => ({ ...c, email: event.target.value }))
          }
        />
      </Field>

      <Field
        label="Date de naissance"
        error={fieldErrors["dateOfBirth"]}
        htmlFor={`dob-${playerId}`}
      >
        <Input
          id={`dob-${playerId}`}
          type="date"
          value={form.dateOfBirth}
          onChange={(event) =>
            setForm((c) => ({ ...c, dateOfBirth: event.target.value }))
          }
        />
      </Field>

      <Field label="Motif" htmlFor={`rs-${playerId}`}>
        <Input
          id={`rs-${playerId}`}
          placeholder="Journalisé dans l'audit"
          value={form.reason}
          onChange={(event) =>
            setForm((c) => ({ ...c, reason: event.target.value }))
          }
        />
      </Field>

      {message && (
        <p role="status" className="text-xs text-muted">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => setOpen(false)}
        >
          Fermer
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          loading={update.isPending}
          disabled={!profile.data}
          onClick={() => void save()}
        >
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
