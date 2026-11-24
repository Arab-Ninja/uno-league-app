"""Bande-son de la vidéo « Comment ça marche » : funk brésilien / phonk,
130 bpm, fa mineur, 22 mesures (40,6 s).

Tout est synthétisé ici, sans échantillon extérieur : aucun droit à gérer,
et chaque son tombe sur son image. Le phonk est fait de sons de boîte à
rythmes 808 (cloche, basse, claquement), qui se synthétisent par nature :
la cloche est la vraie recette de la TR-808, deux ondes carrées à 540 et
800 Hz, transposées pour jouer la mélodie.

Les instants reprennent ceux de `scenes.js` (même tempo, mêmes mesures).

    python3 docs/video-amical/son.py   →   docs/video-amical/rendu/son.wav

Ne demande que numpy. Le niveau final (-14 LUFS, la norme des réseaux) est
réglé par ffmpeg au mixage, dans `rendu.mjs`.
"""

import os
import wave

import numpy as np

SR = 48000
TEMPS = 60 / 130
MESURE = 4 * TEMPS
DOUBLE = TEMPS / 4  # une double croche
DUREE = 22 * MESURE
N = int(SR * DUREE) + SR // 2
ALEA = np.random.default_rng(130)


def m(n):
    """Instant de la mesure n (en secondes)."""
    return n * MESURE


musique = np.zeros((N, 2))  # tout ce qui suit la grille
basse_bus = np.zeros((N, 2))  # la basse 808, que la grosse caisse fait respirer
effets = np.zeros((N, 2))  # bruitages calés sur les images
envoi = np.zeros((N, 2))  # vers la réverbération
pompe = np.ones(N)


# --- Outils --------------------------------------------------------------------


def temps(n):
    return np.arange(n) / SR


def bruit(n):
    return ALEA.standard_normal(n)


def filtre(x, bas=None, haut=None, ordre=4):
    """Passe-bas (`bas`) et passe-haut (`haut`) doux, par FFT."""
    n = len(x)
    spectre = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    masque = np.ones_like(f)
    if bas:
        masque /= np.sqrt(1 + (f / bas) ** (2 * ordre))
    if haut:
        masque /= np.sqrt(1 + (haut / np.maximum(f, 1.0)) ** (2 * ordre))
    return np.fft.irfft(spectre * masque, n)


def bande(x, centre, largeur):
    """Passe-bande en cloche (gaussienne en octaves), par FFT."""
    n = len(x)
    spectre = np.fft.rfft(x)
    f = np.maximum(np.fft.rfftfreq(n, 1 / SR), 1.0)
    octaves = np.log2(f / centre)
    return np.fft.irfft(spectre * np.exp(-0.5 * (octaves / largeur) ** 2), n)


def svf(x, frequences, amorti=0.8):
    """Filtre passe-bande dont la fréquence change à chaque échantillon."""
    y = np.zeros_like(x)
    bas = bnd = 0.0
    coeffs = 2 * np.sin(np.pi * np.minimum(frequences, SR / 6.5) / SR)
    for i in range(len(x)):
        f = coeffs[i]
        bas += f * bnd
        haut = x[i] - bas - amorti * bnd
        bnd += f * haut
        y[i] = bnd
    return y


def place(bus, son, instant, gain=1.0, pan=0.0, reverb=0.0):
    """Pose un son (mono ou stéréo) sur un bus, à un instant donné."""
    debut = int(round(instant * SR))
    if debut >= N or debut + len(son) <= 0:
        return
    if son.ndim == 1:
        g = np.cos((pan + 1) * np.pi / 4)
        d = np.sin((pan + 1) * np.pi / 4)
        son = np.stack([son * g, son * d], axis=1) * np.sqrt(2)
    if debut < 0:
        son = son[-debut:]
        debut = 0
    fin = min(N, debut + len(son))
    bus[debut:fin] += son[: fin - debut] * gain
    if reverb:
        envoi[debut:fin] += son[: fin - debut] * gain * reverb


NOTES = {"C": -9, "C#": -8, "Db": -8, "D": -7, "D#": -6, "Eb": -6, "E": -5, "F": -4, "F#": -3, "Gb": -3, "G": -2, "G#": -1, "Ab": -1, "A": 0, "A#": 1, "Bb": 1, "B": 2}


def note(nom):
    """« F5 », « Ab4 », « Db6 » → fréquence en hertz."""
    return 440.0 * 2 ** ((NOTES[nom[:-1]] + (int(nom[-1]) - 4) * 12) / 12)


