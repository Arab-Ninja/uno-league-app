import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSquadSchema } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import {
  Button,
  Card,
  ErrorBanner,
  Field,
  Input,
} from "@/components/ui/index.js";

/**
 * Fondation d'un SQUAD (AC01).
 *
 * Le formulaire est court à dessein : un club se fonde en trente secondes, et
 * tout ce qui le distingue — logo, description étoffée, capitaines — se règle
 * ensuite. Demander tout d'emblée découragerait ceux-là mêmes qu'on veut voir
 * se lancer.
 */
export function SquadCreateScreen() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const create = trpc.squads.create.useMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);

  async function submit() {
    void tapFeedback();
    setErrors({});
    setFailure(null);

    const parsed = createSquadSchema.safeParse({
      name,
      description: description.trim() === "" ? null : description.trim(),
    });

    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !fields[key]) fields[key] = issue.message;
      }
      setErrors(fields);
      return;
    }

    try {
      const squad = await create.mutateAsync(parsed.data);
      await utils.squads.mine.invalidate();
      await utils.squads.list.invalidate();
      navigate(`/squad`, { replace: true });
      return squad;
    } catch (caught) {
      const described = describeError(caught);
      setErrors(described.fields);
      setFailure(described.fields["name"] ? null : described.message);
      return null;
    }
  }

  return (
    <Screen title="Fonder un SQUAD" back backTo="/squad">
      <div className="space-y-4">
        <Card>
          <p className="text-xs leading-relaxed text-muted">
            Vous en deviendrez le fondateur : à vous de recruter, de nommer des
            capitaines, de lancer des défis et de gérer la trésorerie.
          </p>
        </Card>

        {failure && <ErrorBanner message={failure} />}

        <Field label="Nom du SQUAD" error={errors["name"]} htmlFor="squad-name">
          <Input
            id="squad-name"
            placeholder="Les Loups de Forest"
            value={name}
            maxLength={40}
            invalid={Boolean(errors["name"])}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Description (facultative)"
          error={errors["description"]}
          htmlFor="squad-description"
          hint="Ce que les autres verront sur votre profil."
        >
          <Input
            id="squad-description"
            placeholder="Le club du mardi soir."
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <Button
          variant="accent"
          fullWidth
          loading={create.isPending}
          disabled={name.trim().length < 3}
          onClick={() => void submit()}
        >
          Fonder le SQUAD
        </Button>
      </div>
    </Screen>
  );
}
