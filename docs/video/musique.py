#!/usr/bin/env python3
"""Musique et bruitages de la publicité, calés à l'image près sur `pub.html`.

    python3 docs/video/musique.py      # écrit docs/video/rendu/musique.wav

Tout est synthétisé ici, sans échantillon : aucune licence à vérifier, et le
morceau se refait à l'identique (le hasard est semé).

Électro sportive à 120 BPM, en la mineur (la, fa, do, sol) :

    0 – 2 s    les projecteurs claquent, trois coups sur l'accroche, montée
    2 – 16 s   le groove : grosse caisse à chaque temps, basse roulante,
               arpège, nappes ; un impact à chaque changement d'acte
    15 – 16 s  roulement et montée, une demi-croche de silence, impact
    16 – 20 s  l'écusson : nappe, trois accords sur « Joue. Grimpe. Gagne. »,
               le groove revient en retrait et s'éteint

Les instants des bruitages (tapotements, pièces, montées de division)
reprennent ceux de `pub.html` : à changer ensemble.

Demande numpy et scipy.
"""

import wave
from pathlib import Path

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
BPM = 120
TEMPS = 60 / BPM  # 0,5 s
MESURE = 4 * TEMPS  # 2 s
DUREE = 20.0
N = int(SR * DUREE)
hasard = np.random.default_rng(2026)

SORTIE = Path(__file__).resolve().parent / "rendu" / "musique.wav"


# ---------------------------------------------------------------------------
# Outils
# ---------------------------------------------------------------------------
def bus():
    return np.zeros((2, N))


def poser(b, son, t, gain=1.0, pan=0.0):
    """Ajoute un son (mono ou stéréo) au bus `b` à l'instant t, panoramique à puissance constante."""
    if son.ndim == 1:
        a = (pan + 1) * np.pi / 4
        son = np.stack([son * np.cos(a), son * np.sin(a)]) * np.sqrt(2)
    i = int(round(t * SR))
    if i >= N:
        return
    k = max(0, -i)
    i = max(0, i)
    j = min(N, i + son.shape[1] - k)
    b[:, i:j] += gain * son[:, k : k + (j - i)]


def temps(n):
    return np.arange(n) / SR


def passe_bas(x, f, ordre=2):
    return sosfilt(butter(ordre, f, "low", fs=SR, output="sos"), x)


def passe_haut(x, f, ordre=2):
    return sosfilt(butter(ordre, f, "high", fs=SR, output="sos"), x)


def passe_bande(x, lo, hi, ordre=2):
    return sosfilt(butter(ordre, [lo, hi], "band", fs=SR, output="sos"), x)


def bruit(n):
    return hasard.standard_normal(n)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def dent_de_scie(f, n, phase=0.0):
    """Dent de scie à bande limitée (PolyBLEP) ; f peut varier dans le temps."""
    f = np.broadcast_to(np.asarray(f, dtype=float), (n,))
    dt = f / SR
    p = (phase + np.cumsum(dt)) % 1.0
    s = 2 * p - 1
    a = p < dt
    t = p[a] / dt[a]
    s[a] -= t + t - t * t - 1
    b = p > 1 - dt
    t = (p[b] - 1) / dt[b]
    s[b] -= t * t + t + t + 1
    return s


def svf(x, fc, q=0.8, mode="bp"):
    """Filtre à variables d'état dont la fréquence suit `fc` échantillon par échantillon."""
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1 / q
    ic1 = ic2 = 0.0
    out = np.empty_like(x)
    for n in range(len(x)):
        gn = g[n]
        a1 = 1 / (1 + gn * (gn + k))
        a2 = gn * a1
        a3 = gn * a2
        v3 = x[n] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[n] = v1 if mode == "bp" else v2 if mode == "lp" else x[n] - k * v1 - v2
    return out


def adsr(n, a=0.002, d=0.1, s=0.0, r=0.05, duree=None):
    """Enveloppe : attaque, décroissance exponentielle vers s, relâchement à `duree`."""
    t = temps(n)
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    if duree is not None:
        e = np.where(t > duree, e * np.exp(-(t - duree) / max(r, 1e-6)), e)
    return e


