"""Validation par l'arbitre : corriger une feuille plutôt que la saisir.

Le système propose, l'arbitre tranche. Ce module produit la page qui sert à
trancher, et applique ensuite les décisions au rapport.

Deux principes gouvernent la page. D'abord, **une décision par événement, en un
geste** : sur une session de quatre-vingt-dix minutes il y a une trentaine
d'actions à confirmer, et si chacune demande trois clics le budget de vingt
minutes est dépassé avant la mi-temps. Ensuite, **l'arbitre doit pouvoir ajouter
ce que la vision a manqué** : une chaîne qui ne permet que de corriger ce
qu'elle a vu produit toujours une feuille incomplète, et personne ne s'en
aperçoit.

La page est un fichier autonome, ouvert directement depuis le dossier de
résultats. Pas de serveur, pas de compte, pas de réseau : les extraits vidéo
d'une session restent sur la machine de celui qui valide.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from .aggregate import MatchSheet, StatLine, aggregate_events
from .events import ASSIST, DEFENSE, GOAL, OWN_GOAL, SAVE, MatchEvent
from .roster import Roster, RosterEntry, TeamInfo

CONFIRMED = "confirmed"
REJECTED = "rejected"
REASSIGNED = "reassigned"
DECISIONS = (CONFIRMED, REJECTED, REASSIGNED)

CORRECTIONS_VERSION = 1


class ReviewError(ValueError):
    """Corrections incompatibles avec le rapport qu'elles prétendent corriger."""


def matches_of(report: dict[str, Any]) -> list[dict[str, Any]]:
    """Rapports de match, qu'on parte d'une session ou d'un match isolé."""
    return report.get("matches", [report])


def roster_from_match(match: dict[str, Any]) -> Roster:
    """Reconstitue la feuille à partir du rapport, qui la porte déjà."""
    entries = [
        RosterEntry(
            bib=int(row["bib"]),
            player_id=int(row["playerId"]) if row.get("playerId") is not None else 0,
            display_name=row.get("displayName", ""),
            team=row.get("team", "A"),
        )
        for row in match.get("matchStats", [])
        if row.get("bib") is not None
    ]
    teams = {
        "A": TeamInfo(team_id=match.get("match", {}).get("teamAId")),
        "B": TeamInfo(team_id=match.get("match", {}).get("teamBId")),
    }
    return Roster(entries=tuple(entries), teams=teams)


def _event_from_dict(payload: dict[str, Any]) -> MatchEvent:
    return MatchEvent(
        kind=payload["kind"],
        time_s=payload["timeMs"] / 1000.0,
        team=payload.get("team"),
        track_id=payload.get("trackId"),
        bib=payload.get("bib"),
        confidence=float(payload.get("confidence", 1.0)),
        detail=payload.get("detail", ""),
        scoring_team=payload.get("scoringTeam"),
    )


@dataclass(frozen=True, slots=True)
class ReviewOutcome:
    """Ce que la relecture a changé, pour la traçabilité."""

    confirmed: int
    rejected: int
    reassigned: int
    added: int

    @property
    def touched(self) -> int:
        return self.rejected + self.reassigned + self.added


