"""Monte la publicité UNO League à partir des plans générés sur Higgsfield.

    python3 docs/publicite/cartons.py docs/publicite/rendu/cards
    python3 docs/publicite/monte.py docs/publicite/rendu

Le dossier de travail (ignoré par git) contient vid/sNN.mp4 (les plans),
aud/voNN.wav (la voix off, silences de tête et de queue retirés),
aud/music_a.mp3 (la musique) et cards/*.png (les cartons). Le film sort dans
out/. Le découpage est dans EDL ci-dessous : c'est la seule chose à retoucher
pour changer le rythme, tout le reste s'en déduit.
"""

import json
import pathlib
import shlex
import subprocess
import sys

FPS = 24
W, H = 1920, 1080

# --- Découpage -------------------------------------------------------------
# (source, point d'entrée en s, durée en s, gain de l'ambiance du plan en dB)
# Une source "card:xx" est un carton fixe, sans son.
EDL = [
    ("s01", 0.00, 3.70, -4),  # rue, pluie, tram
    ("s02", 0.20, 2.80, -6),  # lacets
    ("s03", 1.50, 3.00, -8),  # chasuble, regard caméra (impact musical à 6,5 s)
    ("s04", 0.50, 4.00, -8),  # la salle, trois équipes
    ("s05", 1.20, 2.60, -4),  # coup d'envoi (impact musical à 13,5 s)
    ("s06", 0.00, 3.00, -12),  # dribble
    ("s07", 1.20, 2.60, -14),  # le banc qui attend
    ("s08", 0.30, 2.30, -12),  # arrêt du gardien
    ("s09", 0.00, 1.90, -10),  # frappe (sur le temps fort à 24 s)
    ("s13", 0.40, 1.40, -10),  # le ballon fonce vers l'objectif
    ("s10", 0.30, 3.00, -10),  # célébration
    ("card:d3", 0, 1.00, None),
    ("card:d2", 0, 1.00, None),
    ("card:d1", 0, 1.50, None),
    ("s11", 0.30, 4.00, -10),  # le téléphone, la carte
    ("s12", 2.60, 7.30, 0),  # la salle s'éteint (musique coupée)
    ("card:question", 0, 2.20, None),
    ("card:fin", 0, 6.00, None),
]

# Voix off : (fichier, plan d'ancrage, décalage en s depuis le début du plan)
VO = [
    ("vo01", "s01", 0.70),  # Ici… personne ne connaît ton nom.
    ("vo02", "s02", 0.20),  # Tout le monde commence en bas. Division trois.
    ("vo03", "s04", 0.40),  # Trois équipes. Dix minutes.
    ("vo04", "s06", 0.30),  # Celui qui gagne… reste.
    ("vo05", "s07", 0.40),  # Les autres regardent.
    ("vo06", "s08", 0.30),  # Chaque arrêt compte.
    ("vo07", "s09", 0.10),  # Chaque but compte.
    ("vo08", "card:d3", 0.10),  # Cinq montent. Cinq descendent.
    ("vo09", "s11", 0.60),  # Et ta carte… n'oublie rien.
    ("vo10", "s12", 1.00),  # La semaine prochaine, tout se rejoue.
    ("vo11", "card:question", 0.20),  # Alors… tu restes ?
]
VO_TEMPO = 0.92  # un débit plus posé que la synthèse brute
MUSIC_CUT_AT = "s12"  # la musique s'arrête net quand la salle s'éteint
HIT_SRC = (0.0, 6.0)  # l'impact d'ouverture de la musique, réutilisé sur le carton de fin
LETTERBOX = 2.39  # format scope ; None pour garder le 16:9 plein cadre

GRADE = "eq=contrast=1.05:saturation=0.94:gamma=0.98,colorbalance=rs=-0.03:bs=0.03:rh=0.03:bh=-0.03"
NORM = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,fps={FPS}"
SILENCE = "-f lavfi -t {t:.4f} -i anullsrc=r=48000:cl=stereo"


def ff(args):
    """Lance ffmpeg ; args est une ligne de commande, chemins déjà protégés par q()."""
    subprocess.run(["ffmpeg", "-v", "error", "-y", *shlex.split(args)], check=True)


def q(path):
    return shlex.quote(str(path))