# ---------------------------------------------------------------------------
# Instruments
# ---------------------------------------------------------------------------
def grosse_caisse(force=1.0):
    n = int(0.5 * SR)
    t = temps(n)
    f = 50 + 120 * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t / 0.15)
    # Le claquement de la batte : c'est lui qu'un haut-parleur de téléphone fait entendre.
    clic = passe_bande(bruit(n), 2000, 6000) * np.exp(-t / 0.006) * 0.5
    return np.tanh(1.8 * (s + clic) * force) * 0.95


def claque():
    n = int(0.5 * SR)
    t = temps(n)
    e = np.zeros(n)
    for dt in (0.0, 0.011, 0.022):
        e += np.where(t >= dt, np.exp(-(t - dt).clip(0) / 0.006), 0)
    e += np.where(t >= 0.03, 0.8 * np.exp(-(t - 0.03).clip(0) / 0.13), 0)
    return passe_bande(bruit(n), 900, 4000) * e * 0.5


METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def cymbale(decay, n_sec, coupe=7000):
    n = int(n_sec * SR)
    t = temps(n)
    m = sum(np.sign(np.sin(2 * np.pi * f * 1.7 * t)) for f in METAL) / len(METAL)
    s = passe_haut(0.6 * m + 0.7 * bruit(n), coupe, 4)
    return s * np.exp(-t / decay)


def charleston_ferme():
    return cymbale(0.03, 0.15) * 0.22


def charleston_ouvert():
    return cymbale(0.15, 0.5) * 0.18


def crash(longueur=2.2):
    s = cymbale(0.9, longueur, 3800)
    t = temps(len(s))
    return s * (1 - np.exp(-t / 0.002)) * 0.5


def boum(longueur=1.6):
    """L'impact : un grave qui tombe, un souffle sourd."""
    n = int(longueur * SR)
    t = temps(n)
    f = 30 + 55 * np.exp(-t / 0.18)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.55)
    souffle = passe_bas(bruit(n), 300) * np.exp(-t / 0.25) * 0.6
    return np.tanh(1.5 * (s + souffle)) * 0.9


def supersaw(notes, n, voix=5, ecart=0.14, phase_seed=0):
    r = np.random.default_rng(phase_seed)
    s = np.zeros(n)
    for m in notes:
        for v in range(voix):
            det = (v - (voix - 1) / 2) / ((voix - 1) / 2) * ecart if voix > 1 else 0
            s += dent_de_scie(hz(m + det), n, r.random())
    return s / (len(notes) * np.sqrt(voix))


def nappe(notes, longueur, attaque=0.6, coupe=1600):
    n = int(longueur * SR)
    s = supersaw(notes, n, voix=7, ecart=0.18)
    s = passe_bas(s, coupe)
    t = temps(n)
    e = np.minimum(1, t / attaque) * np.minimum(1, (longueur - t) / 0.4).clip(0)
    return s * e


def stab(notes, longueur=0.3, coupe=3200, decay=0.14):
    n = int(longueur * SR)
    s = passe_bas(supersaw(notes, n, voix=5, ecart=0.16), coupe)
    return s * adsr(n, a=0.002, d=decay)


def pincee(m, longueur=0.25):
    """Une note d'arpège : dent de scie et carré, filtre qui se referme."""
    n = int(longueur * SR)
    t = temps(n)
    f = hz(m)
    s = 0.6 * dent_de_scie(f, n) + 0.4 * np.sign(np.sin(2 * np.pi * f * t))
    fc = 1500 + 5500 * np.exp(-t / 0.06)
    s = svf(s, fc, q=0.9, mode="lp")
    return s * adsr(n, a=0.001, d=0.09)


def basse(m, longueur):
    n = int(longueur * SR)
    t = temps(n)
    f = hz(m)
    s = passe_bas(dent_de_scie(f, n), 1300) * 0.8 + 0.35 * np.sin(2 * np.pi * f * t)
    return np.tanh(1.4 * s) * adsr(n, a=0.003, d=0.09, s=0.5, r=0.02, duree=longueur * 0.8)


def souffle(longueur, f0=300, f1=6000, montee=True, pan0=-0.6, pan1=0.6):
    """Un « whoosh » : bruit filtré dont la bande glisse, panoramique qui traverse."""
    n = int(longueur * SR)
    t = temps(n) / longueur
    fc = f0 * (f1 / f0) ** t
    s = svf(bruit(n), fc, q=1.4, mode="bp")
    e = (t ** 2.2 if montee else np.sin(np.pi * t) ** 1.5)
    s = s * e / (np.abs(s).max() + 1e-9)
    pan = pan0 + (pan1 - pan0) * t
    a = (pan + 1) * np.pi / 4
    return np.stack([s * np.cos(a), s * np.sin(a)]) * np.sqrt(2)