def apply_corrections(
    report: dict[str, Any], corrections: dict[str, Any]
) -> tuple[dict[str, Any], ReviewOutcome]:
    """Applique les décisions de l'arbitre et recalcule la feuille de match.

    Les statistiques ne sont jamais retouchées à la main : elles sont
    **recalculées** à partir des événements retenus. Corriger un compteur sans
    corriger l'événement qui l'a produit laisserait une feuille que plus rien ne
    justifie, et qu'aucune relecture ultérieure ne pourrait vérifier.
    """
    version = corrections.get("version")
    if version != CORRECTIONS_VERSION:
        raise ReviewError(
            f"corrections au format {version!r}, attendu {CORRECTIONS_VERSION}"
        )

    decisions = corrections.get("decisions", {})
    additions = corrections.get("added", [])
    for identifier, decision in decisions.items():
        if decision.get("status") not in DECISIONS:
            raise ReviewError(
                f"décision inconnue pour {identifier} : {decision.get('status')!r}"
            )

    corrected = json.loads(json.dumps(report))
    counts = {CONFIRMED: 0, REJECTED: 0, REASSIGNED: 0}
    added = 0

    for match in matches_of(corrected):
        roster = roster_from_match(match)
        kept: list[dict[str, Any]] = []
        for event in match.get("events", []):
            decision = decisions.get(event["id"])
            if decision is None:
                kept.append(event)
                continue
            status = decision["status"]
            counts[status] += 1
            if status == REJECTED:
                continue
            if status == REASSIGNED:
                event = dict(event)
                bib = decision.get("bib")
                entry = roster.by_bib(bib)
                event["bib"] = bib
                event["playerId"] = entry.player_id if entry else None
                event["playerName"] = entry.display_name if entry else None
                event["team"] = entry.team if entry else event.get("team")
                event["confidence"] = 1.0
            event = dict(event)
            event["reviewed"] = True
            event["needsReview"] = False
            kept.append(event)

        order = match.get("matchOrder", match.get("match", {}).get("matchOrder", 1))
        for extra in additions:
            if extra.get("matchOrder", order) != order:
                continue
            entry = roster.by_bib(extra.get("bib"))
            kept.append(
                {
                    "id": f"manuel-{extra['kind']}-{int(extra['timeMs']):09d}",
                    "kind": extra["kind"],
                    "timeMs": int(extra["timeMs"]),
                    "team": entry.team if entry else extra.get("team"),
                    "scoringTeam": extra.get("scoringTeam")
                    or (entry.team if entry and extra["kind"] == GOAL else None),
                    "bib": extra.get("bib"),
                    "playerId": entry.player_id if entry else None,
                    "playerName": entry.display_name if entry else None,
                    "trackId": None,
                    "confidence": 1.0,
                    "detail": "Ajouté par l'arbitre.",
                    "clip": None,
                    "needsReview": False,
                    "reviewed": True,
                    "manual": True,
                }
            )
            added += 1

        kept.sort(key=lambda event: event["timeMs"])
        match["events"] = kept
        _rebuild_stats(match, roster)

    outcome = ReviewOutcome(
        confirmed=counts[CONFIRMED],
        rejected=counts[REJECTED],
        reassigned=counts[REASSIGNED],
        added=added,
    )
    # Le bloc `review` du rapport porte les avertissements de l'analyse : il est
    # complété, jamais remplacé. Écraser les alertes d'échelle au moment même où
    # l'arbitre valide serait le pire moment pour les perdre.
    corrected["reviewOutcome"] = {
        "applied": True,
        "confirmed": outcome.confirmed,
        "rejected": outcome.rejected,
        "reassigned": outcome.reassigned,
        "added": outcome.added,
    }
    return corrected, outcome


def _rebuild_stats(match: dict[str, Any], roster: Roster) -> None:
    """Recalcule `matchStats` et le score à partir des événements retenus."""
    events = [_event_from_dict(event) for event in match.get("events", [])]
    sheet: MatchSheet = aggregate_events(events, roster, review_threshold=0.0)
    known = {line.bib: line for line in sheet.lines}

    for row in match.get("matchStats", []):
        line: StatLine | None = known.get(row.get("bib"))
        if line is None:
            continue
        row["goals"] = line.goals
        row["assists"] = line.assists
        row["defenses"] = line.defenses
        row["saves"] = line.saves

    if "match" in match:
        match["match"]["scoreA"] = sheet.score_a
        match["match"]["scoreB"] = sheet.score_b

    # Les listes de relecture décrivaient l'état d'avant : les rafraîchir évite
    # qu'un événement corrigé reste signalé comme douteux.
    review = match.setdefault("review", {})
    review["unassignedEvents"] = [
        event["id"]
        for event in match.get("events", [])
        if event.get("playerId") is None and event["kind"] != OWN_GOAL
    ]
    review["lowConfidenceEvents"] = [
        event["id"] for event in match.get("events", []) if event.get("needsReview")
    ]
    review.setdefault("warnings", [])


KIND_LABELS = {
    GOAL: "But",
    OWN_GOAL: "But contre son camp",
    ASSIST: "Passe décisive",
    SAVE: "Arrêt",
    DEFENSE: "Défense",
}


def render_review_page(report: dict[str, Any], title: str = "Validation UNO League") -> str:
    """Page autonome de validation, à ouvrir depuis le dossier de résultats."""
    payload = json.dumps(report, ensure_ascii=False).replace("</", "<\\/")
    labels = json.dumps(KIND_LABELS, ensure_ascii=False)
    return _PAGE.replace("{{TITLE}}", title).replace("{{REPORT}}", payload).replace(
        "{{LABELS}}", labels
    )


