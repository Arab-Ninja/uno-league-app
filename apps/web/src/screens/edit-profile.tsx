import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Trash2 } from "lucide-react";
import {
  PLAYER_POSITIONS,
  POSITION_LABELS,
  toCardPlayer,
  updateProfileSchema,
  type PlayerPosition,
} from "@uno/shared";
import { COUNTRIES } from "@/lib/countries.js";
import { describeError, trpc, type ApiErrorInfo } from "@/lib/trpc.js";
import { notificationFeedback, tapFeedback } from "@/lib/native.js";
import { shrinkImage, uploadImage } from "@/lib/upload.js";
import { Screen } from "@/components/layout/index.js";
import { Avatar } from "@/components/domain/index.js";
import { FutCard } from "@/components/fut-card/fut-card.js";
import { Async } from "@/components/ui/async.js";
import { Button, ErrorBanner, Field, Input, Select } from "@/components/ui/index.js";

/**
 * Modification du profil (AUTH-007).
 * Division, solde, XP et statistiques n'apparaissent pas : ils ne sont pas
 * modifiables par le joueur, et le schéma serveur les rejetterait.
 */
export function EditProfileScreen() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const profile = trpc.players.me.useQuery();
  const update = trpc.players.updateProfile.useMutation();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    nationality: "BE",
    address: "",
    position: "MIL" as PlayerPosition,
  });
  const [photoOffsetY, setPhotoOffsetY] = useState(35);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<ApiErrorInfo | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile.data) return;
    setForm({
      firstName: profile.data.firstName,
      lastName: profile.data.lastName,
      dateOfBirth: profile.data.dateOfBirth,
      nationality: profile.data.nationality,
      address: profile.data.address ?? "",
      position: profile.data.position,
    });
    setPhotoUrl(profile.data.profilePhotoUrl);
    setPhotoOffsetY(profile.data.photoOffsetY);
  }, [profile.data]);

  /**
   * La photo est envoyée dès sa sélection, indépendamment du reste du
   * formulaire : l'aperçu est immédiat, et l'URL renvoyée par le serveur est
   * enregistrée avec les autres champs.
   */
  async function onPhotoSelected(file: File | undefined) {
    if (!file) return;
    setFormError(null);
    setUploading(true);

    try {
      const reduced = await shrinkImage(file);
      const { url } = await uploadImage(reduced, "avatars");
      setPhotoUrl(url);
      await notificationFeedback();
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setFormError(null);
    setErrors({});
    setSaved(false);

    const parsed = updateProfileSchema.safeParse({
      ...form,
      address: form.address.trim() === "" ? null : form.address.trim(),
      profilePhotoUrl: photoUrl,
      photoOffsetY,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      await update.mutateAsync(parsed.data);
      await notificationFeedback();
      await utils.players.me.invalidate();
      await utils.players.dashboard.invalidate();
      setSaved(true);
      setTimeout(() => navigate("/profil"), 900);
    } catch (error) {
      const info = describeError(error);
      setFormError(info);
      setErrors(info.fields);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Screen title="Modifier mon profil" back backTo="/profil" withTabBar={false}>
      <Async query={profile}>
        {(profileData) => (
          <div className="space-y-4">
            {formError && (
              <ErrorBanner
                message={formError.message}
                detail={formError.devCause}
              />
            )}
            {saved && (
              <div
                role="status"
                className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
              >
                Profil mis à jour.
              </div>
            )}

            {/* Photo de profil : aperçu sur la carte réelle, pour que le
                cadrage se règle sur ce qui sera effectivement affiché. */}
            <div className="flex flex-col items-center gap-3 py-2">
              {photoUrl ? (
                <FutCard
                  player={{
                    ...toCardPlayer(profileData),
                    displayName:
                      `${form.firstName} ${form.lastName}`.trim() || "Joueur",
                    nationality: form.nationality,
                    position: form.position,
                    profilePhotoUrl: photoUrl,
                    photoOffsetY,
                  }}
                  size="md"
                  animated={false}
                />
              ) : (
                <Avatar
                  name={`${form.firstName} ${form.lastName}`.trim() || "Joueur"}
                  url={null}
                  size="xl"
                />
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => void onPhotoSelected(event.target.files?.[0])}
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  icon={<Camera className="size-4" aria-hidden />}
                  loading={uploading}
                  onClick={() => {
                    void tapFeedback();
                    fileInput.current?.click();
                  }}
                >
                  {photoUrl ? "Changer la photo" : "Ajouter une photo"}
                </Button>
                {photoUrl && (
                  <Button
                    variant="ghost"
                    aria-label="Retirer la photo"
                    onClick={() => {
                      void tapFeedback();
                      setPhotoUrl(null);
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
              {photoUrl && (
                <div className="w-full max-w-[240px]">
                  <label
                    htmlFor="photoOffset"
                    className="mb-1.5 block text-center text-xs font-medium text-muted"
                  >
                    Cadrage vertical
                  </label>
                  <input
                    id="photoOffset"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={photoOffsetY}
                    onChange={(event) =>
                      setPhotoOffsetY(Number(event.target.value))
                    }
                    className="w-full accent-[#F97316]"
                    aria-label="Ajuster le cadrage vertical de la photo"
                  />
                  <p className="mt-1 text-center text-[11px] text-muted">
                    Faites glisser pour centrer votre visage.
                  </p>
                </div>
              )}

              <p className="text-center text-xs text-muted">
                JPEG, PNG ou WebP. L'image est réduite avant envoi.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom" error={errors["firstName"]} htmlFor="firstName">
                <Input
                  id="firstName"
                  value={form.firstName}
                  invalid={Boolean(errors["firstName"])}
                  onChange={(event) => set("firstName")(event.target.value)}
                />
              </Field>
              <Field label="Nom" error={errors["lastName"]} htmlFor="lastName">
                <Input
                  id="lastName"
                  value={form.lastName}
                  invalid={Boolean(errors["lastName"])}
                  onChange={(event) => set("lastName")(event.target.value)}
                />
              </Field>
            </div>

            <Field label="Date de naissance" error={errors["dateOfBirth"]} htmlFor="dob">
              <Input
                id="dob"
                type="date"
                max={today}
                value={form.dateOfBirth}
                invalid={Boolean(errors["dateOfBirth"])}
                onChange={(event) => set("dateOfBirth")(event.target.value)}
              />
            </Field>

            <Field label="Nationalité" error={errors["nationality"]} htmlFor="nationality">
              <Select
                id="nationality"
                value={form.nationality}
                onChange={(event) => set("nationality")(event.target.value)}
              >
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Poste"
              error={errors["position"]}
              htmlFor="position"
              hint="Affiché sur votre carte joueur."
            >
              <Select
                id="position"
                value={form.position}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    position: event.target.value as PlayerPosition,
                  }))
                }
              >
                {PLAYER_POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {position} — {POSITION_LABELS[position]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Adresse (optionnelle)"
              error={errors["address"]}
              htmlFor="address"
              hint="Sert uniquement à livrer les articles commandés en boutique. Elle n'apparaît sur aucun profil public."
            >
              <Input
                id="address"
                value={form.address}
                placeholder="Rue, numéro, ville"
                invalid={Boolean(errors["address"])}
                onChange={(event) => set("address")(event.target.value)}
              />
            </Field>

            <Button
              variant="accent"
              fullWidth
              loading={update.isPending}
              onClick={() => void submit()}
            >
              Enregistrer
            </Button>
          </div>
        )}
      </Async>
    </Screen>
  );
}