def main():
    root = pathlib.Path(sys.argv[1])
    work = root / "work"
    work.mkdir(exist_ok=True)
    (root / "out").mkdir(exist_ok=True)
    x264 = "-c:v libx264 -crf 12 -preset fast"

    # 1. Chaque plan, normalisé en 1920 x 1080 à 24 i/s, et son ambiance à part.
    segs, t = [], 0.0
    for i, (src, start, dur, gain) in enumerate(EDL):
        n = round(dur * FPS)
        dur = n / FPS
        v, a = work / f"seg{i:02}.mp4", work / f"seg{i:02}.wav"
        if src.startswith("card:"):
            img = root / "cards" / f"{src[5:]}.png"
            ff(f"-loop 1 -i {q(img)} -frames:v {n} -vf {NORM},format=yuv420p {x264} {q(v)}")
            ff(f"{SILENCE.format(t=dur)} {q(a)}")
        else:
            clip = root / "vid" / f"{src}.mp4"
            ff(f"-ss {start:.3f} -i {q(clip)} -frames:v {n} -vf {NORM},{GRADE},format=yuv420p -an {x264} {q(v)}")
            son = (
                f"aresample=48000,volume={gain}dB,afade=t=in:d=0.02,afade=t=out:st={max(dur - 0.04, 0):.3f}:d=0.04,apad"
            )
            ff(f"-ss {start:.3f} -i {q(clip)} -t {dur:.4f} -af {son} -ac 2 -t {dur:.4f} {q(a)}")
        segs.append((v, a, t, dur, src))
        t += dur
    total = t
    start_of = {s[4]: s[2] for s in segs}

    (work / "v.txt").write_text("".join(f"file '{s[0].name}'\n" for s in segs))
    (work / "a.txt").write_text("".join(f"file '{s[1].name}'\n" for s in segs))
    ff(f"-f concat -safe 0 -i {q(work / 'v.txt')} -c copy {q(work / 'video.mp4')}")
    ff(f"-f concat -safe 0 -i {q(work / 'a.txt')} {q(work / 'ambiance.wav')}")

    # 2. Voix off : ralentie, nettoyée, posée à son instant. Une piste muette de
    # la durée du film fixe l'instant zéro et la longueur. Ne pas la remplacer
    # par apad + atrim : combinés à atempo, ils avancent toute la voix off de la
    # durée du premier silence (constaté avec ffmpeg 6.1).
    entrees, parts = [], []
    for k, (name, anchor, offset) in enumerate(VO):
        ms = round((start_of[anchor] + offset) * 1000)
        entrees.append(f"-i {q(root / 'aud' / f'{name}.wav')}")
        parts.append(
            f"[{k}:a]atempo={VO_TEMPO},asetpts=N/SR/TB,highpass=f=80,"
            f"acompressor=threshold=-20dB:ratio=3:attack=5:release=120,adelay={ms}|{ms}[v{k}]"
        )
    entrees.append(SILENCE.format(t=total))
    voix = "".join(f"[v{k}]" for k in range(len(VO))) + f"[{len(VO)}:a]"
    graphe = ";".join(parts) + f";{voix}amix=inputs={len(VO) + 1}:normalize=0[vo]"
    ff(f"{' '.join(entrees)} -filter_complex {graphe} -map [vo] -ar 48000 -ac 2 {q(work / 'vo.wav')}")

    # 3. Musique : jusqu'à la coupure, puis l'impact d'ouverture sur le carton de fin.
    music = q(root / "aud" / "music_a.mp3")
    cut, hit_ms = start_of[MUSIC_CUT_AT], round(start_of["card:fin"] * 1000)
    graphe = (
        f"[0:a]atrim=0:{cut},afade=t=out:st={cut - 0.03}:d=0.03,asetpts=PTS-STARTPTS[m1];"
        f"[1:a]atrim={HIT_SRC[0]}:{HIT_SRC[1]},asetpts=PTS-STARTPTS,"
        f"afade=t=out:st={HIT_SRC[1] - HIT_SRC[0] - 1.5}:d=1.5,adelay={hit_ms}|{hit_ms}[m2];"
        f"[2:a][m1][m2]amix=inputs=3:normalize=0[m]"
    )
    ff(
        f"-i {music} -i {music} {SILENCE.format(t=total)} -filter_complex {graphe} -map [m] -ar 48000 -ac 2 "
        f"{q(work / 'musique.wav')}"
    )

    # 4. Mixage : la musique s'efface sous la voix, l'ambiance des plans reste dessous.
    graphe = (
        "[1:a]asplit=2[vo1][vo2];[0:a]volume=-7dB[mu];"
        "[mu][vo1]sidechaincompress=threshold=0.02:ratio=8:attack=10:release=400[duck];"
        "[vo2]volume=4dB[vo];[duck][vo][2:a]amix=inputs=3:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=11[out]"
    )
    ff(
        f"-i {q(work / 'musique.wav')} -i {q(work / 'vo.wav')} -i {q(work / 'ambiance.wav')} "
        f"-filter_complex {graphe} -map [out] -ar 48000 -ac 2 {q(work / 'mix.wav')}"
    )

    # 5. Image finale : grain léger et bandes cinéma.
    look = "noise=alls=4:allf=t"
    if LETTERBOX:
        bar = round((H - W / LETTERBOX) / 2)
        look += f",drawbox=x=0:y=0:w={W}:h={bar}:color=black:t=fill,drawbox=x=0:y={H - bar}:w={W}:h={bar}:color=black:t=fill"
    out = root / "out" / "uno-league-pub-16x9.mp4"
    ff(
        f"-i {q(work / 'video.mp4')} -i {q(work / 'mix.wav')} -vf {look},format=yuv420p "
        "-c:v libx264 -crf 20 -maxrate 12M -bufsize 24M -preset slow -profile:v high "
        f"-c:a aac -b:a 256k -movflags +faststart -shortest {q(out)}"
    )
    plans = [(s[4], round(s[2], 2), round(s[3], 2)) for s in segs]
    print(json.dumps({"sortie": str(out), "duree": round(total, 2), "plans": plans}, ensure_ascii=False))


if __name__ == "__main__":
    main()
