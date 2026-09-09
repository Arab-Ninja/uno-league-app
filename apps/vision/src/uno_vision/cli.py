"""Interface en ligne de commande d'`uno-vision`.

Le parcours nominal d'une session tient en quatre commandes :

    uno-vision frame     --video match.mp4 --out salle.png
    uno-vision calibrate --points "..." --out salle.json     (une fois par salle)
    uno-vision analyze   --video match.mp4 --calibration salle.json \\
                         --roster match.json --out resultats/
    uno-vision replay    --observations resultats/observations.jsonl ...

`analyze` est la seule à consommer du GPU. `replay` rejoue les règles sur les
observations mises en cache : c'est la commande à utiliser pour étalonner les
seuils sur des matchs déjà analysés, en une seconde et sans matériel.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .calibration import Calibration, FieldDimensions
from .config import AnalysisConfig
from .lens import fit_distortion, straightness_error
from .observations import read_observations, write_observations
from .pipeline import analyse_observations, analyse_session
from .reference import ReferenceTimeline, compare_goals
from .review import ReviewError, apply_corrections, matches_of, render_review_page
from .report import VideoInfo, format_summary
from .roster import Roster
from .session import SessionPlan, blank_plan
from .scene import Point


def _parse_points(raw: str) -> tuple[Point, ...]:
    """Lit « x,y x,y x,y x,y » — les quatre coins du terrain dans l'image."""
    points: list[Point] = []
    for chunk in raw.replace(";", " ").split():
        x, _, y = chunk.partition(",")
        points.append(Point(float(x), float(y)))
    if len(points) < 4:
        raise argparse.ArgumentTypeError("au moins quatre points sont nécessaires")
    return tuple(points)


def _command_frame(args: argparse.Namespace) -> int:
    """Exporte une image de la vidéo, à cliquer pour calibrer la salle."""
    import cv2

    capture = cv2.VideoCapture(args.video)
    capture.set(cv2.CAP_PROP_POS_FRAMES, args.at)
    ok, image = capture.read()
    capture.release()
    if not ok:
        print(f"impossible de lire l'image {args.at} de {args.video}", file=sys.stderr)
        return 1
    cv2.imwrite(args.out, image)
    height, width = image.shape[:2]
    print(f"Image {args.at} écrite dans {args.out} ({width}×{height} px).")
    print(
        "Relevez les coordonnées en pixels des quatre coins du terrain, dans "
        "l'ordre : but gauche côté proche, but droit côté proche, but droit côté "
        "loin, but gauche côté loin."
    )
    print(
        "Si l'objectif est un grand-angle — murs visiblement courbés —, relevez "
        "aussi quelques points le long de deux ou trois droites de la salle et "
        "passez-les à `calibrate --lens-lines`."
    )
    return 0


def _parse_lines(raw: str) -> tuple[tuple[Point, ...], ...]:
    """Lit « x,y x,y x,y ; x,y x,y x,y » — des points sur des droites réelles."""
    lines = []
    for chunk in raw.split(";"):
        points = tuple(
            Point(float(pair.split(",")[0]), float(pair.split(",")[1]))
            for pair in chunk.split()
        )
        if len(points) >= 3:
            lines.append(points)
    if not lines:
        raise argparse.ArgumentTypeError(
            "chaque ligne demande au moins trois points, séparés par des espaces ; "
            "les lignes se séparent par un point-virgule"
        )
    return tuple(lines)


def _parse_size(raw: str) -> tuple[int, int]:
    width, _, height = raw.lower().partition("x")
    return int(width), int(height)


def _parse_field_points(raw: str) -> tuple[Point, ...]:
    """Lit « x,y x,y … » en mètres, dans le repère du terrain."""
    return _parse_points(raw)