_PAGE = r"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{TITLE}}</title>
<style>
  :root { --bg:#12141a; --panel:#1b1f28; --line:#2c3240; --ink:#e8eaf0;
          --muted:#98a0b3; --ok:#3ddc84; --no:#ff6b6b; --warn:#ffcc55; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { padding:14px 20px; border-bottom:1px solid var(--line);
           display:flex; gap:20px; align-items:baseline; flex-wrap:wrap; }
  h1 { font-size:17px; margin:0; font-weight:600; }
  .muted { color:var(--muted); font-size:13px; }
  main { display:grid; grid-template-columns:minmax(300px,380px) 1fr;
         gap:0; height:calc(100vh - 58px); }
  #list { overflow-y:auto; border-right:1px solid var(--line); }
  .ev { padding:10px 14px; border-bottom:1px solid var(--line); cursor:pointer;
        display:flex; gap:10px; align-items:baseline; }
  .ev:hover { background:#20252f; }
  .ev.sel { background:#252c3a; box-shadow:inset 3px 0 0 var(--ok); }
  .ev .t { font-variant-numeric:tabular-nums; color:var(--muted); font-size:13px; }
  .ev .k { font-weight:600; }
  .ev .p { color:var(--muted); font-size:13px; }
  .badge { margin-left:auto; font-size:11px; padding:2px 7px; border-radius:99px;
           border:1px solid var(--line); color:var(--muted); }
  .badge.ok { color:var(--ok); border-color:#245c3d; }
  .badge.no { color:var(--no); border-color:#5c2424; }
  .badge.re { color:var(--warn); border-color:#5c4d24; }
  #panel { padding:20px; overflow-y:auto; }
  video { width:100%; max-width:760px; background:#000; border-radius:8px; }
  .detail { color:var(--muted); margin:12px 0; max-width:760px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; margin:14px 0; }
  button { font:inherit; padding:9px 15px; border-radius:7px; cursor:pointer;
           border:1px solid var(--line); background:var(--panel); color:var(--ink); }
  button:hover { border-color:#495267; }
  button.ok { background:#1d3d2b; border-color:#2c6a47; }
  button.no { background:#3d1d1d; border-color:#6a2c2c; }
  select, input { font:inherit; padding:8px 10px; border-radius:7px;
                  border:1px solid var(--line); background:var(--panel); color:var(--ink); }
  table { border-collapse:collapse; margin-top:8px; font-size:14px; }
  th, td { padding:5px 12px; text-align:right; border-bottom:1px solid var(--line); }
  th:first-child, td:first-child { text-align:left; }
  .warn { color:var(--warn); }
  kbd { background:#2a303c; border:1px solid var(--line); border-bottom-width:2px;
        border-radius:4px; padding:1px 6px; font-size:12px; font-family:inherit; }
  .empty { color:var(--muted); padding:40px 20px; }
</style>
</head>
<body>
<header>
  <h1>{{TITLE}}</h1>
  <span class="muted" id="progress"></span>
  <span class="muted" style="margin-left:auto">
    <kbd>V</kbd> valider · <kbd>X</kbd> supprimer · <kbd>↑</kbd><kbd>↓</kbd> naviguer
  </span>
  <button id="save">Télécharger les corrections</button>
</header>
<main>
  <div id="list"></div>
  <div id="panel"></div>
</main>
<script>
const REPORT = {{REPORT}};
const LABELS = {{LABELS}};
const matches = REPORT.matches || [REPORT];
const decisions = {};
const added = [];
let events = [], current = 0;

matches.forEach((m, i) => {
  const order = m.matchOrder ?? m.match?.matchOrder ?? (i + 1);
  (m.events || []).forEach(e => events.push({ ...e, _match: order, _roster: m.matchStats || [] }));
});
events.sort((a, b) => a.timeMs - b.timeMs);

const mmss = ms => {
  const s = Math.round(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
};

function renderList() {
  const list = document.getElementById("list");
  if (!events.length) {
    list.innerHTML = '<p class="empty">Aucun événement proposé dans ce rapport.</p>';
    return;
  }
  list.innerHTML = events.map((e, i) => {
    const d = decisions[e.id];
    const badge = !d ? "" :
      d.status === "confirmed" ? '<span class="badge ok">validé</span>' :
      d.status === "rejected" ? '<span class="badge no">supprimé</span>' :
      '<span class="badge re">corrigé</span>';
    const who = d && d.status === "reassigned" ? ("n°" + d.bib)
              : (e.playerName || (e.bib ? "n°" + e.bib : "à désigner"));
    return `<div class="ev ${i === current ? "sel" : ""}" data-i="${i}">
      <span class="t">${mmss(e.timeMs)}</span>
      <span class="k">${LABELS[e.kind] || e.kind}</span>
      <span class="p">${who}</span>${badge}</div>`;
  }).join("");
  list.querySelectorAll(".ev").forEach(el =>
    el.onclick = () => { current = +el.dataset.i; render(); });
  const done = Object.keys(decisions).length;
  document.getElementById("progress").textContent =
    `${done} / ${events.length} traités · ${added.length} ajouté(s)`;
}

function renderPanel() {
  const panel = document.getElementById("panel");
  const e = events[current];
  if (!e) { panel.innerHTML = ""; return; }
  const roster = e._roster.filter(r => r.bib != null);
  const options = roster.map(r =>
    `<option value="${r.bib}" ${r.bib === e.bib ? "selected" : ""}>
       n°${r.bib} — ${r.displayName || "sans nom"} (${r.team})</option>`).join("");
  panel.innerHTML = `
    <h2 style="margin:0 0 4px">${LABELS[e.kind] || e.kind} — ${mmss(e.timeMs)}
      <span class="muted">match ${e._match}</span></h2>
    <p class="detail">${e.detail || ""}
      <br><span class="muted">confiance ${(e.confidence * 100).toFixed(0)} %</span></p>
    ${e.clip ? `<video src="${e.clip}" controls autoplay muted loop></video>`
             : '<p class="warn">Pas d\'extrait vidéo pour cet événement.</p>'}
    <div class="row">
      <button class="ok" id="confirm">Valider</button>
      <button class="no" id="reject">Ce n'est pas une action</button>
      <select id="who">${options}</select>
      <button id="reassign">Attribuer à ce joueur</button>
    </div>
    <details style="margin-top:24px">
      <summary class="muted">Ajouter une action que la vision a manquée</summary>
      <div class="row">
        <select id="addKind">${Object.entries(LABELS).map(([k, v]) =>
          `<option value="${k}">${v}</option>`).join("")}</select>
        <input id="addTime" placeholder="mm:ss" size="6" value="${mmss(e.timeMs)}">
        <select id="addWho">${options}</select>
        <button id="add">Ajouter</button>
      </div>
    </details>
    <h3 style="margin-top:28px">Feuille de match ${e._match}</h3>
    ${statsTable(e._match)}`;

  document.getElementById("confirm").onclick = () => decide("confirmed");
  document.getElementById("reject").onclick = () => decide("rejected");
  document.getElementById("reassign").onclick = () =>
    decide("reassigned", +document.getElementById("who").value);
  document.getElementById("add").onclick = addEvent;
}

function statsTable(order) {
  const match = matches.find((m, i) => (m.matchOrder ?? m.match?.matchOrder ?? (i + 1)) === order);
  const tally = {};
  for (const row of match.matchStats || [])
    tally[row.bib] = { ...row, goals: 0, assists: 0, defenses: 0, saves: 0 };
  const field = { goal: "goals", assist: "assists", defense: "defenses", save: "saves" };
  const all = events.filter(e => e._match === order)
    .filter(e => decisions[e.id]?.status !== "rejected")
    .concat(added.filter(a => a.matchOrder === order));
  for (const e of all) {
    const d = decisions[e.id];
    const bib = d && d.status === "reassigned" ? d.bib : e.bib;
    const key = field[e.kind];
    if (key && tally[bib]) tally[bib][key]++;
  }
  const rows = Object.values(tally)
    .sort((a, b) => (b.goals * 3 + b.assists * 2 + b.defenses + b.saves)
                  - (a.goals * 3 + a.assists * 2 + a.defenses + a.saves));
  return `<table><tr><th>Joueur</th><th>Éq</th><th>B</th><th>PD</th><th>Déf</th><th>Arr</th></tr>
    ${rows.map(r => `<tr><td>n°${r.bib} ${r.displayName || ""}</td><td>${r.team}</td>
      <td>${r.goals}</td><td>${r.assists}</td><td>${r.defenses}</td><td>${r.saves}</td></tr>`)
      .join("")}</table>`;
}

function decide(status, bib) {
  const e = events[current];
  decisions[e.id] = bib === undefined ? { status } : { status, bib };
  if (current < events.length - 1) current++;
  render();
}

function addEvent() {
  const e = events[current];
  const parts = document.getElementById("addTime").value.split(":");
  const seconds = parts.length === 2 ? (+parts[0]) * 60 + (+parts[1]) : +parts[0];
  added.push({
    kind: document.getElementById("addKind").value,
    timeMs: Math.round(seconds * 1000),
    bib: +document.getElementById("addWho").value,
    matchOrder: e._match,
  });
  render();
}

function render() { renderList(); renderPanel(); }

document.addEventListener("keydown", ev => {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(ev.target.tagName)) return;
  if (ev.key === "v" || ev.key === "V") decide("confirmed");
  else if (ev.key === "x" || ev.key === "X") decide("rejected");
  else if (ev.key === "ArrowDown") { current = Math.min(current + 1, events.length - 1); render(); }
  else if (ev.key === "ArrowUp") { current = Math.max(current - 1, 0); render(); }
  else return;
  ev.preventDefault();
});

document.getElementById("save").onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 1, decisions, added }, null, 2)],
                        { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "corrections.json";
  a.click();
};

render();
</script>
</body>
</html>
"""