def montee(longueur, f0=250, f1=9000):
    """La montée avant un impact : bruit qui s'ouvre et un ton qui grimpe."""
    n = int(longueur * SR)
    t = temps(n) / longueur
    fc = f0 * (f1 / f0) ** t
    s = svf(bruit(n), fc, q=1.0, mode="bp") * t ** 1.8
    ton = dent_de_scie(180 * 4 ** t, n) * t ** 2 * 0.25
    s = s / (np.abs(s).max() + 1e-9) + passe_bas(ton, 3000)
    return s * 0.6


def clac_projecteur():
    """Un projecteur de salle qui s'allume : un claquement sec et un grave."""
    n = int(1.2 * SR)
    t = temps(n)
    clac = passe_bande(bruit(n), 1200, 6000) * np.exp(-t / 0.012)
    corps = np.sin(2 * np.pi * (70 + 80 * np.exp(-t / 0.02)) * t) * np.exp(-t / 0.25)
    bourdon = passe_bas(bruit(n), 180) * np.exp(-t / 0.5) * 0.8
    return np.tanh(1.2 * (0.9 * clac + corps + bourdon)) * 0.8


def bulle(f0, longueur=0.12):
    """Un joueur qui rejoint le terrain."""
    n = int(longueur * SR)
    t = temps(n)
    f = f0 * (1 + 0.9 * (1 - np.exp(-t / 0.02)))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035) * 0.5


def tapotement():
    n = int(0.08 * SR)
    t = temps(n)
    return (np.sin(2 * np.pi * 1800 * t) * np.exp(-t / 0.006) + 0.6 * np.sin(2 * np.pi * 320 * t) * np.exp(-t / 0.015)) * 0.5


def clochette(notes, ecart=0.07, longueur=0.9):
    """Petit carillon : sinus et un soupçon de modulation de fréquence."""
    n = int(longueur * SR)
    t = temps(n)
    s = np.zeros(n)
    for i, m in enumerate(notes):
        d = t - i * ecart
        f = hz(m)
        v = np.where(d >= 0, np.sin(2 * np.pi * f * d + 0.8 * np.sin(2 * np.pi * f * 2 * d) * np.exp(-d.clip(0) / 0.08)) * np.exp(-d.clip(0) / 0.28), 0)
        s += v
    return s / len(notes) * 0.6


def tic():
    n = int(0.03 * SR)
    t = temps(n)
    return np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.004) * 0.35


def piece():
    """La pièce qui tombe dans la poche : deux notes, si puis mi."""
    n = int(0.9 * SR)
    t = temps(n)
    a = np.sin(2 * np.pi * 987.77 * t) * np.exp(-t / 0.05) * (t < 0.08)
    d = (t - 0.075).clip(0)
    b = np.where(t >= 0.075, np.sin(2 * np.pi * 1318.5 * d) * np.exp(-d / 0.35), 0)
    return (0.6 * a + b) * 0.35


def scintillement(longueur=0.7):
    n = int(longueur * SR)
    t = temps(n)
    s = np.zeros(n)
    for i, m in enumerate([88, 91, 95, 100, 103]):
        d = (t - i * 0.05).clip(0)
        s += np.where(t >= i * 0.05, np.sin(2 * np.pi * hz(m) * d) * np.exp(-d / 0.18), 0)
    return s * 0.12


def reverb_ir(longueur=2.2, seed=5):
    r = np.random.default_rng(seed)
    n = int(longueur * SR)
    t = temps(n)
    ir = np.stack([passe_bas(r.standard_normal(n), 6500) * np.exp(-t / 0.42) for _ in range(2)])
    ir[:, : int(0.015 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True))


# ---------------------------------------------------------------------------
# La partition
# ---------------------------------------------------------------------------
ACCORDS = {
    "Am": [57, 60, 64],
    "F": [53, 57, 60],
    "C": [55, 60, 64],
    "G": [55, 59, 62],
}
FONDAMENTALE = {"Am": 33, "F": 29, "C": 36, "G": 31}
GRILLE = ["Am", "Am", "F", "C", "G", "Am", "F", "G", "Am", "C"]  # une mesure chacun


