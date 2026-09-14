import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Images, RefreshCw, ShieldCheck } from "lucide-react";
import type { PortraitIssue } from "@uno/shared";
import { tapFeedback } from "@/lib/native.js";
import {
  analysePortrait,
  cutOutPortrait,
  type FaceBox,
} from "@/lib/portrait.js";
import { getLandmarker, getSegmenter } from "@/lib/vision.js";
import { Button, Card } from "@/components/ui/index.js";

/**
 * Prise et préparation d'une photo de profil (PHOTO-001, PHOTO-002).
 *
 * Le joueur se prend en photo, l'application vérifie qu'elle est exploitable,
 * la détoure et la recadre. **Tout se passe sur son appareil** : ni la photo
 * ni les mesures du visage ne quittent le téléphone avant qu'il n'accepte le
 * résultat, et ce qui part alors est l'image finale, rien d'autre.
 *
 * Trois principes tiennent cet écran :
 *
 *  - **la caméra d'abord, la pellicule ensuite**. Une photo prise sur le
 *    moment ressemble à son auteur ; une image piochée dans la galerie est
 *    souvent un portrait de groupe recadré. Le choix d'un fichier reste
 *    offert — un ordinateur sans webcam, une permission refusée, un bras
 *    dans le plâtre — mais il n'est pas le chemin proposé en premier ;
 *  - **ce qui bloque est incontestable**. Pas de visage, plusieurs visages,
 *    photo floue ou noire, tête de profil : on reprend. Le reste s'affiche
 *    comme un conseil et laisse passer ;
 *  - **un échec technique ne bloque personne**. Modèles non chargés, caméra
 *    absente, navigateur trop ancien : la photo part telle quelle.
 */

interface PortraitCaptureProps {
  /** Appelé avec l'image préparée, prête à être envoyée. */
  onAccepted: (file: File) => void | Promise<void>;
  /** Affiché pendant l'envoi par l'écran appelant. */
  busy?: boolean;
  /** Libellé du bouton de validation. */
  acceptLabel?: string;
}

type Stage = "idle" | "camera" | "working" | "review";

interface Prepared {
  file: File;
  previewUrl: string;
  issues: PortraitIssue[];
  acceptable: boolean;
  backgroundRemoved: boolean;
}

