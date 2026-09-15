import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trophy, X } from "lucide-react";
import {
  TOURNAMENT_SIZES,
  TOURNAMENT_STATUS_LABELS,
  type CreateTournamentInput,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { formatLongDate } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  SectionTitle,
  Select,
} from "@/components/ui/index.js";

/**
 * Création et suivi des tournois (TOUR-001).
 *
 * Les paramètres sont ceux d'une séance — salle, date, créneau — plus ce qui
 * fait un tournoi : un plateau, un droit d'engagement et une dotation. Le
 * tirage et la saisie des résultats, eux, se font sur la fiche du tournoi, au
 * milieu du tableau : les faire d'ici aurait obligé à se souvenir de qui joue
 * contre qui.
 */
const EMPTY = {
  name: "",
  date: "",
  slotStartHour: 18,
  venueId: "",
  size: 8,
  entryFeeUno: 200,
  prizeUno: 1000,
} satisfies Omit<CreateTournamentInput, "size"> & { size: number };

export function AdminTournaments() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const tournaments = trpc.tournaments.list.useQuery({ mineOnly: false });
  const venues = trpc.proposals.venues.useQuery();
  const create = trpc.tournaments.create.useMutation();
  const cancel = trpc.tournaments.cancel.useMutation();

  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    await utils.tournaments.list.invalidate();
  }

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      await create.mutateAsync({
        name: form.name,
        date: form.date,
        slotStartHour: form.slotStartHour,
        venueId: form.venueId,
        size: form.size as 4 | 8 | 16 | 32,
        entryFeeUno: form.entryFeeUno,
        prizeUno: form.prizeUno,
      });
      setForm(EMPTY);
      setNotice("Tournoi ouvert aux engagements.");
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  async function drop(tournamentId: number) {
    setError(null);
    setNotice(null);
    try {
      await cancel.mutateAsync({ tournamentId });
      setNotice("Tournoi annulé : chaque club engagé a retrouvé son droit.");
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Ouvrir un tournoi</SectionTitle>
        <Card className="space-y-3">
          <Field label="Nom" htmlFor="tournament-name">
            <Input
              id="tournament-name"
              value={form.name}
              placeholder="Coupe d'hiver des clubs"
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="tournament-date">
              <Input
                id="tournament-date"
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
              />
            </Field>
            <Field label="Heure" htmlFor="tournament-hour">
              <Select
                id="tournament-hour"
                value={String(form.slotStartHour)}
                onChange={(event) =>
                  setForm({
                    ...form,
                    slotStartHour: Number(event.target.value),
                  })
                }
              >
                {Array.from({ length: 17 }, (_, index) => index + 7).map(
                  (hour) => (
                    <option key={hour} value={hour}>
                      {String(hour).padStart(2, "0")}:00
                    </option>
                  ),
                )}
              </Select>
            </Field>
          </div>

          <Field label="Salle" htmlFor="tournament-venue">
            <Select
              id="tournament-venue"
              value={form.venueId}
              onChange={(event) =>
                setForm({ ...form, venueId: event.target.value })
              }
            >
              <option value="">Choisir une salle</option>
              {/*
                C'est le `slug` que le serveur attend, pas l'identifiant
                numérique : `requireBookableVenue` cherche une salle par son
                slug, et lui passer un nombre revenait à désigner une salle
                qui n'existe pas.
              */}
              {(venues.data ?? []).map((venue) => (
                <option key={venue.id} value={venue.slug}>
                  {venue.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Clubs"
            htmlFor="tournament-size"
            hint="Une puissance de deux : c'est la seule forme sans exempt."
          >
            <Select
              id="tournament-size"
              value={String(form.size)}
              onChange={(event) =>
                setForm({ ...form, size: Number(event.target.value) })
              }
            >
              {TOURNAMENT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} clubs
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Engagement (UNO)" htmlFor="tournament-fee">
              <Input
                id="tournament-fee"
                type="number"
                min={0}
                inputMode="numeric"
                value={String(form.entryFeeUno)}
                onChange={(event) =>
                  setForm({ ...form, entryFeeUno: Number(event.target.value) })
                }
              />
            </Field>
            <Field label="Dotation (UNO)" htmlFor="tournament-prize">
              <Input
                id="tournament-prize"
                type="number"
                min={0}
                inputMode="numeric"
                value={String(form.prizeUno)}
                onChange={(event) =>
                  setForm({ ...form, prizeUno: Number(event.target.value) })
                }
              />
            </Field>
          </div>

          {error && <ErrorBanner message={error} />}
          {notice && (
            <p role="status" className="text-center text-xs text-success">
              {notice}
            </p>
          )}

          <Button
            variant="accent"
            fullWidth
            loading={create.isPending}
            disabled={
              form.name.trim().length < 3 || !form.date || !form.venueId
            }
            onClick={() => void submit()}
          >
            <Trophy className="size-4" aria-hidden />
            Ouvrir les engagements
          </Button>
        </Card>
      </section>

      <section>
        <SectionTitle>Tournois</SectionTitle>
        <Async query={tournaments}>
          {(list) =>
            list.length === 0 ? (
              <Card>
                <p className="text-center text-xs text-muted">
                  Aucun tournoi. Le premier s'ouvre au-dessus.
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {list.map((tournament) => (
                  <Card key={tournament.id} className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          void tapFeedback();
                          navigate(`/tournois/${tournament.id}`);
                        }}
                      >
                        <p className="truncate text-sm font-semibold">
                          {tournament.name}
                        </p>
                        <p className="text-xs text-muted">
                          {formatLongDate(tournament.localDate)} ·{" "}
                          {tournament.venueName} · {tournament.entryCount}/
                          {tournament.size} clubs
                        </p>
                      </button>
                      <Badge
                        tone={
                          tournament.status === "completed"
                            ? "accent"
                            : tournament.status === "cancelled"
                              ? "neutral"
                              : "primary"
                        }
                      >
                        {TOURNAMENT_STATUS_LABELS[tournament.status]}
                      </Badge>
                    </div>

                    {/*
                      Un tournoi terminé ne s'annule pas : ses caisses sont
                      réglées, et défaire cela demanderait de reprendre une
                      dotation déjà dépensée.
                    */}
                    {tournament.status !== "completed" &&
                      tournament.status !== "cancelled" && (
                        <Button
                          variant="ghost"
                          className="min-h-[36px] w-full py-1.5 text-xs"
                          loading={cancel.isPending}
                          onClick={() => void drop(tournament.id)}
                        >
                          <X className="size-3.5" aria-hidden />
                          Annuler et rendre les engagements
                        </Button>
                      )}
                  </Card>
                ))}
              </div>
            )
          }
        </Async>
      </section>
    </div>
  );
}