def _command_calibrate(args: argparse.Namespace) -> int:
    dimensions = (
        FieldDimensions.five_a_side()
        if args.preset == "five-a-side"
        else FieldDimensions()
    )
    if args.length is not None:
        dimensions = FieldDimensions(
            length_m=args.length,
            width_m=args.width if args.width is not None else dimensions.width_m,
            goal_width_m=args.goal_width,
            goal_area_depth_m=dimensions.goal_area_depth_m,
        )
    elif args.width is not None:
        dimensions = FieldDimensions(
            length_m=dimensions.length_m,
            width_m=args.width,
            goal_width_m=args.goal_width,
            goal_area_depth_m=dimensions.goal_area_depth_m,
        )
    lens = None
    if args.lens_lines:
        width, height = args.image_size
        lens = fit_distortion(
            args.lens_lines, width, height, estimate_center=args.optical_center
        )
        before = sum(straightness_error(line) for line in args.lens_lines)
        after = sum(
            straightness_error([lens.undistort(point) for point in line])
            for line in args.lens_lines
        )
        print(
            f"Objectif : k1={lens.k1:.4f}, k2={lens.k2:.4f} — courbure des lignes "
            f"de contrôle ramenée de {before:.1f} px à {after:.1f} px."
        )
        if after > before * 0.5:
            print(
                "  Attention : la correction change peu de chose. Vérifiez que "
                "les points cliqués suivent bien des droites du monde réel.",
                file=sys.stderr,
            )

    calibration = Calibration(
        field=dimensions,
        image_points=args.points,
        field_points=args.field_points or (),
        team_a_defends=args.team_a_defends,
        venue=args.venue,
        lens=lens,
    )
    # Vérification immédiate : une homographie qui ne se calcule pas doit être
    # signalée maintenant, pas trois heures de GPU plus tard.
    center = calibration.to_image(calibration.field.center)
    calibration.save(args.out)
    print(f"Calibration écrite dans {args.out}.")
    print(
        f"Terrain : {dimensions.length_m:.0f} × {dimensions.width_m:.0f} m, "
        f"but de {dimensions.goal_width_m:.1f} m."
    )
    print(
        f"Contrôle : le rond central tombe en ({center.x:.0f}, {center.y:.0f}) px. "
        "Vérifiez que ce point est bien au centre du terrain sur l'image."
    )
    return 0


def _command_analyze(args: argparse.Namespace) -> int:
    from .video.analyze import analyse_video

    calibration = Calibration.load(args.calibration)
    roster = Roster.load(args.roster) if args.roster else Roster()
    config = AnalysisConfig.load(args.config)
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)

    def progress(index: int, total: int) -> None:
        if total:
            print(f"\r  image {index}/{total} ({100 * index / total:.1f} %)", end="")

    frames, video = analyse_video(
        args.video,
        calibration,
        roster,
        config,
        weights=args.weights,
        device=args.device,
        stride=args.stride,
        read_bibs=not args.no_bibs,
        progress=progress,
    )
    print()
    write_observations(output / "observations.jsonl", frames)
    return _finish(frames, calibration, roster, config, output, video, args)


def _command_replay(args: argparse.Namespace) -> int:
    calibration = Calibration.load(args.calibration)
    roster = Roster.load(args.roster) if args.roster else Roster()
    config = AnalysisConfig.load(args.config)
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)

    frames = list(read_observations(args.observations))
    video = VideoInfo(path=args.video or "", frame_count=len(frames))
    return _finish(frames, calibration, roster, config, output, video, args)