def carree(f, t, plafond=9000.0):
    """Onde carrée à bande limitée (harmoniques impairs)."""
    y = np.zeros_like(t)
    k = 1
    while k * f < plafond:
        y += np.sin(2 * np.pi * k * f * t) / k
        k += 2
    return y * 4 / np.pi


def scie(f, t, plafond=6000.0):
    y = np.zeros_like(t)
    for k in range(1, max(2, int(plafond / f)) + 1):
        y += (-1) ** (k + 1) * np.sin(2 * np.pi * k * f * t) / k
    return y * 0.6


# --- Instruments 808 -----------------------------------------------------------


def cloche(f):
    """La cloche de la TR-808, transposée : deux carrées dans un rapport 800/540."""
    n = int(0.42 * SR)
    t = temps(n)
    y = carree(f, t) * 0.6 + carree(f * 800 / 540, t) * 0.5
    y = bande(y, 2.2 * f, 0.9) + 0.25 * filtre(y, bas=6500)
    env = 0.75 * np.exp(-t / 0.018) + 0.35 * np.exp(-t / 0.16)
    y = y * env * (1 - np.exp(-t / 0.0007))
    return np.tanh(1.8 * y) * 0.5


def grosse_caisse():
    n = int(0.3 * SR)
    t = temps(n)
    phase = 2 * np.pi * np.cumsum(55 + 140 * np.exp(-t / 0.025)) / SR
    corps = np.sin(phase) * np.exp(-t / 0.11)
    clic = filtre(bruit(n), haut=2500) * np.exp(-t / 0.0025) * 0.45
    return np.tanh(2.2 * (corps + clic)) * 0.85


def basse(f, duree, glisse_de=None):
    """La 808 saturée : un sinus qui descend, très long, poussé dans la saturation."""
    n = int(duree * SR)
    t = temps(n)
    depart = glisse_de if glisse_de else f * 1.9
    tenu = depart + (f - depart) * (1 - np.exp(-t / (0.06 if glisse_de else 0.022)))
    y = np.sin(2 * np.pi * np.cumsum(tenu) / SR)
    env = np.exp(-t / 0.4) * np.minimum(1, (duree - t) / 0.025) * (1 - np.exp(-t / 0.002))
    sale = np.tanh(3.2 * y) / np.tanh(3.2)
    return filtre(0.55 * sale + 0.6 * y, bas=1800) * env * 0.8


def claquement():
    n = int(0.45 * SR)
    t = temps(n)
    b = filtre(bruit(n), bas=5000, haut=1000)
    env = sum(np.exp(-(t - d) / 0.006) * (t >= d) for d in (0.0, 0.010, 0.020))
    env = env + 0.8 * np.exp(-np.maximum(0, t - 0.028) / 0.09) * (t >= 0.028)
    corps = np.sin(2 * np.pi * 210 * t) * np.exp(-t / 0.03) * 0.3
    return (b * env * 0.55 + corps) * 0.9


def charley(ouvert=False):
    n = int((0.28 if ouvert else 0.06) * SR)
    t = temps(n)
    metal = sum(carree(f, t, plafond=16000) for f in (317, 465, 539, 621, 822)) / 5
    y = filtre(metal * 0.6 + bruit(n) * 0.5, haut=7200, bas=14000)
    return y * np.exp(-t / (0.09 if ouvert else 0.016)) * 0.28


def tamborim():
    """Le petit tambour aigu des écoles de samba, en doubles croches."""
    n = int(0.09 * SR)
    t = temps(n)
    ton = np.sin(2 * np.pi * 980 * t) * np.exp(-t / 0.025)
    peau = filtre(bruit(n), bas=6000, haut=1500) * np.exp(-t / 0.008) * 0.5
    return (ton * 0.6 + peau) * 0.35


def coup_orchestre(notes, duree=0.55):
    """Un accord sec, cuivré : l'« orchestra hit » du funk carioca."""
    n = int(duree * SR)
    t = temps(n)
    y = np.zeros(n)
    for nom in notes:
        for detune in (-12, 0, 9):
            y += scie(note(nom) * 2 ** (detune / 1200), t, plafond=7000)
    y = filtre(y / (3 * len(notes)), bas=3200, haut=150)
    env = np.exp(-t / 0.16) * (1 - np.exp(-t / 0.002))
    return np.tanh(2.0 * y * env) * 0.6


