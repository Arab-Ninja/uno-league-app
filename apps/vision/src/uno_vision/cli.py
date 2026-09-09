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
from .observations import read_observations, write_observations
from .pipeline import analyse_observations
from .report import VideoInfo, format_summary
from .roster import Roster
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
    return 0


def _command_calibrate(args: argparse.Namespace) -> int:
    calibration = Calibration(
        field=FieldDimensions(
            length_m=args.length,
            width_m=args.width,
            goal_width_m=args.goal_width,
        ),
        image_points=args.points,
        team_a_defends=args.team_a_defends,
        venue=args.venue,
    )
    # Vérification immédiate : une homographie qui ne se calcule pas doit être
    # signalée maintenant, pas trois heures de GPU plus tard.
    center = calibration.to_image(calibration.field.center)
    calibration.save(args.out)
    print(f"Calibration écrite dans {args.out}.")
    print(
        f"Contrôle : le rond central tombe en ({center.x:.0f}, {center.y:.0f}) px. "
        "Vérifiez que ce point est bien au centre du terrain sur l'image."
    )
    return 0


def _command_analyze(args: argparse.Namespace) -> int:
    from .video.analyze import analyse_video

    calibration = Calibration.load(args.calibration)
    roster = Roster.load(args.roster)
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
    roster = Roster.load(args.roster)
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
    calibrate.add_argument("--out", default="calibration.json")
    calibrate.add_argument("--length", type=float, default=40.0)
    calibrate.add_argument("--width", type=float, default=20.0)
    calibrate.add_argument("--goal-width", type=float, default=3.0)
    calibrate.add_argument("--team-a-defends", choices=("left", "right"), default="left")
    calibrate.add_argument("--venue", default="")
    calibrate.set_defaults(handler=_command_calibrate)

    analyze = subparsers.add_parser("analyze", help="analyse une vidéo (GPU)")
    analyze.add_argument("--video", required=True)
    analyze.add_argument("--calibration", required=True)
    analyze.add_argument("--roster", required=True)
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
    replay.add_argument("--roster", required=True)
    replay.add_argument("--out", default="out")
    replay.add_argument("--config")
    replay.add_argument("--video", help="source des extraits, facultative")
    replay.add_argument("--no-clips", action="store_true")
    replay.set_defaults(handler=_command_replay)

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
    return int(args.handler(args))


if __name__ == "__main__":
    raise SystemExit(main())