export function PortraitCapture({
  onAccepted,
  busy = false,
  acceptLabel = "Utiliser cette photo",
}: PortraitCaptureProps) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const source = useRef<ImageBitmap | null>(null);
  const face = useRef<FaceBox | null>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [keepBackground, setKeepBackground] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraDenied, setCameraDenied] = useState(false);

  /**
   * Les modèles pèsent une quinzaine de mégaoctets : leur chargement démarre
   * dès l'ouverture de l'écran, pendant que le joueur se place. Sans cela,
   * l'attente tomberait juste après le déclenchement — au pire moment.
   */
  useEffect(() => {
    void getLandmarker().catch(() => undefined);
    void getSegmenter().catch(() => undefined);
  }, []);

  const stopCamera = useCallback(() => {
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  // Une caméra qu'on oublie d'éteindre laisse un voyant allumé : c'est le
  // genre de détail qui fait désinstaller une application.
  useEffect(() => stopCamera, [stopCamera]);

  // L'aperçu précédent est libéré dès qu'un nouveau le remplace.
  useEffect(() => {
    return () => {
      if (prepared) URL.revokeObjectURL(prepared.previewUrl);
    };
  }, [prepared]);

  /**
   * L'image d'origine, elle, vit tant que l'écran est ouvert : c'est elle
   * qu'on retravaille quand le joueur décide finalement de garder son fond.
   * La fermer avec l'aperçu rendait ce bouton inopérant.
   */
  useEffect(() => () => source.current?.close(), []);

  async function startCamera() {
    setError(null);
    void tapFeedback();

    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setCameraDenied(true);
      setError(
        "Cet appareil n'expose pas de caméra au navigateur. Choisissez une photo existante.",
      );
      return;
    }

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        // La caméra frontale, et un cadre carré : c'est le format de la photo
        // finale, autant le montrer tel quel.
        video: {
          facingMode: "user",
          width: { ideal: 1080 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      stream.current = media;
      setStage("camera");
      // Le `video` n'existe qu'une fois l'étape affichée.
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play().catch(() => undefined);
        }
      });
    } catch {
      setCameraDenied(true);
      setError(
        "L'accès à la caméra a été refusé. Vous pouvez choisir une photo existante.",
      );
    }
  }

  /** Découpe le carré central de la vidéo : ce que le repère montrait. */
  async function grabFrame(): Promise<ImageBitmap | null> {
    const element = video.current;
    if (!element || element.videoWidth === 0) return null;

    const side = Math.min(element.videoWidth, element.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(
      element,
      (element.videoWidth - side) / 2,
      (element.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      side,
      side,
    );

    return createImageBitmap(canvas);
  }

  async function prepare(bitmap: ImageBitmap, background: boolean) {
    setStage("working");
    setError(null);

    try {
      const analysis = await analysePortrait(bitmap);
      face.current = analysis?.face ?? null;

      const cut = await cutOutPortrait(bitmap, face.current, {
        removeBackground: !background,
      });

      setPrepared({
        file: cut.file,
        previewUrl: URL.createObjectURL(cut.file),
        // Sans modèle chargé, aucune mesure : on ne reproche rien plutôt que
        // d'inventer un défaut.
        issues: analysis?.issues ?? [],
        acceptable: analysis?.acceptable ?? true,
        backgroundRemoved: cut.backgroundRemoved,
      });
      setStage("review");
    } catch {
      setError("La photo n'a pas pu être préparée. Réessayez.");
      setStage(stream.current ? "camera" : "idle");
    }
  }

  async function shoot() {
    void tapFeedback();
    const bitmap = await grabFrame();
    if (!bitmap) {
      setError("La caméra n'a pas encore d'image. Patientez une seconde.");
      return;
    }
    stopCamera();
    source.current?.close();
    source.current = bitmap;
    await prepare(bitmap, keepBackground);
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    void tapFeedback();

    try {
      const bitmap = await createImageBitmap(file);
      stopCamera();
      source.current?.close();
      source.current = bitmap;
      await prepare(bitmap, keepBackground);
    } catch {
      setError("Ce fichier n'est pas une image lisible.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function toggleBackground(keep: boolean) {
    setKeepBackground(keep);
    if (source.current) await prepare(source.current, keep);
  }

  function retake() {
    void tapFeedback();
    setPrepared(null);
    setStage("idle");
    void startCamera();
  }

  const blocking = prepared?.issues.filter((found) => found.severity === "blocking") ?? [];
  const advice = prepared?.issues.filter((found) => found.severity === "warning") ?? [];

  return (
    <div className="space-y-3">
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void pickFile(event.target.files?.[0])}
      />

      {stage === "idle" && (
        <Card className="space-y-3 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/15">
            <Camera className="size-7 text-accent" aria-hidden />
          </div>
          <p className="text-sm font-medium">Votre photo de joueur</p>
          <p className="text-xs leading-relaxed text-muted">
            Placez-vous face à la lumière, regardez l'objectif et retirez
            lunettes de soleil, casquette ou masque. Le fond sera retiré
            automatiquement.
          </p>
          <Button variant="accent" fullWidth onClick={() => void startCamera()}>
            <Camera className="size-4" aria-hidden />
            Prendre la photo
          </Button>
          <button
            type="button"
            onClick={() => {
              void tapFeedback();
              fileInput.current?.click();
            }}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"
          >
            <Images className="size-3.5" aria-hidden />
            {cameraDenied
              ? "Choisir une photo existante"
              : "Ou choisir une photo existante"}
          </button>
        </Card>
      )}

      {stage === "camera" && (
        <Card className="space-y-3">
          <div className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl bg-black">
            <video
              ref={video}
              playsInline
              muted
              autoPlay
              // Miroir à l'écran comme dans un vrai miroir ; l'image
              // enregistrée, elle, garde le bon sens.
              className="size-full -scale-x-100 object-cover"
            />
            <PortraitGuide />
          </div>
          <p className="text-center text-xs text-muted">
            Cadrez votre visage dans l'ovale, épaules comprises.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                stopCamera();
                setStage("idle");
              }}
            >
              Annuler
            </Button>
            <Button variant="accent" className="flex-1" onClick={() => void shoot()}>
              <Camera className="size-4" aria-hidden />
              Déclencher
            </Button>
          </div>
        </Card>
      )}

      {stage === "working" && (
        <Card className="space-y-3 py-8 text-center">
          <RefreshCw className="mx-auto size-6 animate-spin text-accent" aria-hidden />
          <p className="text-sm font-medium">Préparation de la photo…</p>
          <p className="text-xs text-muted">
            Analyse du cadrage et détourage du fond, sur votre appareil.
          </p>
        </Card>
      )}

      {stage === "review" && prepared && (
        <Card className="space-y-3">
          {/* Le damier rappelle que le fond est transparent : sur la carte,
              c'est le dégradé du club qui apparaîtra derrière. */}
          <div
            className="mx-auto size-[220px] overflow-hidden rounded-2xl border border-border/60"
            style={{
              backgroundImage:
                "linear-gradient(45deg, #1d2432 25%, transparent 25%), linear-gradient(-45deg, #1d2432 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1d2432 75%), linear-gradient(-45deg, transparent 75%, #1d2432 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
            }}
          >
            <img
              src={prepared.previewUrl}
              alt="Aperçu de votre photo de profil"
              className="size-full object-cover"
            />
          </div>

          {blocking.length > 0 && (
            <div
              role="alert"
              className="space-y-1 rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-xs leading-relaxed text-red-200"
            >
              {blocking.map((found) => (
                <p key={found.code}>{found.message}</p>
              ))}
            </div>
          )}

          {blocking.length === 0 && advice.length > 0 && (
            <div className="space-y-1 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs leading-relaxed text-warning">
              {advice.map((found) => (
                <p key={found.code}>{found.message}</p>
              ))}
            </div>
          )}

          {blocking.length === 0 && advice.length === 0 && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5 text-xs font-medium text-success">
              <ShieldCheck className="size-4" aria-hidden />
              Photo conforme : visage de face, net et dégagé.
            </div>
          )}

          <label className="flex items-center justify-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={keepBackground}
              onChange={(event) => void toggleBackground(event.target.checked)}
              className="size-4 accent-[#F97316]"
            />
            Garder le fond de la photo
          </label>

          {!prepared.backgroundRemoved && !keepBackground && (
            <p className="text-center text-[11px] text-muted">
              Le fond n'a pas pu être retiré sur cet appareil : la photo est
              conservée telle quelle.
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={retake}>
              <RefreshCw className="size-4" aria-hidden />
              Reprendre
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              disabled={blocking.length > 0}
              loading={busy}
              onClick={() => void onAccepted(prepared.file)}
            >
              <Check className="size-4" aria-hidden />
              {acceptLabel}
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <p role="alert" className="text-center text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Repère ovale : là où le visage doit se trouver.
 *
 * L'assombrissement du pourtour se fait par une ombre portée démesurée plutôt
 * que par un masque SVG : le masque ne s'appliquait pas dans un cadre étiré,
 * et le repère restait posé sur une image uniformément claire — inutile pour
 * se cadrer. L'ombre, elle, est découpée par le cadre qui la contient.
 */
function PortraitGuide() {
  /**
   * `z-10` n'est pas décoratif : une vidéo est composée dans sa propre couche
   * et passe au-dessus des éléments qui la suivent. Sans cet étage explicite,
   * le voile était bien là — et invisible.
   */
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div
        className="absolute left-1/2 top-[46%] h-[70%] w-[54%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-2 border-dashed border-accent/80"
        style={{ boxShadow: "0 0 0 9999px rgba(9, 13, 20, 0.55)" }}
      />
    </div>
  );
}