def caisse_claire():
    n = int(0.3 * SR)
    t = temps(n)
    b = filtre(bruit(n), bas=8000, haut=1500) * np.exp(-t / 0.07)
    ton = np.sin(2 * np.pi * 200 * t) * np.exp(-t / 0.035)
    return (b * 0.6 + ton * 0.45) * 0.6


# --- Bruitages ------------------------------------------------------------------


def sifflet(duree=0.55):
    """Le sifflet d'arbitre : un sifflement aigu, roulé par la bille."""
    n = int(duree * SR)
    t = temps(n)
    roule = 1 + 0.035 * np.sin(2 * np.pi * 46 * t + 0.4 * np.sin(2 * np.pi * 7 * t))
    f = 3050 * roule
    ton = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.25 * np.sin(2 * np.pi * np.cumsum(2 * f) / SR)
    souffle = bande(bruit(n), 3100, 0.35) * 0.5
    trem = 0.8 + 0.2 * np.sin(2 * np.pi * 46 * t)
    env = np.minimum(1, t / 0.015) * np.minimum(1, (duree - t) / 0.04)
    return (ton * 0.55 + souffle) * trem * env * 0.45


def tir():
    """Le ballon frappé : un « poc » sourd et creux."""
    n = int(0.22 * SR)
    t = temps(n)
    corps = np.sin(2 * np.pi * np.cumsum(140 + 260 * np.exp(-t / 0.006)) / SR) * np.exp(-t / 0.045)
    cuir = filtre(bruit(n), bas=2500, haut=300) * np.exp(-t / 0.008) * 0.7
    return np.tanh(2.5 * (corps + cuir)) * 0.7


