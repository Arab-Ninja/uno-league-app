import { useRef, useState } from "react";
import { Eye, Megaphone, Pencil, Trash2 } from "lucide-react";
import { DIVISIONS, LIMITS, type Division } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { formatDateTime } from "@/lib/format.js";
import { imageSrc } from "@/lib/images.js";
import { useT } from "@/lib/i18n.js";
import { Async } from "@/components/ui/async.js";
import { AnnouncementImagesField } from "@/components/admin/images-field.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Select,
} from "@/components/ui/index.js";

/**
 * Annonces de la ligue (ANN-005).
 *
 * Publier envoie aussitôt une notification — dans l'application et en push —
 * à chaque joueur visé : toute la ligue, ou une seule division. Corriger une
 * annonce ne renotifie personne ; la supprimer la retire de l'application.
 */

interface Draft {
  title: string;
  content: string;
  images: string[];
  targetDivision: Division | "";
}

const EMPTY: Draft = { title: "", content: "", images: [], targetDivision: "" };

export function AdminAnnouncements() {
  const t = useT();
  const utils = trpc.useUtils();
  const list = trpc.admin.announcements.useQuery();
  const create = trpc.admin.createAnnouncement.useMutation();
  const update = trpc.admin.updateAnnouncement.useMutation();
  const remove = trpc.admin.deleteAnnouncement.useMutation();

  const formRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    await utils.admin.announcements.invalidate();
    await utils.announcements.list.invalidate();
    await utils.announcements.unreadCount.invalidate();
  }

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      if (editing === null) {
        await create.mutateAsync({
          title: form.title,
          content: form.content,
          images: form.images,
          targetDivision: form.targetDivision || null,
          publishNow: true,
        });
        setNotice(t("admin.announcements.published"));
      } else {
        await update.mutateAsync({
          announcementId: editing,
          title: form.title,
          content: form.content,
          images: form.images,
        });
        setNotice(t("admin.announcements.updated"));
      }
      setForm(EMPTY);
      setEditing(null);
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  async function confirmDelete(announcementId: number) {
    setError(null);
    setNotice(null);
    try {
      await remove.mutateAsync({ announcementId });
      setConfirming(null);
      if (editing === announcementId) {
        setEditing(null);
        setForm(EMPTY);
      }
      setNotice(t("admin.announcements.deleted"));
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  const complete = form.title.trim() !== "" && form.content.trim() !== "";
  const busy = create.isPending || update.isPending;

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-muted">
        {t("admin.announcements.howItWorks")}
      </p>
      {error && <ErrorBanner message={error} />}
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {notice}
        </div>
      )}

      <div ref={formRef} className="scroll-mt-4">
        <Card className="space-y-3">
          <p className="text-sm font-semibold">
            {editing === null
              ? t("admin.announcements.new")
              : t("admin.announcements.editing")}
          </p>

          <Field
            label={t("admin.announcements.title")}
            htmlFor="announcementTitle"
          >
            <Input
              id="announcementTitle"
              value={form.title}
              maxLength={LIMITS.titleMax}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </Field>

          <Field
            label={t("admin.announcements.content")}
            htmlFor="announcementContent"
          >
            <textarea
              id="announcementContent"
              value={form.content}
              maxLength={LIMITS.descriptionMax}
              rows={5}
              onChange={(event) =>
                setForm({ ...form, content: event.target.value })
              }
              className="w-full resize-y rounded-xl border border-border/60 bg-surface-raised px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
          </Field>

          <AnnouncementImagesField
            images={form.images}
            onChange={(images) => setForm({ ...form, images })}
          />

          {editing === null && (
            <Field
              label={t("admin.announcements.audience")}
              htmlFor="announcementAudience"
            >
              <Select
                id="announcementAudience"
                value={form.targetDivision}
                onChange={(event) =>
                  setForm({
                    ...form,
                    targetDivision: event.target.value as Division | "",
                  })
                }
              >
                <option value="">{t("admin.announcements.everyone")}</option>
                {DIVISIONS.map((division) => (
                  <option key={division} value={division}>
                    {t("admin.announcements.onlyDivision", { division })}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="flex gap-2">
            {editing !== null && (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                  setForm(EMPTY);
                }}
              >
                {t("admin.announcements.cancelEdit")}
              </Button>
            )}
            <Button
              variant="accent"
              fullWidth
              disabled={!complete}
              loading={busy}
              onClick={() => void submit()}
            >
              {editing === null
                ? t("admin.announcements.publish")
                : t("admin.announcements.save")}
            </Button>
          </div>
          {editing === null && (
            <p className="text-[11px] text-muted">
              {t("admin.announcements.notifyHint")}
            </p>
          )}
        </Card>
      </div>

      <Async query={list}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              title={t("admin.announcements.empty")}
              icon={<Megaphone className="size-6" aria-hidden />}
            />
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <Card key={row.id} className="space-y-2">
                  <div className="flex items-start gap-3">
                    {row.images[0] && (
                      <img
                        src={imageSrc(row.images[0])}
                        alt=""
                        className="size-14 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {row.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                        {row.content}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        {row.publishedAt && (
                          <span>{formatDateTime(row.publishedAt)}</span>
                        )}
                        <Badge>
                          {row.targetDivision
                            ? t("admin.announcements.onlyDivision", {
                                division: row.targetDivision,
                              })
                            : t("admin.announcements.everyone")}
                        </Badge>
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3" aria-hidden />
                          {t("admin.announcements.reads", {
                            count: row.readCount,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                  {confirming === row.id ? (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setConfirming(null)}
                      >
                        {t("admin.announcements.keep")}
                      </Button>
                      <Button
                        variant="danger"
                        loading={remove.isPending}
                        onClick={() => void confirmDelete(row.id)}
                      >
                        {t("admin.announcements.confirmDelete")}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditing(row.id);
                          setForm({
                            title: row.title,
                            content: row.content,
                            images: row.images,
                            targetDivision: row.targetDivision ?? "",
                          });
                          formRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                        }}
                      >
                        <Pencil className="size-4" aria-hidden />
                        {t("admin.announcements.edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setConfirming(row.id)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                        {t("admin.announcements.delete")}
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </div>
  );
}
