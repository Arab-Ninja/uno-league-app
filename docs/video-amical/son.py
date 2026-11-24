"""Bande-son de la vidéo « Match amical » : 33 s, 120 bpm, la mineur.

Tout est synthétisé ici, sans échantillon extérieur : aucun droit à gérer,
et le son tombe exactement sur les images. Les instants viennent de
`scenes.js` ; la grille musicale commence à 1 s, pour que les mesures
tombent sur les grandes coupes (3 s, 7 s, 15 s, 29 s).

    python3 docs/video-amical/son.py      →  docs/video-amical/rendu/son.wav

Ne demande que numpy. Le niveau final (-14 LUFS, la norme des réseaux) est
réglé par ffmpeg au moment du mixage, dans `rendu.mjs`.
"""

import os
import wave

import numpy as np

SR = 48000
DUREE = 33.0
N = int(SR * DUREE)
NOIRE = 0.5  # 120 bpm
ALEA = np.random.default_rng(2026)

principal = np.zeros((N, 2))  # batterie, effets
pompe_bus = np.zeros((N, 2))  # basse et nappe, que la grosse caisse fait respirer
envoi = np.zeros((N, 2))  # vers la réverbération
pompe = np.ones(N)


# --- Outils --------------------------------------------------------------------


def temps(n):
    return np.arange(n) / SR


def bruit(n):
    return ALEA.standard_normal(n)


def filtre(x, bas=None, haut=None):
    """Passe-bas (`bas`) et passe-haut (`haut`) doux, par FFT."""
    n = len(x)
    spectre = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    masque = np.ones_like(f)
    if bas:
        masque /= 1 + (f / bas) ** 4
    if haut:
        masque /= 1 + (haut / np.maximum(f, 1.0)) ** 4
    return np.fft.irfft(spectre * masque, n)


def svf(x, frequences, amorti=0.8, mode="bande"):
    """Filtre à variables d'état dont la fréquence change à chaque échantillon."""
    y = np.zeros_like(x)
    bas = bande = 0.0
    coeffs = 2 * np.sin(np.pi * np.minimum(frequences, SR / 6.5) / SR)
    for i in range(len(x)):
        f = coeffs[i]
        bas += f * bande
        haut = x[i] - bas - amorti * bande
        bande += f * haut
        y[i] = bande if mode == "bande" else bas
    return y


def place(bus, son, instant, gain=1.0, pan=0.0, reverb=0.0):
    """Pose un son (mono ou stéréo) sur un bus, à un instant donné."""
    debut = int(round(instant * SR))
    if debut >= N:
        return
    if son.ndim == 1:
        gauche = np.cos((pan + 1) * np.pi / 4)
        droite = np.sin((pan + 1) * np.pi / 4)
        son = np.stack([son * gauche, son * droite], axis=1) * np.sqrt(2)
    fin = min(N, debut + len(son))
    if debut < 0:
        son = son[-debut:]
        debut = 0
    bus[debut:fin] += son[: fin - debut] * gain
    if reverb:
        envoi[debut:fin] += son[: fin - debut] * gain * reverb


def note(nom):
    """« A3 », « C#4 » → fréquence en hertz."""
    noms = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3, "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}
    octave = int(nom[-1])
    return 440.0 * 2 ** ((noms[nom[:-1]] + (octave - 4) * 12) / 12)


def scie(f, t, plafond=3500):
    """Dent de scie à bande limitée, par synthèse additive."""
    y = np.zeros_like(t)
    for k in range(1, max(2, int(plafond / f)) + 1):
        y += (-1) ** (k + 1) * np.sin(2 * np.pi * k * f * t) / k
    return y * 0.6


# --- Instruments ---------------------------------------------------------------


def grosse_caisse():
    n = int(0.5 * SR)
    t = temps(n)
    phase = 2 * np.pi * np.cumsum(46 + 120 * np.exp(-t / 0.03)) / SR
    corps = np.sin(phase) * np.exp(-t / 0.28)
    attaque = filtre(bruit(n), haut=2000) * np.exp(-t / 0.002) * 0.35
    return np.tanh(1.6 * (corps + attaque)) * 0.9