def salle(duree):
    """L'ambiance d'une salle de futsal : voix lointaines, échos."""
    n = int(duree * SR)
    t = temps(n)
    spectre = np.fft.rfft(bruit(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    rose = np.fft.irfft(spectre / np.sqrt(np.maximum(f, 20)), n)
    voix = filtre(rose, bas=2200, haut=250)
    voix /= np.max(np.abs(voix)) + 1e-9
    noyau = np.hanning(int(0.12 * SR))
    ondes = np.convolve(bruit(n), noyau / noyau.sum(), mode="same")
    ondes = 0.7 + 0.3 * ondes / (np.max(np.abs(ondes)) + 1e-9)
    env = np.minimum(1, t / 0.4) * np.minimum(1, (duree - t) / 0.5)
    return voix * ondes * env * 0.35


def impact(force=1.0, duree=1.6):
    n = int(duree * SR)
    t = temps(n)
    boum = np.sin(2 * np.pi * np.cumsum(40 + 90 * np.exp(-t / 0.04)) / SR) * np.exp(-t / 0.5)
    souffle = filtre(bruit(n), bas=3000) * np.exp(-t / 0.12) * 0.5
    craque = filtre(bruit(n), haut=3000) * np.exp(-t / 0.015) * 0.35
    return np.tanh(1.4 * (boum + souffle + craque)) * force


def cymbale(duree=2.2):
    n = int(duree * SR)
    t = temps(n)
    b = filtre(bruit(n), haut=4000) + 0.5 * bande(bruit(n), 7000, 0.4)
    return b * np.exp(-t / 0.6) * (1 - np.exp(-t / 0.002)) * 0.25


def souffle_air(duree=0.45, f0=300.0, f1=4000.0, f2=900.0):
    """Un « whoosh » : du bruit dans un filtre qui monte puis redescend."""
    n = int(duree * SR)
    s = np.linspace(0, 1, n)
    fc = np.where(s < 0.6, f0 * (f1 / f0) ** (s / 0.6), f1 * (f2 / f1) ** ((s - 0.6) / 0.4))
    return svf(bruit(n), fc, amorti=0.9) * np.sin(np.pi * s) ** 1.4 * 0.8


def montee(duree=1.2):
    n = int(duree * SR)
    s = np.linspace(0, 1, n)
    fc = 300 * (10000 / 300) ** s
    b = svf(bruit(n), fc, amorti=1.0)
    ton = np.sin(2 * np.pi * np.cumsum(180 * (1400 / 180) ** s) / SR) * 0.12
    return (b * 0.8 + ton) * s**2.2 * np.minimum(1, (1 - s) * n / (0.01 * SR))


def toucher():
    n = int(0.05 * SR)
    t = temps(n)
    return (np.sin(2 * np.pi * 1600 * t) * np.exp(-t / 0.008) * 0.5 + filtre(bruit(n), haut=3500) * np.exp(-t / 0.002) * 0.5) * 0.6


def bulle(f0=900.0, f1=320.0):
    n = int(0.1 * SR)
    t = temps(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.014)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035) * (1 - np.exp(-t / 0.001)) * 0.55


def tinte(f=1760.0, duree=1.2):
    n = int(duree * SR)
    t = temps(n)
    y = np.zeros(n)
    for rapport, amplitude, extinction in ((1, 1.0, 0.6), (2.0, 0.35, 0.3), (2.76, 0.25, 0.22), (5.4, 0.1, 0.12)):
        y += amplitude * np.sin(2 * np.pi * f * rapport * t) * np.exp(-t / extinction)
    return y * (1 - np.exp(-t / 0.002)) * 0.3


def rembobine():
    n = int(0.22 * SR)
    s = np.linspace(0, 1, n)
    f = 2600 * (160 / 2600) ** s
    y = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.5 + filtre(bruit(n), haut=2000) * 0.4
    hache = (np.sin(2 * np.pi * 40 * temps(n)) > -0.3).astype(float)
    return filtre(y * hache, bas=5000) * np.sin(np.pi * s) ** 0.7 * 0.3


def reverberation(x, duree=1.5, extinction=0.45):
    n = int(duree * SR)
    t = temps(n)
    sortie = np.zeros_like(x)
    taille = 1 << int(np.ceil(np.log2(len(x) + n)))
    for canal in range(2):
        ir = filtre(bruit(n), bas=6000, haut=300) * np.exp(-t / extinction)
        ir[: int(0.015 * SR)] = 0
        ir /= np.sqrt(np.sum(ir**2))
        sortie[:, canal] = np.fft.irfft(np.fft.rfft(x[:, canal], taille) * np.fft.rfft(ir, taille), taille)[: len(x)]
    return sortie


# --- Instruments pré-calculés -----------------------------------------------------

GC = grosse_caisse()
CLAP = claquement()
CH = charley()
CHO = charley(ouvert=True)
TAMB = tamborim()
CC = caisse_claire()
CLOCHES = {}


def cloche_note(nom):
    if nom not in CLOCHES:
        CLOCHES[nom] = cloche(note(nom))
    return CLOCHES[nom]


# --- La musique -------------------------------------------------------------------
#
# Le motif « tamborzão » du funk carioca, sur 16 doubles croches :
# grosse caisse 1 . . 1 . . 1 . . . 1 . . 1 . . ; claquement sur 2 et 4.

GROSSE = [0, 3, 6, 10, 13]
CLAPS = [4, 12]
# La cloche, en fa mineur, sur deux mesures (double croche, note).
RIFF_A = [
    [(0, "F5"), (2, "F5"), (3, "Ab5"), (5, "F5"), (6, "C6"), (8, "Bb5"), (10, "Ab5"), (11, "G5"), (13, "F5"), (14, "Eb5")],
    [(0, "F5"), (2, "F5"), (3, "Ab5"), (5, "F5"), (6, "C6"), (8, "Db6"), (10, "C6"), (11, "Bb5"), (13, "Ab5"), (14, "G5")],
]
RIFF_B = [
    [(0, "C6"), (1, "C6"), (3, "Ab5"), (4, "F5"), (6, "F5"), (7, "Ab5"), (9, "Bb5"), (10, "C6"), (12, "Eb6"), (14, "Db6")],
    [(0, "C6"), (1, "C6"), (3, "Ab5"), (4, "F5"), (6, "F5"), (7, "Ab5"), (9, "G5"), (10, "Ab5"), (12, "Bb5"), (14, "C6")],
]
# La basse suit la grosse caisse ; une couleur par demi-phrase.
BASSE = [
    {0: "F1", 3: "F1", 6: "F1", 10: "Ab1", 13: "Eb1"},
    {0: "F1", 3: "F1", 6: "F1", 10: "Db1", 13: "C1"},
]

# Ce que joue chaque mesure : (cloche, batterie, basse, tamborim, coupure).
PLAN = {}
for b in range(22):
    PLAN[b] = dict(riff=RIFF_A, batterie=True, basse=True, tamb=False, filtre=None, coupe_fin=False)
PLAN[0].update(riff=RIFF_A, batterie=False, basse=False, filtre=900)
PLAN[1].update(riff=RIFF_A, batterie=False, basse=False, filtre=2600, coupe_fin=True)
for b in range(11, 19):
    PLAN[b].update(riff=RIFF_B, tamb=True)
PLAN[10].update(batterie=False, filtre=1400)
PLAN[18].update(coupe_fin=True)
for b in range(19, 22):
    PLAN[b].update(riff=RIFF_A, tamb=True)


def en_coupure(b, pas):
    """La dernière demi-mesure avant une relance reste vide (tension)."""
    return PLAN[b]["coupe_fin"] and pas >= 8


for b in range(22):
    plan = PLAN[b]
    debut = m(b)
    phrase = b % 2
    # Cloche
    for pas, nom in plan["riff"][phrase]:
        if en_coupure(b, pas):
            continue
        son = cloche_note(nom)
        if plan["filtre"]:
            son = filtre(son, bas=plan["filtre"])
        place(musique, son, debut + pas * DOUBLE, gain=0.72, pan=(-0.15 if pas % 2 else 0.15), reverb=0.18)
    # Batterie
    if plan["batterie"]:
        for pas in GROSSE:
            if en_coupure(b, pas):
                continue
            instant = debut + pas * DOUBLE
            place(musique, GC, instant, gain=0.95)
            i0 = int(instant * SR)
            i1 = min(N, i0 + int(0.22 * SR))
            pompe[i0:i1] = np.minimum(pompe[i0:i1], 1 - 0.55 * np.exp(-temps(i1 - i0) / 0.06))
        for pas in CLAPS:
            if not en_coupure(b, pas):
                place(musique, CLAP, debut + pas * DOUBLE, gain=0.85, reverb=0.25)
        for pas in range(16):
            if en_coupure(b, pas):
                continue
            accent = 1.0 if pas % 2 else 0.55
            place(musique, CH, debut + pas * DOUBLE, gain=0.6 * accent, pan=0.3)
        if not en_coupure(b, 14):
            place(musique, CHO, debut + 14 * DOUBLE, gain=0.5, pan=-0.25)
        # Un roulement de charley en triolets à la fin d'une phrase sur deux.
        if phrase == 1 and not plan["coupe_fin"]:
            for k in range(6):
                place(musique, CH, debut + 12 * DOUBLE + k * TEMPS / 6, gain=0.35 + 0.08 * k, pan=0.3)
    if plan["tamb"]:
        for pas in (1, 2, 5, 7, 9, 11, 14, 15):
            if not en_coupure(b, pas):
                place(musique, TAMB, debut + pas * DOUBLE, gain=0.55, pan=(-0.45 if pas % 2 else 0.45))
    # Basse 808
    if plan["basse"]:
        precedente = None
        for pas, nom in sorted(BASSE[phrase].items()):
            if en_coupure(b, pas):
                continue
            suivant = [p for p in GROSSE if p > pas]
            duree = ((suivant[0] if suivant else 16) - pas) * DOUBLE + 0.04
            f = note(nom)
            place(basse_bus, basse(f, duree, glisse_de=precedente if precedente and precedente != f else None), debut + pas * DOUBLE, gain=0.7)
            precedente = f

# Coups d'orchestre sur les relances, et un roulement avant chacune.
for b, accord in ((2, ["F4", "Ab4", "C5"]), (11, ["Db4", "F4", "Ab4"]), (19, ["F4", "Ab4", "C5"])):
    place(musique, coup_orchestre(accord), m(b), gain=0.8, reverb=0.4)
for b in (1, 18):
    for k in range(8):
        place(musique, CC, m(b) + 8 * DOUBLE + k * DOUBLE, gain=0.2 + 0.08 * k, pan=0.1)

# --- Bruitages, calés sur les images (instants de scenes.js) ------------------------

BUTS = m(15) + TEMPS
SAUT = m(15) + 3 * TEMPS + 0.12
REJ = m(6) + 2 * TEMPS
PAY = m(7) + TEMPS
PUSH = m(5) + 1.2 * TEMPS

# Accroche : le coup de sifflet, les mots qui tombent.
place(effets, sifflet(0.62), 0.0, gain=0.9, reverb=0.35)
place(effets, impact(0.35, 0.8), TEMPS * 0.5, reverb=0.2)
place(effets, impact(0.45, 0.8), TEMPS * 2, reverb=0.2)
place(effets, souffle_air(0.5, 400, 3500, 900), m(1) - 0.05, gain=0.35)
place(effets, montee(1.0), m(2) - 1.0, gain=0.55)
# La marque : relance.
place(effets, impact(1.0, 2.0), m(2), reverb=0.4)
place(effets, cymbale(2.4), m(2), gain=0.8)
place(effets, souffle_air(0.9, 200, 2600, 600), m(2) + 0.1, gain=0.45)
place(effets, tinte(1396.9, 1.4), m(2) + 0.05, gain=0.3, reverb=0.6)
# ① Choisis ton match.
place(effets, bulle(1100, 500), m(4), gain=0.35)
place(effets, toucher(), m(5), gain=0.8)
place(effets, souffle_air(0.4, 800, 4500, 1500), PUSH, gain=0.25, pan=0.5)
# ② Réserve ta place.
place(effets, bulle(1100, 500), m(6), gain=0.35)
place(effets, toucher(), REJ, gain=0.8)
place(effets, tinte(1318.5, 0.8), REJ + 0.15, gain=0.25, reverb=0.3)
place(effets, toucher(), PAY, gain=0.8)
place(effets, tinte(1568.0, 1.0), PAY + 0.22, gain=0.35, reverb=0.4)
place(effets, tinte(2093.0, 1.2), PAY + 0.34, gain=0.35, reverb=0.4)
# ③ Tu joues : la salle, le ballon.
place(effets, impact(0.6, 1.2), m(8), reverb=0.3)
place(effets, salle(m(2) + 0.3), m(8) - 0.1, gain=0.5, reverb=0.4)
for instant, pan in ((m(8) + 0.35, -0.3), (m(8) + 1.3, 0.2), (m(9) + 0.25, -0.1), (m(9) + 1.2, 0.3)):
    place(effets, tir(), instant, gain=0.7, pan=pan, reverb=0.45)
# ④ Après le match.
place(effets, impact(0.7, 1.4), m(10), reverb=0.35)
place(effets, souffle_air(0.8, 200, 2400, 700), m(10), gain=0.4)
place(effets, montee(1.0), m(11) - 1.0, gain=0.35)
for instant in (m(11), m(12) + TEMPS, m(13), m(14), m(17) + 0.3):
    place(effets, souffle_air(0.45, 500, 3200, 900), instant - 0.05, gain=0.28, pan=0.2)
for i in range(3):
    place(effets, bulle(800 + i * 150, 380 + i * 60), m(11) + 0.4 + i * 0.12, gain=0.3, pan=(-0.4, 0.0, 0.4)[i])
place(effets, tinte(1760.0, 1.2), m(12) + TEMPS + 0.3, gain=0.3, reverb=0.5)
place(effets, toucher(), BUTS, gain=0.8)
place(effets, toucher(), SAUT - 0.12, gain=0.8)
place(effets, rembobine(), SAUT - 0.02, gain=0.8)
place(effets, tir(), SAUT + 0.9, gain=0.5, reverb=0.5)
# Appel final.
place(effets, montee(1.2), m(19) - 1.2, gain=0.6)
place(effets, impact(1.0, 2.2), m(19), reverb=0.45)
place(effets, cymbale(2.6), m(19), gain=0.85)
place(effets, tinte(1396.9, 1.6), m(19) + 0.05, gain=0.35, reverb=0.6)
# Coup de sifflet final : court, court, long.
for instant, duree in ((m(21) + TEMPS * 1.0, 0.16), (m(21) + TEMPS * 1.5, 0.16), (m(21) + TEMPS * 2.0, 0.75)):
    place(effets, sifflet(duree), instant, gain=0.75, reverb=0.4)

# --- Mixage ----------------------------------------------------------------------------

mixage = musique + basse_bus * pompe[:, None] + effets * 1.1
aigu = np.stack([filtre(envoi[:, 0], haut=250), filtre(envoi[:, 1], haut=250)], axis=1)
mixage += reverberation(aigu) * 0.45
fin = int(DUREE * SR)
mixage = mixage[: fin + int(0.3 * SR)]
mixage[-int(0.3 * SR):] *= np.linspace(1, 0, int(0.3 * SR))[:, None] ** 2
mixage /= np.max(np.abs(mixage)) + 1e-9
mixage = np.tanh(mixage * 1.25) / np.tanh(1.25) * 0.89

sortie = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rendu", "son.wav")
os.makedirs(os.path.dirname(sortie), exist_ok=True)
with wave.open(sortie, "wb") as fichier:
    fichier.setnchannels(2)
    fichier.setsampwidth(2)
    fichier.setframerate(SR)
    fichier.writeframes((mixage * 32767).astype("<i2").tobytes())
print(sortie)