def _finish(
    frames,
    calibration: Calibration,
    roster: Roster,
    config: AnalysisConfig,
    output: Path,
    video: VideoInfo,
    args: argparse.Namespace,
) -> int:
    plan_path = getattr(args, "session", None)
    if plan_path:
        return _finish_session(
            frames, calibration, SessionPlan.load(plan_path), config, output, video
        )
    analysis = analyse_observations(frames, calibration, roster, config, video=video)

    clips: dict[str, str] | None = None
    source_video = getattr(args, "video", None)
    if source_video and not getattr(args, "no_clips", False):
        from .video.clips import FfmpegMissingError, extract_event_clips

        try:
            clips = extract_event_clips(
                source_video,
                analysis.report,
                output / "clips",
                config.clip_seconds_before,
                config.clip_seconds_after,
            )
        except FfmpegMissingError as error:
            print(f"Extraits non produits : {error}", file=sys.stderr)

    if clips:
        analysis = analyse_observations(
            frames, calibration, roster, config, video=video, clips=clips
        )

    report_path = output / "report.json"
    report_path.write_text(
        json.dumps(analysis.report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(format_summary(analysis.report))
    print(f"\nRapport complet : {report_path}")
    return 0


def _finish_session(
    frames,
    calibration: Calibration,
    plan: SessionPlan,
    config: AnalysisConfig,
    output: Path,
    video: VideoInfo,
) -> int:
    """Une session : un rapport par match, plus un sommaire de session."""
    session = analyse_session(frames, calibration, plan, config, video=video)
    for window, analysis in session.matches:
        print(f"\n--- match {window.match_order} "
              f"({window.start_s / 60:.0f}-{window.end_s / 60:.0f} min) ---")
        print(format_summary(analysis.report))

    destination = output / "session.json"
    destination.write_text(
        json.dumps(session.report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"\nRapport de session : {destination}")
    return 0


def _command_reference(args: argparse.Namespace) -> int:
    """Lit le tableau d'affichage du centre — pour évaluer, jamais pour compter."""
    from .video.scoreboard import read_scoreboard

    def progress(index: int, total: int) -> None:
        if total:
            print(f"\r  image {index}/{total} ({100 * index / total:.0f} %)", end="")

    timeline = read_scoreboard(args.video, stride=args.stride, progress=progress)
    print()
    if not timeline.goals:
        print(
            "Aucun tableau d'affichage exploitable dans cette vidéo : il n'y aura "
            "pas de repère pour ce centre.",
            file=sys.stderr,
        )
        return 1

    timeline.save(args.out)
    counts = timeline.sides()
    print(
        f"{len(timeline.goals)} buts relevés (A={counts['A']}, B={counts['B']}), "
        f"score final lu {timeline.final_score}."
    )
    print(
        "Autocontrôle : "
        + ("cohérent." if timeline.is_consistent else
           "INCOHÉRENT — le décompte ne reconstitue pas le score affiché, "
           "ce repère ne doit pas servir de référence.")
    )
    print(f"Repère écrit dans {args.out}.")
    return 0


def _command_evaluate(args: argparse.Namespace) -> int:
    """Mesure la détection des buts face au repère."""
    report = json.loads(Path(args.report).read_text(encoding="utf-8"))
    reference = ReferenceTimeline.load(args.reference)
    if not reference.is_consistent:
        print(
            "Le repère est incohérent avec le score final qu'il a lui-même lu : "
            "toute mesure fondée dessus serait trompeuse.",
            file=sys.stderr,
        )
        return 1

    reports = report.get("matches", [report])
    detected = [
        event["timeMs"] / 1000.0
        for one in reports
        for event in one.get("events", [])
        if event["kind"] in ("goal", "own_goal")
    ]
    comparison = compare_goals(detected, reference, tolerance_s=args.tolerance)
    print(comparison.summary())
    if comparison.missed:
        print("\nButs manqués par la détection :")
        for goal in comparison.missed[:20]:
            print(f"  {int(goal.time_s) // 60:3d}:{int(goal.time_s) % 60:02d}  "
                  f"côté {goal.side}")
    return 0


def _command_review(args: argparse.Namespace) -> int:
    """Écrit la page de validation, à ouvrir depuis le dossier de résultats."""
    report_path = Path(args.report)
    report = json.loads(report_path.read_text(encoding="utf-8"))
    destination = Path(args.out) if args.out else report_path.with_name("review.html")

    # Les extraits sont désignés relativement à la page : le dossier de
    # résultats reste déplaçable d'une machine à l'autre.
    manquants = 0
    for match in matches_of(report):
        for event in match.get("events", []):
            clip = event.get("clip")
            if not clip:
                manquants += 1
                continue
            try:
                event["clip"] = str(
                    Path(clip).resolve().relative_to(destination.parent.resolve())
                )
            except ValueError:
                event["clip"] = str(Path(clip).resolve())

    video = args.video
    if video and not video.startswith(("http://", "https://")):
        # Chemin relatif à la page : le dossier de résultats reste déplaçable.
        try:
            video = str(Path(video).resolve().relative_to(destination.parent.resolve()))
        except ValueError:
            video = str(Path(video).resolve())

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        render_review_page(
            report,
            args.title,
            video=video,
            seconds_before=args.before,
            seconds_after=args.after,
        ),
        encoding="utf-8",
    )
    total = sum(len(m.get("events", [])) for m in matches_of(report))
    print(f"Page de validation : {destination}  ({total} événements à trancher)")
    if args.video:
        print("  La page se positionne dans la vidéo de session : rien à découper.")
    elif manquants:
        print(
            f"  {manquants} événement(s) sans rien à montrer. Passez --video avec "
            "la vidéo de session : c'est plus simple et plus rapide que de "
            "découper des extraits.",
            file=sys.stderr,
        )
    print("Ouvrez-la, tranchez, puis « Télécharger les corrections » et :")
    print(f"  uno-vision apply-review --report {args.report} "
          "--corrections corrections.json")
    return 0


def _command_apply_review(args: argparse.Namespace) -> int:
    """Applique les décisions de l'arbitre et recalcule la feuille."""
    report = json.loads(Path(args.report).read_text(encoding="utf-8"))
    corrections = json.loads(Path(args.corrections).read_text(encoding="utf-8"))
    try:
        corrected, outcome = apply_corrections(report, corrections)
    except ReviewError as error:
        print(f"Corrections inutilisables : {error}", file=sys.stderr)
        return 1

    destination = Path(args.out) if args.out else Path(args.report).with_name(
        "report-valide.json"
    )
    destination.write_text(
        json.dumps(corrected, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        f"{outcome.confirmed} validé(s), {outcome.rejected} supprimé(s), "
        f"{outcome.reassigned} réattribué(s), {outcome.added} ajouté(s)."
    )
    for match in matches_of(corrected):
        print(format_summary(match))
    print(f"\nFeuille validée : {destination}")
    return 0


def _command_session_template(args: argparse.Namespace) -> int:
    blank_plan(args.matches, args.minutes, args.team_size).save(args.out)
    print(
        f"Trame de session écrite dans {args.out} : {args.matches} matchs de "
        f"{args.minutes:.0f} min. Ajustez les bornes et complétez chaque feuille — "
        "les équipes changent d'un match à l'autre."
    )
    return 0


def _command_roster_template(args: argparse.Namespace) -> int:
    template = {
        "proposalId": None,
        "matchOrder": 1,
        "teams": {
            "A": {"id": None, "name": "Équipe A", "bibColor": [200, 40, 40]},
            "B": {"id": None, "name": "Équipe B", "bibColor": [40, 70, 200]},
        },
        "players": [
            {
                "bib": number,
                "playerId": None,
                "displayName": "",
                "team": "A" if number <= args.team_size else "B",
                "goalkeeper": number in (1, args.team_size + 1),
            }
            for number in range(1, args.team_size * 2 + 1)
        ],
    }
    Path(args.out).write_text(
        json.dumps(template, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Feuille de match vierge écrite dans {args.out}.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="uno-vision",
        description="Analyse vidéo des sessions UNO League.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    frame = subparsers.add_parser("frame", help="exporte une image à calibrer")
    frame.add_argument("--video", required=True)
    frame.add_argument("--out", default="frame.png")
    frame.add_argument("--at", type=int, default=0, help="numéro d'image")
    frame.set_defaults(handler=_command_frame)

    calibrate = subparsers.add_parser("calibrate", help="décrit une salle")
    calibrate.add_argument(
        "--points",
        required=True,
        type=_parse_points,
        help="coins du terrain en pixels : \"x,y x,y x,y x,y\"",
    )
    calibrate.add_argument(
        "--field-points",
        type=_parse_field_points,
        help=(
            "coordonnées terrain en mètres des mêmes repères, dans le même "
            "ordre : \"x,y x,y …\". À utiliser quand le terrain n'est pas "
            "entier dans le cadre — poteaux, coins de surface, rond central. "
            "Par défaut, les quatre coins du terrain sont supposés."
        ),
    )
    calibrate.add_argument("--out", default="calibration.json")
    calibrate.add_argument(
        "--preset",
        choices=("futsal", "five-a-side"),
        default="futsal",
        help="dimensions de départ ; --length et --width les remplacent",
    )
    calibrate.add_argument("--length", type=float)
    calibrate.add_argument("--width", type=float)
    calibrate.add_argument("--goal-width", type=float, default=3.0)
    calibrate.add_argument("--team-a-defends", choices=("left", "right"), default="left")
    calibrate.add_argument("--venue", default="")
    calibrate.add_argument(
        "--lens-lines",
        type=_parse_lines,
        help=(
            "points cliqués le long de droites réelles (bas d'un panneau, ligne "
            "de surface), pour corriger la distorsion du grand-angle : "
            "\"x,y x,y x,y ; x,y x,y x,y\""
        ),
    )
    calibrate.add_argument(
        "--optical-center",
        action="store_true",
        help=(
            "cherche aussi le centre optique, utile sur les caméras d'arène "
            "recadrées ; exige au moins deux lignes d'orientations différentes"
        ),
    )
    calibrate.add_argument(
        "--image-size",
        type=_parse_size,
        default=(1280, 720),
        help="résolution de l'image ayant servi aux relevés, par ex. 1280x720",
    )
    calibrate.set_defaults(handler=_command_calibrate)

    analyze = subparsers.add_parser("analyze", help="analyse une vidéo (GPU)")
    analyze.add_argument("--video", required=True)
    analyze.add_argument("--calibration", required=True)
    analyze.add_argument("--roster", help="feuille d'un match unique")
    analyze.add_argument(
        "--session", help="enchaînement des matchs de la session (remplace --roster)"
    )
    analyze.add_argument("--out", default="out")
    analyze.add_argument("--config")
    analyze.add_argument("--weights", default="yolov8m.pt")
    analyze.add_argument("--device", default=None, help="cuda:0, cpu, mps…")
    analyze.add_argument("--stride", type=int, default=1)
    analyze.add_argument("--no-bibs", action="store_true")
    analyze.add_argument("--no-clips", action="store_true")
    analyze.set_defaults(handler=_command_analyze)

    replay = subparsers.add_parser(
        "replay", help="rejoue les règles sur des observations en cache"
    )
    replay.add_argument("--observations", required=True)
    replay.add_argument("--calibration", required=True)
    replay.add_argument("--roster", help="feuille d'un match unique")
    replay.add_argument(
        "--session", help="enchaînement des matchs de la session (remplace --roster)"
    )
    replay.add_argument("--out", default="out")
    replay.add_argument("--config")
    replay.add_argument("--video", help="source des extraits, facultative")
    replay.add_argument("--no-clips", action="store_true")
    replay.set_defaults(handler=_command_replay)

    reference = subparsers.add_parser(
        "reference",
        help="lit le tableau du centre pour servir de repère d'évaluation",
    )
    reference.add_argument("--video", required=True)
    reference.add_argument("--out", default="reference.json")
    reference.add_argument("--stride", type=int, default=25)
    reference.set_defaults(handler=_command_reference)

    evaluate = subparsers.add_parser(
        "evaluate", help="compare les buts détectés au repère"
    )
    evaluate.add_argument("--report", required=True)
    evaluate.add_argument("--reference", required=True)
    evaluate.add_argument("--tolerance", type=float, default=20.0)
    evaluate.set_defaults(handler=_command_evaluate)

    review = subparsers.add_parser(
        "review", help="page de validation des événements par l'arbitre"
    )
    review.add_argument("--report", required=True)
    review.add_argument("--out", help="par défaut review.html à côté du rapport")
    review.add_argument(
        "--video",
        help=(
            "vidéo de session à laquelle la page se positionne (chemin ou URL) ; "
            "évite d'avoir à découper des extraits"
        ),
    )
    review.add_argument("--before", type=float, default=5.0,
                        help="secondes montrées avant l'action")
    review.add_argument("--after", type=float, default=3.0,
                        help="secondes montrées après l'action")
    review.add_argument("--title", default="Validation UNO League")
    review.set_defaults(handler=_command_review)

    apply_review = subparsers.add_parser(
        "apply-review", help="applique les décisions et recalcule la feuille"
    )
    apply_review.add_argument("--report", required=True)
    apply_review.add_argument("--corrections", required=True)
    apply_review.add_argument("--out")
    apply_review.set_defaults(handler=_command_apply_review)

    session = subparsers.add_parser(
        "session-template", help="trame d'enchaînement de matchs à compléter"
    )
    session.add_argument("--out", default="session.json")
    session.add_argument("--matches", type=int, default=6)
    session.add_argument("--minutes", type=float, default=10.0)
    session.add_argument("--team-size", type=int, default=5)
    session.set_defaults(handler=_command_session_template)

    template = subparsers.add_parser(
        "roster-template", help="feuille de match vierge à compléter"
    )
    template.add_argument("--out", default="roster.json")
    template.add_argument("--team-size", type=int, default=5)
    template.set_defaults(handler=_command_roster_template)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command in ("analyze", "replay") and not (args.roster or args.session):
        parser.error(
            "précisez --roster pour un match isolé, ou --session pour "
            "l'enchaînement d'une session"
        )
    return int(args.handler(args))


if __name__ == "__main__":
    raise SystemExit(main())