def claquement():
    n = int(0.4 * SR)
    t = temps(n)
    b = filtre(bruit(n), bas=3800, haut=900)
    env = sum(np.exp(-(t - d) / 0.007) * (t >= d) for d in (0.0, 0.011, 0.022))
    env = env + 0.7 * np.exp(-np.maximum(0, t - 0.03) / 0.11) * (t >= 0.03)
    return b * env * 0.5


def charley(ouvert=False):
    n = int((0.3 if ouvert else 0.09) * SR)
    t = temps(n)
    return filtre(bruit(n), haut=7500) * np.exp(-t / (0.1 if ouvert else 0.02)) * 0.3


def caisse_claire():
    n = int(0.3 * SR)
    t = temps(n)
    b = filtre(bruit(n), bas=7000, haut=1200) * np.exp(-t / 0.08)
    ton = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.04)
    return (b * 0.6 + ton * 0.5) * 0.6


def impact(force=1.0, duree=1.8):
    n = int(duree * SR)
    t = temps(n)
    boum = np.sin(2 * np.pi * np.cumsum(36 + 80 * np.exp(-t / 0.05)) / SR) * np.exp(-t / 0.6)
    souffle = filtre(bruit(n), bas=2200) * np.exp(-t / 0.15) * 0.55
    craque = filtre(bruit(n), haut=3000) * np.exp(-t / 0.018) * 0.4
    return np.tanh(1.3 * (boum + souffle + craque)) * force


def cymbale(duree=2.4):
    n = int(duree * SR)
    t = temps(n)
    b = filtre(bruit(n), haut=3800) + 0.5 * filtre(bruit(n), bas=9000, haut=5000)
    return b * np.exp(-t / 0.65) * (1 - np.exp(-t / 0.002)) * 0.28


def souffle(duree=0.45, f0=300.0, f1=3800.0, f2=900.0):
    """Un « whoosh » : du bruit dans un filtre qui monte puis redescend."""
    n = int(duree * SR)
    s = np.linspace(0, 1, n)
    fc = np.where(s < 0.6, f0 * (f1 / f0) ** (s / 0.6), f1 * (f2 / f1) ** ((s - 0.6) / 0.4))
    y = svf(bruit(n), fc, amorti=0.9)
    env = np.sin(np.pi * s) ** 1.4
    return y * env * 0.9


def montee(duree=0.9):
    """Une montée : bruit filtré qui grimpe, et un ton qui l'accompagne."""
    n = int(duree * SR)
    s = np.linspace(0, 1, n)
    t = temps(n)
    fc = 250 * (9000 / 250) ** s
    b = svf(bruit(n), fc, amorti=1.1)
    ton = np.sin(2 * np.pi * np.cumsum(220 * (1200 / 220) ** s) / SR) * 0.15
    return (b * 0.8 + ton) * s**2.3 * (1 - np.exp(-(duree - t) / 0.01))


def tic(f=2600.0):
    n = int(0.035 * SR)
    t = temps(n)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.006) + filtre(bruit(n), haut=4000) * np.exp(-t / 0.002) * 0.3) * 0.5


def bulle(f0=900.0, f1=320.0):
    n = int(0.1 * SR)
    t = temps(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.014)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035) * (1 - np.exp(-t / 0.001)) * 0.6


def tinte(f=1760.0, duree=1.6):
    """Une cloche : partiels inharmoniques qui s'éteignent à des vitesses différentes."""
    n = int(duree * SR)
    t = temps(n)
    y = np.zeros(n)
    for rapport, amplitude, extinction in ((1, 1.0, 0.9), (2.0, 0.35, 0.45), (2.76, 0.3, 0.32), (5.4, 0.12, 0.16)):
        y += amplitude * np.sin(2 * np.pi * f * rapport * t) * np.exp(-t / extinction)
    return y * (1 - np.exp(-t / 0.002)) * 0.3


def toucher():
    n = int(0.06 * SR)
    t = temps(n)
    return (np.sin(2 * np.pi * 1400 * t) * np.exp(-t / 0.01) * 0.6 + filtre(bruit(n), haut=3000) * np.exp(-t / 0.003) * 0.5) * 0.6


