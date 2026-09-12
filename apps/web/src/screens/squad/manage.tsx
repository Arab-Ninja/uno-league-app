import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRightLeft, Crown, LogOut, Shield, UserMinus } from "lucide-react";
import {
  SQUAD_ROLE_LABELS,
  squadRoleAtLeast,
  type SquadDetailView,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { useAuth } from "@/lib/auth.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
  SectionTitle,
} from "@/components/ui/index.js";

/**
 * Administration d'un SQUAD (SQUAD-002).
 *
 * Les boutons affichés dépendent du rôle, mais ce n'est qu'une politesse :
 * **le serveur refuse quoi qu'affiche cet écran**, et dans la même
 * transaction que l'écriture — entre un contrôle fait au seuil et l'écriture
 * qui suit, un membre peut avoir été rétrogradé.
 */
export function SquadManageScreen() {
  const { squadId } = useParams<{ squadId: string }>();
  const id = Number(squadId);
  const detail = trpc.squads.detail.useQuery({ squadId: id });

  return (
    <Screen title="Gérer le SQUAD" back backTo="/squad">
      <Async query={detail}>
        {(squad) =>
          squad.viewer.role === null ? (
            <Card>
              <p className="text-center text-xs text-muted">
                Vous n'êtes pas membre de ce SQUAD.
              </p>
            </Card>
          ) : (
            <ManageBody squad={squad} />
          )
        }
      </Async>
    </Screen>
  );
}

function ManageBody({ squad }: { squad: SquadDetailView }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const role = squad.viewer.role!;
  const isFounder = role === "founder";

  const update = trpc.squads.update.useMutation();
  const setRole = trpc.squads.setMemberRole.useMutation();
  const removeMember = trpc.squads.removeMember.useMutation();
  const listPlayer = trpc.squads.listPlayer.useMutation();
  const transfer = trpc.squads.transferOwnership.useMutation();
  const leave = trpc.squads.leave.useMutation();

  const [name, setName] = useState(squad.name);
  const [description, setDescription] = useState(squad.description ?? "");
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, message?: string) {
    void tapFeedback();
    setFailure(null);
    setNotice(null);
    try {
      await action();
      await utils.squads.detail.invalidate({ squadId: squad.id });
      await utils.squads.mine.invalidate();
      if (message) setNotice(message);
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-5">
      {failure && <ErrorBanner message={failure} />}
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {notice}
        </div>
      )}

      {isFounder && (
        <section className="space-y-3">
          <SectionTitle>Identité</SectionTitle>
          <Field label="Nom" htmlFor="squad-name">
            <Input
              id="squad-name"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Description" htmlFor="squad-description">
            <Input
              id="squad-description"
              value={description}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          <Button
            variant="secondary"
            fullWidth
            loading={update.isPending}
            onClick={() =>
              void run(
                () =>
                  update.mutateAsync({
                    squadId: squad.id,
                    name: name.trim(),
                    description: description.trim() === "" ? null : description.trim(),
                  }),
                "SQUAD mis à jour.",
              )
            }
          >
            Enregistrer
          </Button>
        </section>
      )}

      <section>
        <SectionTitle>Effectif ({squad.memberCount})</SectionTitle>
        <div className="space-y-2">
          {squad.members.map((member) => {
            const isSelf = member.player.id === user?.playerId;

            return (
              <Card key={member.player.id} className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.player.displayName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {member.player.division ?? "Arbitre"} · note{" "}
                      {member.player.rating}
                    </p>
                  </div>
                  {member.listedAt !== null && (
                    <Badge tone="warning">Sur le marché</Badge>
                  )}
                  {member.role !== "member" && (
                    <Badge tone={member.role === "founder" ? "accent" : "primary"}>
                      {SQUAD_ROLE_LABELS[member.role]}
                    </Badge>
                  )}
                </div>

                {/* Le fondateur est intouchable : sa place se transmet, elle
                    ne se retire pas. */}
                {member.role !== "founder" && (
                  <div className="flex flex-wrap gap-2">
                    {/* Afficher un joueur comme cessible engage l'image du
                        club et ouvre la porte aux offres : c'est un acte de
                        fondateur (SQUAD-008). */}
                    {isFounder && (
                      <Button
                        variant="secondary"
                        className="flex-1"
                        loading={listPlayer.isPending}
                        onClick={() =>
                          void run(() =>
                            listPlayer.mutateAsync({
                              playerId: member.player.id,
                              listed: member.listedAt === null,
                            }),
                          )
                        }
                      >
                        <ArrowRightLeft className="size-4" aria-hidden />
                        {member.listedAt === null ? "Sur le marché" : "Retirer"}
                      </Button>
                    )}

                    {isFounder && (
                      <Button
                        variant="secondary"
                        className="flex-1"
                        loading={setRole.isPending}
                        onClick={() =>
                          void run(() =>
                            setRole.mutateAsync({
                              squadId: squad.id,
                              playerId: member.player.id,
                              role: member.role === "captain" ? "member" : "captain",
                            }),
                          )
                        }
                      >
                        <Shield className="size-4" aria-hidden />
                        {member.role === "captain" ? "Rétrograder" : "Capitaine"}
                      </Button>
                    )}

                    {squadRoleAtLeast(role, "captain") && !isSelf && (
                      <Button
                        variant="secondary"
                        className="flex-1"
                        loading={removeMember.isPending}
                        onClick={() =>
                          void run(() =>
                            removeMember.mutateAsync({
                              squadId: squad.id,
                              playerId: member.player.id,
                            }),
                          )
                        }
                      >
                        <UserMinus className="size-4" aria-hidden />
                        Exclure
                      </Button>
                    )}

                    {isFounder && (
                      <Button
                        variant="secondary"
                        className="flex-1"
                        loading={transfer.isPending}
                        onClick={() =>
                          void run(
                            () =>
                              transfer.mutateAsync({
                                squadId: squad.id,
                                toPlayerId: member.player.id,
                              }),
                            `${member.player.displayName} est désormais fondateur.`,
                          )
                        }
                      >
                        <Crown className="size-4" aria-hidden />
                        Transmettre
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <SectionTitle>Quitter</SectionTitle>
        {isFounder && squad.memberCount > 1 && (
          <Card>
            <p className="text-xs leading-relaxed text-muted">
              Transmettez d'abord le SQUAD à un autre membre : un club sans
              fondateur ne peut plus être administré.
            </p>
          </Card>
        )}
        <Button
          variant="secondary"
          fullWidth
          loading={leave.isPending}
          disabled={isFounder && squad.memberCount > 1}
          onClick={() =>
            void run(async () => {
              await leave.mutateAsync();
              navigate("/squad", { replace: true });
            })
          }
        >
          <LogOut className="size-4" aria-hidden />
          {isFounder && squad.memberCount === 1
            ? "Dissoudre le SQUAD"
            : "Quitter le SQUAD"}
        </Button>
      </section>
    </div>
  );
}
