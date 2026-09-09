"""Extraction des extraits vidéo qui accompagnent chaque événement.

Un score de confiance ne se vérifie pas : un extrait de six secondes, si. C'est
le seul moyen pour l'arbitre de valider une feuille de match en deux minutes
plutôt que de revoir quarante minutes de vidéo — et c'est ce qui rend le mode
« assistant » réellement plus rapide que la saisie manuelle.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any


class FfmpegMissingError(RuntimeError):
    pass


def ensure_ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if path is None:
        raise FfmpegMissingError(
            "ffmpeg est introuvable : installez-le pour produire les extraits "
            "(apt install ffmpeg, ou brew install ffmpeg)."
        )
    return path


def extract_clip(
    video_path: str | Path,
    output_path: str | Path,
    start_s: float,
    duration_s: float,
) -> Path:
    """Découpe un extrait ré-encodé à partir de la vidéo source.

    Le ré-encodage est délibéré : une découpe par copie de flux se cale sur
    l'image clé précédente et peut décaler l'extrait de plusieurs secondes, ce
    qui mettrait le but hors du clip censé le montrer.
    """
    ffmpeg = ensure_ffmpeg()
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-ss", f"{max(0.0, start_s):.3f}",
        "-i", str(video_path),
        "-t", f"{max(0.5, duration_s):.3f}",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "26",
        "-an",
        str(output),
    ]
    subprocess.run(command, check=True, capture_output=True)
    return output


def extract_event_clips(
    video_path: str | Path,
    report: dict[str, Any],
    output_dir: str | Path,
    seconds_before: float = 5.0,
    seconds_after: float = 3.0,
) -> dict[str, str]:
    """Produit un extrait par événement et renvoie `id d'événement → fichier`."""
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)
    clips: dict[str, str] = {}
    for event in report.get("events", []):
        start = max(0.0, event["timeMs"] / 1000.0 - seconds_before)
        destination = directory / f"{event['id']}.mp4"
        extract_clip(
            video_path, destination, start, seconds_before + seconds_after
        )
        clips[event["id"]] = str(destination)
    return clips