def rembobine():
    """Le saut dans la vidéo : un zip qui descend, haché."""
    n = int(0.2 * SR)
    s = np.linspace(0, 1, n)
    f = 2400 * (180 / 2400) ** s
    y = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.5 + filtre(bruit(n), haut=2000) * 0.4
    hache = (np.sin(2 * np.pi * 40 * temps(n)) > -0.3).astype(float)
    return filtre(y * hache, bas=5000) * np.sin(np.pi * s) ** 0.7 * 0.35


def frappe():
    """Le tir : un coup sourd et court."""
    n = int(0.25 * SR)
    t = temps(n)
    corps = np.sin(2 * np.pi * np.cumsum(90 + 160 * np.exp(-t / 0.01)) / SR) * np.exp(-t / 0.06)
    return np.tanh(2 * (corps + filtre(bruit(n), bas=3000) * np.exp(-t / 0.01) * 0.6)) * 0.7


def foule(duree=2.8):
    """Une tribune qui exulte : bruit rose dans la bande des voix, qui ondule."""
    n = int(duree * SR)
    t = temps(n)
    spectre = np.fft.rfft(bruit(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    rose = np.fft.irfft(spectre / np.sqrt(np.maximum(f, 20)), n)
    voix = filtre(rose, bas=2600, haut=280)
    voix /= np.max(np.abs(voix)) + 1e-9
    noyau = np.hanning(int(0.07 * SR))
    ondes = np.convolve(bruit(n), noyau / noyau.sum(), mode="same")
    ondes = 0.75 + 0.25 * ondes / (np.max(np.abs(ondes)) + 1e-9)
    env = (1 - np.exp(-t / 0.12)) * np.exp(-np.maximum(0, t - 0.7) / 1.0)
    return voix * ondes * env * 0.9


def basse(f, duree):
    n = int(duree * SR)
    t = temps(n)
    y = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * scie(f, t, plafond=900)
    return y * (1 - np.exp(-t / 0.004)) * np.exp(-t / 0.4) * np.minimum(1, (duree - t) / 0.01)


def nappe(notes, duree, attaque=0.15):
    n = int(duree * SR)
    t = temps(n)
    gauche = np.zeros(n)
    droite = np.zeros(n)
    for nom in notes:
        f = note(nom)
        gauche += scie(f * 2 ** (-9 / 1200), t) + scie(f, t)
        droite += scie(f * 2 ** (9 / 1200), t) + scie(f * 2 ** (3 / 1200), t)
    env = np.minimum(1, t / attaque) * np.minimum(1, (duree - t) / 0.25)
    return np.stack([filtre(gauche, bas=1700), filtre(droite, bas=1700)], axis=1) * env[:, None] * 0.09


def pincee(f, duree=0.4):
    n = int(duree * SR)
    t = temps(n)
    y = sum((0.55 ** (k - 1)) * np.sin(2 * np.pi * f * k * t) for k in range(1, 6))
    return y * np.exp(-t / 0.15) * (1 - np.exp(-t / 0.002)) * 0.25


def reverberation(x, duree=1.6, extinction=0.5):
    """Réverbération par convolution avec une réponse synthétique décorrélée."""
    n = int(duree * SR)
    t = temps(n)
    sortie = np.zeros_like(x)
    taille = 1 << int(np.ceil(np.log2(len(x) + n)))
    for canal in range(2):
        ir = filtre(bruit(n), bas=6500) * np.exp(-t / extinction)
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt(np.sum(ir**2))
        sortie[:, canal] = np.fft.irfft(np.fft.rfft(x[:, canal], taille) * np.fft.rfft(ir, taille), taille)[: len(x)]
    return sortie


# --- Instruments pré-calculés --------------------------------------------------

GC = grosse_caisse()
CLAP = claquement()
CH = charley()
CHO = charley(ouvert=True)
CC = caisse_claire()

# --- Musique : grille à 120 bpm, mesures sur les secondes impaires ------------

ACCORDS = {
    1: ["A3", "C4", "E4"], 3: ["A3", "C4", "E4"], 5: ["F3", "A3", "C4"], 7: ["G3", "C4", "E4"],
    9: ["G3", "B3", "D4"], 11: ["A3", "C4", "E4"], 13: ["F3", "A3", "C4"], 15: ["G3", "C4", "E4"],
    17: ["G3", "B3", "D4"], 19: ["A3", "C4", "E4"], 21: ["F3", "A3", "C4"], 23: ["G3", "C4", "E4"],
    25: ["F3", "A3", "C4"], 27: ["G3", "B3", "D4"], 29: ["A3", "C4", "E4"], 31: ["F3", "A3", "C4"],
}
FONDAMENTALES = {"A3": "A1", "F3": "F1", "G3": "G1"}


def fondamentale(debut):
    accord = ACCORDS[debut]
    if accord[0] == "G3" and accord[1] == "C4":
        return note("C2")
    return note(FONDAMENTALES[accord[0]])


# Nappe : l'intro monte doucement, puis une mesure sur deux.
for debut, accord in ACCORDS.items():
    duree = 2.0 if debut < 31 else 1.0
    place(pompe_bus, nappe(accord, duree + 0.25, attaque=0.9 if debut == 1 else 0.08), debut, gain=1.0 if debut >= 3 else 0.8)
place(pompe_bus, nappe(["A3", "C4", "E4", "A4"], 1.9, attaque=0.02), 32.0, gain=1.1)
place(pompe_bus, nappe(["A3", "C4", "E4"], 1.05, attaque=0.6), 0.0, gain=0.5)

# Basse : croches à contretemps, de 3 s à 32 s (silence pendant les ruptures).
RUPTURES = [(6.5, 7.0), (22.5, 23.0), (28.0, 29.0)]


def en_rupture(instant):
    return any(a <= instant < b for a, b in RUPTURES)


for debut in ACCORDS:
    if debut < 3:
        continue
    for croche in range(4):
        instant = debut + croche * NOIRE + NOIRE / 2
        if instant >= 32.0 or en_rupture(instant):
            continue
        place(pompe_bus, basse(fondamentale(debut), 0.24), instant, gain=0.42)
        if debut >= 7:
            place(pompe_bus, basse(fondamentale(debut) * 2, 0.12), instant + NOIRE / 2 - 0.01, gain=0.12)

# Batterie.
instant = 3.0
while instant < 32.0 - 1e-6:
    temps_dans_mesure = round(((instant - 1.0) / NOIRE) % 4)
    if not en_rupture(instant):
        place(principal, GC, instant, gain=0.95)
        debut_pompe = int(instant * SR)
        longueur = int(0.3 * SR)
        fin = min(N, debut_pompe + longueur)
        pompe[debut_pompe:fin] = np.minimum(pompe[debut_pompe:fin], 1 - 0.72 * np.exp(-temps(fin - debut_pompe) / 0.09))
        if instant >= 5.0 and temps_dans_mesure in (1, 3):
            place(principal, CLAP, instant, gain=0.9, reverb=0.35)
        place(principal, CH, instant + NOIRE / 2, gain=0.85, pan=0.25)
        if instant >= 7.0:
            place(principal, CH, instant + NOIRE / 4, gain=0.35, pan=-0.3)
            place(principal, CH, instant + 3 * NOIRE / 4, gain=0.35, pan=-0.3)
            if temps_dans_mesure == 3:
                place(principal, CHO, instant + NOIRE / 2, gain=0.6, pan=0.3)
    instant += NOIRE

# Roulement avant l'écran final.
for i in range(16):
    instant = 28.0 + i * 0.0625 if i < 8 else 28.5 + (i - 8) * 0.0625
    place(principal, CC, instant, gain=0.25 + 0.55 * i / 15, pan=0.1)

# Arpèges pincés : le podium, puis l'écran final.
ARPEGES = {"A3": ["A4", "C5", "E5", "A5"], "F3": ["F4", "A4", "C5", "F5"], "G3": ["G4", "C5", "E5", "G5"]}
for debut in (11, 13, 29, 31):
    accord = ACCORDS[debut]
    motif = ARPEGES.get(accord[0], ["G4", "B4", "D5", "G5"]) if accord[1] != "B3" else ["G4", "B4", "D5", "G5"]
    for i in range(16 if debut < 31 else 8):
        instant = debut + i * NOIRE / 2
        if instant >= 32.0:
            break
        place(principal, pincee(note(motif[(i * 3) % 4] if i % 2 else motif[i % 4])), instant, gain=0.5, pan=(-0.45 if i % 2 else 0.45), reverb=0.3)

# --- Effets, calés sur les images --------------------------------------------


def ticks_compteur(debut, duree, cible, f_depart=2200.0, f_fin=3400.0, gain=0.5):
    """Un tic à chaque fois que le compteur affiché change (courbe « out3 » de scenes.js)."""
    precedent = 0
    for i in range(1, int(duree * 240) + 1):
        p = i / (duree * 240)
        valeur = round(cible * (1 - (1 - p) ** 3))
        if valeur != precedent:
            precedent = valeur
            place(principal, tic(f_depart + (f_fin - f_depart) * valeur / max(1, cible)), debut + p * duree, gain=gain, pan=0.15)


# S1 — les projecteurs, les mots qui tombent, les chiffres.
def projecteur():
    n = int(0.5 * SR)
    t = temps(n)
    coup = np.sin(2 * np.pi * np.cumsum(140 + 260 * np.exp(-t / 0.006)) / SR) * np.exp(-t / 0.05)
    metal = sum(np.sin(2 * np.pi * f * t) * np.exp(-t / 0.09) for f in (1870, 2930, 4410)) * 0.12
    bourdon = np.sin(2 * np.pi * 100 * t) * 0.05 * (1 - np.exp(-t / 0.05)) * np.exp(-t / 0.4)
    return np.tanh(2 * (coup * 0.8 + metal + filtre(bruit(n), haut=2500) * np.exp(-t / 0.004) * 0.5 + bourdon)) * 0.7


for instant, pan in ((0.0, -0.5), (0.14, 0.5)):
    place(principal, projecteur(), instant, gain=0.8, pan=pan, reverb=0.45)
place(principal, impact(0.85), 0.40, reverb=0.4)
place(principal, impact(0.6), 0.62, reverb=0.4)
ticks_compteur(1.35, 0.7, 10, gain=0.35)
ticks_compteur(1.55, 0.3, 1, gain=0.35)
ticks_compteur(1.7, 0.8, 24, gain=0.3)
place(principal, montee(0.75), 2.25, gain=0.5)
place(principal, souffle(0.9, 200, 2600, 600), 2.62, gain=0.65)

# S2 — le téléphone, le badge.
place(principal, bulle(1100, 500), 3.85, gain=0.45, reverb=0.2)
place(principal, souffle(0.5, 600, 5000, 1500), 4.25, gain=0.4, pan=0.4)
place(principal, tinte(1760), 4.38, gain=0.55, pan=0.3, reverb=0.5)
place(principal, tinte(2637), 4.46, gain=0.3, pan=0.35, reverb=0.5)
place(principal, montee(0.6), 6.4, gain=0.6)

# S3 — le score.
place(principal, impact(1.0), 6.98, reverb=0.45)
place(principal, cymbale(), 7.0, gain=0.8)
place(principal, souffle(0.5, 300, 3000, 700), 6.9, gain=0.45, pan=-0.6)
place(principal, souffle(0.5, 300, 3000, 700), 6.95, gain=0.45, pan=0.6)
ticks_compteur(7.35, 0.85, 9, gain=0.4)
ticks_compteur(7.6, 1.0, 15, f_depart=1800, f_fin=3000, gain=0.4)
place(principal, impact(0.8, duree=1.2), 8.65, reverb=0.35)
place(principal, souffle(0.65, 250, 4200, 800), 9.5, gain=0.6)

# S4 — le podium.
for i in range(3):
    t0 = 10.35 + i * 0.16
    place(principal, souffle(0.45, 500, 4500, 1200), t0 - 0.05, gain=0.3, pan=(-0.5, 0.0, 0.5)[i])
    place(principal, impact(0.25, duree=0.6), t0 + 0.55, pan=(-0.5, 0.0, 0.5)[i])
place(principal, souffle(0.6, 300, 2200, 700), 12.25, gain=0.35)
place(principal, souffle(0.9, 200, 3200, 900), 12.45, gain=0.55)
place(principal, impact(0.55, duree=1.4), 13.3, reverb=0.4)
for i, nom in enumerate(["A5", "C6", "E6", "A6"]):
    place(principal, tinte(note(nom), duree=1.2), 12.95 + i * 0.07, gain=0.22, pan=(-0.4, -0.1, 0.2, 0.45)[i], reverb=0.6)
ticks_compteur(13.5, 0.8, 17, gain=0.35)
place(principal, souffle(0.5, 400, 3500, 600), 14.6, gain=0.5)

# S5 — la feuille de match.
place(principal, souffle(0.6, 250, 2500, 700), 15.1, gain=0.45)
for i in range(10):
    place(principal, tic(1500 + i * 120), 15.4 + i * 0.075, gain=0.35, pan=0.3)
place(principal, tinte(1318.5, duree=1.0), 16.55, gain=0.3, reverb=0.5)
place(principal, souffle(0.45, 400, 3500, 800), 19.05, gain=0.45, pan=-0.4)

# S6 — la vidéo : deux gestes, le but, la défense.
place(principal, souffle(0.6, 300, 2600, 800), 19.65, gain=0.4)
for instant in (21.25, 23.95):
    place(principal, toucher(), instant, gain=0.8)
    place(principal, rembobine(), instant + 0.1, gain=0.7)
place(principal, frappe(), 22.78, gain=0.8)
place(principal, impact(0.9), 23.04, reverb=0.35)
place(principal, foule(), 23.0, gain=0.55, reverb=0.3)
place(principal, bulle(1300, 600), 23.02, gain=0.35)
place(principal, frappe(), 24.95, gain=0.5, pan=-0.3)
place(principal, bulle(1100, 500), 24.97, gain=0.3, pan=-0.3)
place(principal, souffle(0.6, 250, 4500, 900), 25.12, gain=0.55)

# S7 — les joueurs entrent sur le terrain.
place(principal, souffle(0.7, 200, 2400, 700), 25.45, gain=0.4)
for i in range(10):
    instant = 26.15 + i * 0.065 + (0.12 if i >= 5 else 0)
    place(principal, bulle(700 + i * 60, 300 + i * 20), instant + 0.05, gain=0.4, pan=(-0.4 + 0.08 * i))
place(principal, montee(0.95), 27.95, gain=0.65)

# S8 — l'appel final.
place(principal, impact(1.0, duree=2.2), 28.9, reverb=0.5)
place(principal, cymbale(2.8), 28.92, gain=0.9)
place(principal, tinte(880, duree=2.0), 29.25, gain=0.45, reverb=0.7)
place(principal, tinte(1318.5, duree=2.0), 29.3, gain=0.25, reverb=0.7)
for i in range(3):
    place(principal, souffle(0.35, 600, 4000, 1200), 29.58 + i * 0.13, gain=0.22, pan=(-0.3, 0.0, 0.3)[i])
for i in range(2):
    place(principal, bulle(900, 400), 30.22 + i * 0.1, gain=0.3, pan=(-0.3, 0.3)[i])
place(principal, impact(0.9, duree=1.6), 32.0, reverb=0.6)
place(principal, cymbale(1.6), 32.0, gain=0.6)

# --- Mixage --------------------------------------------------------------------

mixage = principal + pompe_bus * pompe[:, None]
envoi_aigu = np.stack([filtre(envoi[:, 0], haut=220), filtre(envoi[:, 1], haut=220)], axis=1)
mixage += reverberation(envoi_aigu) * 0.5
# Fondu de sortie, pour que la boucle reparte proprement.
mixage[-int(0.35 * SR):] *= np.linspace(1, 0, int(0.35 * SR))[:, None] ** 2
mixage /= np.max(np.abs(mixage)) + 1e-9
mixage = np.tanh(mixage * 1.4) / np.tanh(1.4) * 0.89

sortie = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rendu", "son.wav")
os.makedirs(os.path.dirname(sortie), exist_ok=True)
with wave.open(sortie, "wb") as fichier:
    fichier.setnchannels(2)
    fichier.setsampwidth(2)
    fichier.setframerate(SR)
    fichier.writeframes((mixage * 32767).astype("<i2").tobytes())
print(sortie)