def accord_a(t):
    return GRILLE[min(len(GRILLE) - 1, int(t // MESURE))]


batterie = bus()
basses = bus()
synthes = bus()
effets = bus()
envoi = bus()  # vers la réverbération

# Quand le groove joue, et à quel volume.
def groove(t):
    if t < 2.0 or 15.875 <= t < 16.0:
        return 0.0
    if 16.0 <= t < 18.0:
        return 0.0
    if t >= 18.0:
        return 0.55
    return 1.0


DOUBLES = [i * 0.125 for i in range(int(DUREE / 0.125))]
COUPS = [i * TEMPS for i in range(int(DUREE / TEMPS))]

# --- Batterie -------------------------------------------------------------
for t in COUPS:
    g = groove(t)
    if g:
        poser(batterie, grosse_caisse(), t, 0.9 * g)
        b = round(t / TEMPS) % 4
        if b in (1, 3):
            c = claque()
            poser(batterie, c, t, 0.75 * g)
            poser(envoi, c, t, 0.35 * g)
        poser(batterie, charleston_ouvert(), t + 0.25, 1.1 * g, pan=0.25)
for t in DOUBLES:
    g = groove(t)
    if g and round(t / 0.125) % 2 == 1:
        poser(batterie, charleston_ferme(), t, 1.1 * g, pan=-0.3)

# Roulements : avant la frappe, avant l'écusson.
def roulement(t0, t1, pas_depart=0.125, pas_fin=0.0625, g0=0.15, g1=0.6):
    t = t0
    while t < t1 - 1e-6:
        p = (t - t0) / (t1 - t0)
        c = claque()
        poser(batterie, c, t, g0 + (g1 - g0) * p)
        poser(envoi, c, t, 0.2)
        t += pas_depart if p < 0.5 else pas_fin

roulement(1.5, 1.875, 0.0625, 0.0625, 0.2, 0.55)
roulement(15.0, 15.875, 0.125, 0.0625, 0.15, 0.65)

# --- Basse : la fondamentale en doubles croches, sauf sur la grosse caisse --
for t in DOUBLES:
    g = groove(t)
    if not g or round(t / 0.125) % 4 == 0:
        continue
    m = FONDAMENTALE[accord_a(t)] + (12 if round(t / 0.125) % 4 == 2 else 0)
    poser(basses, basse(m, 0.12), t, 0.42 * g)

# --- Nappes ---------------------------------------------------------------
poser(synthes, nappe(ACCORDS["Am"], 2.0, attaque=1.6, coupe=900), 0.0, 0.22)
for k in range(1, 8):
    poser(synthes, nappe(ACCORDS[GRILLE[k]], MESURE + 0.1, attaque=0.05, coupe=1400), k * MESURE, 0.2)
poser(synthes, nappe([45] + ACCORDS["Am"] + [69, 72], 2.1, attaque=0.02, coupe=2600), 16.0, 0.42)
poser(synthes, nappe([48] + ACCORDS["C"] + [72, 76], 2.0, attaque=0.15, coupe=2200), 18.0, 0.36)
poser(synthes, nappe([33, 45], 2.0, attaque=1.8, coupe=400), 0.0, 0.3)  # le bourdon de l'intro

# --- Stabs : sur les contretemps du groove, et sur chaque mot frappé -------
for t in COUPS:
    g = groove(t)
    if g and t < 16:
        s = stab([n + 12 for n in ACCORDS[accord_a(t)]], 0.25, 4000, 0.08)
        poser(synthes, s, t + 0.25, 0.26 * g)
for t, gain in [(1.0, 0.3), (1.25, 0.35), (1.5, 0.4), (17.0, 0.28), (17.5, 0.3), (18.0, 0.38)]:
    accord = ACCORDS["Am"] if t < 18 else ACCORDS["C"]
    s = stab([accord[0] - 12] + accord + [accord[0] + 12], 0.9, 4200, 0.28)
    poser(synthes, s, t, gain)
    poser(envoi, s, t, 0.4 * gain)
    poser(batterie, grosse_caisse(1.2), t, 0.8)
    poser(batterie, boum(0.8), t, 0.35)

# --- Arpège en doubles croches, avec écho ----------------------------------
MOTIF = [0, 1, 2, 3, 2, 1, 2, 3]
arp = bus()
for i, t in enumerate(DOUBLES):
    g = groove(t)
    if not g or t < 4.0:
        continue
    a = ACCORDS[accord_a(t)]
    notes = a + [n + 12 for n in a]
    m = notes[MOTIF[i % 8] + (2 if (i // 8) % 2 else 0)] + 12
    poser(arp, pincee(m), t, 0.24 * g, pan=0.35 if i % 2 else -0.35)
echo = int(0.375 * SR)
for k, gain in enumerate([0.35, 0.18, 0.09]):
    d = echo * (k + 1)
    cote = 1 if k % 2 == 0 else 0
    arp[cote, d:] += gain * arp[1 - cote, :-d]
synthes += arp

# --- Impacts et passages ---------------------------------------------------
for t, g in [(2.0, 1.0), (4.0, 0.7), (8.0, 0.7), (12.0, 0.7), (16.0, 1.0)]:
    poser(effets, boum(), t, 0.9 * g)
    c = crash()
    poser(effets, c, t, 0.9 * g)
    poser(envoi, c, t, 0.3 * g)
# Cymbale inversée qui aspire vers la frappe.
cr = crash(1.0)[::-1]
poser(effets, cr, 2.0 - len(cr) / SR, 0.7)
poser(effets, cr, 16.0 - len(cr) / SR, 0.6)
# Les montées.
poser(effets, montee(1.0), 1.0, 0.5)
poser(effets, montee(0.875), 15.0, 0.55)
# Les souffles d'un acte à l'autre.
for t0, t1, p0, p1 in [(3.45, 4.0, -0.2, 0.2), (7.65, 8.0, 0.8, -0.8), (11.65, 12.0, -0.8, 0.8)]:
    poser(effets, souffle(t1 - t0, 400, 7000, pan0=p0, pan1=p1), t0, 0.55)

# --- Les projecteurs -------------------------------------------------------
for t, pan in [(0.0, -0.7), (0.5, 0.7), (1.0, 0.0)]:
    c = clac_projecteur()
    poser(effets, c, t, 0.75, pan=pan)
    poser(envoi, c, t, 0.5, pan=pan)

# --- 01 Joue ---------------------------------------------------------------
poser(effets, souffle(0.45, 300, 2500, montee=False, pan0=0, pan1=0), 4.1, 0.35)  # le téléphone monte
for i, t in enumerate([4.5, 4.75, 5.0, 5.25]):
    b = bulle(hz(76 + 2 * i))
    poser(effets, b, t, 0.55, pan=(-0.3, 0.3, -0.2, 0.2)[i])
    poser(envoi, b, t, 0.2)
poser(effets, tapotement(), 6.0, 0.7)
ch = clochette([76, 83, 88])
poser(effets, ch, 6.04, 0.6)
poser(envoi, ch, 6.04, 0.3)
poser(effets, tapotement(), 6.6, 0.7)
ch = clochette([81, 88], ecart=0.06)
poser(effets, ch, 6.62, 0.55)
poser(envoi, ch, 6.62, 0.3)
for t, pan in [(6.9, 0.5), (7.15, -0.5)]:
    poser(effets, souffle(0.22, 800, 4000, montee=False, pan0=pan, pan1=pan), t - 0.05, 0.35)
    poser(effets, bulle(hz(84), 0.1), t, 0.35, pan=pan)

# --- 02 Grimpe -------------------------------------------------------------
poser(effets, souffle(0.5, 500, 5000, montee=False, pan0=-0.4, pan1=0.4), 8.15, 0.45)  # la carte se retourne
for i, t in enumerate([8.75, 8.85, 8.95]):
    poser(effets, souffle(0.25, 1500, 6000, montee=False, pan0=0.8, pan1=0.4), t, 0.2)
s = scintillement()
poser(effets, s, 9.05, 0.8)
poser(envoi, s, 9.05, 0.5)
poser(effets, bulle(hz(81)), 9.45, 0.5)
for t, base in [(10.0, 72), (10.5, 79)]:
    c = clochette([base, base + 4, base + 7, base + 12], ecart=0.045, longueur=0.8)
    poser(effets, c, t, 0.65)
    poser(envoi, c, t, 0.35)
poser(effets, bulle(hz(88), 0.1), 10.62, 0.4)

# --- 03 Gagne --------------------------------------------------------------
poser(effets, souffle(0.5, 400, 3500, montee=False, pan0=0.3, pan1=-0.3), 12.1, 0.35)  # la pièce tombe
# Le compteur cliquette à chaque palier de 25 UNO, sur la même courbe que l'image.
precedent = 0
for k in range(1, 300):
    t = 12.35 + k * (0.85 / 300)
    p = 1 - (1 - (t - 12.35) / 0.85) ** 3
    v = int(250 * p // 25)
    if v > precedent:
        poser(effets, tic(), t, 0.6, pan=0.15 if v % 2 else -0.15)
        precedent = v
pc = piece()
poser(effets, pc, 13.2, 0.9)
poser(envoi, pc, 13.2, 0.4)
poser(effets, scintillement(0.9), 13.22, 0.6)
poser(effets, bulle(hz(79), 0.12), 13.5, 0.45)
for i, t in enumerate([14.0, 14.25, 14.5]):
    poser(effets, souffle(0.3, 600, 3500, montee=False, pan0=(-0.6, 0, 0.6)[i], pan1=(-0.6, 0, 0.6)[i]), t - 0.05, 0.3)

# --- L'écusson -------------------------------------------------------------
poser(effets, souffle(0.6, 300, 4000, montee=False, pan0=-0.5, pan1=0.5), 16.1, 0.3)  # l'entrelacs se dessine
s = scintillement(0.9)
poser(effets, s, 16.45, 0.7)
poser(envoi, s, 16.45, 0.5)
s = scintillement(0.8)
poser(effets, s, 17.6, 0.5)  # le reflet sur l'écusson
poser(envoi, s, 17.6, 0.4)
poser(effets, crash(2.0), 18.0, 0.5)
for t, pan in [(18.45, -0.3), (18.6, 0.3), (18.8, 0.0)]:
    poser(effets, bulle(hz(84), 0.1), t, 0.3, pan=pan)

# ---------------------------------------------------------------------------
# Mixage
# ---------------------------------------------------------------------------
t_all = temps(N)
# Pompe : basse et synthés s'effacent à chaque grosse caisse du groove.
pompe = np.ones(N)
for t in COUPS:
    if groove(t):
        i = int(t * SR)
        d = t_all[i:] - t
        pompe[i:] = np.minimum(pompe[i:], 1 - 0.6 * np.exp(-d / 0.11))

# Pendant la montée de 15 s, le groove se vide de ses graves.
def ouverture(b, t0, t1, f0=80, f1=1800):
    i0, i1 = int(t0 * SR), int(t1 * SR)
    fc = f0 * (f1 / f0) ** (temps(i1 - i0) / (t1 - t0))
    for c in range(2):
        b[c, i0:i1] = svf(b[c, i0:i1], fc, q=0.7, mode="hp")

# Les niveaux de chaque bus, relevés au crêtemètre plutôt qu'à l'oreille :
# batterie vers -17 dB efficaces, basse et synthés vers -18.
mix_groove = 0.4 * batterie + 1.6 * basses * pompe + 1.4 * synthes * pompe
ouverture(mix_groove, 15.0, 15.875)
# Et dans la fin en retrait, il reste feutré.
i18 = int(18.0 * SR)
for c in range(2):
    mix_groove[c, i18:] = passe_bas(mix_groove[c, i18:], 2400)

ir = reverb_ir()
reverb = np.stack([fftconvolve(envoi[c], ir[c])[:N] for c in range(2)])

mix = mix_groove + 0.5 * effets + 0.3 * reverb
# L'extinction : la dernière seconde s'efface.
mix *= np.where(t_all > 19.0, np.cos(np.clip((t_all - 19.0) / 1.0, 0, 1) * np.pi / 2) ** 2, 1)

# Bus maître : une saturation douce qui n'arrondit que les crêtes, puis
# -1,5 dBFS, pour garder de la marge aux crêtes entre échantillons.
mix = passe_haut(mix, 35)
mix = np.tanh(mix * 1.3 / np.abs(mix).max())
mix *= 10 ** (-1.5 / 20) / np.abs(mix).max()

SORTIE.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(SORTIE), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype("<i2").tobytes())
print(SORTIE)
