"""Écrit l'écusson UNO League en SVG — la source vectorielle de toute l'identité.

**D'où viennent les cotes.** L'écusson n'existait qu'en PNG de 186 × 183 px.
Le bouclier a été relevé pixel par pixel sur ce fichier ; l'entrelacs a été
reconnu comme un **nœud de Salomon** — deux boucles en rectangle arrondi,
inclinées de ±38°, qui passent alternativement dessus et dessous — et ses
proportions ajustées par recouvrement avec la source, puis à l'œil : les
anneaux un peu plus épais que la mesure brute, pour laisser au ballon la
place qu'il avait sur l'original.

**Les coordonnées sont celles du PNG d'origine**, en pixels : le bouclier va
de x = 14 à 174. C'est ce qui permet de reposer le tracé sur la source pour
les comparer, et c'est sans effet sur le rendu — un SVG n'a pas de taille.

**Les croisements ne se redessinent pas, ils s'entaillent.** Redessiner la
boucle du dessus dans un disque laissait un liseré au bord du disque, là où il
coupait le marine. Ici, c'est la boucle du dessous qu'un masque évide sur la
largeur de l'autre, plus un filet orange ; aucun bord de masque ne tombe dans
le marine.

Usage : python3 docs/branding/dessine.py  →  docs/branding/ecusson.svg
"""
import json, math, sys

# th : inclinaison des boucles (degrés) ; a, b : demi-longueur et demi-largeur
# extérieures ; t : épaisseur de l'anneau ; r : rayon extérieur des angles ;
# halo : filet orange de part et d'autre d'une boucle qui passe dessus.
P = dict(th=38.0, a=63.0, b=37.0, t=17.5, r=30.0, cx=94.0, cy=86.0,
         halo=3.2, bord=8.5, rballe=16.8, couture=1.7)
if len(sys.argv) > 2:
    P.update(json.loads(sys.argv[2]))

MARINE, ORANGE, BLANC = "#0B1321", "#F97316", "#FFFFFF"
f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")

# --- Le bouclier : bord vertical, sommet bombé, pointe en bas.
bouclier = (
    "M14 98V24Q14 20.86 18.6 18.7Q94 -16.7 169.4 18.7Q174 20.86 174 24V98"
    "C174 140 128 172 94 183C60 172 14 140 14 98Z"
)

# --- Une boucle : la ligne médiane d'un rectangle arrondi, centrée sur l'origine.
t, a, b, r = P["t"], P["a"], P["b"], P["r"]
hx, hy, rc = a - t / 2, b - t / 2, max(0.0, r - t / 2)
boucle = (
    f"M{f(-hx + rc)} {f(-hy)}H{f(hx - rc)}A{f(rc)} {f(rc)} 0 0 1 {f(hx)} {f(-hy + rc)}"
    f"V{f(hy - rc)}A{f(rc)} {f(rc)} 0 0 1 {f(hx - rc)} {f(hy)}H{f(-hx + rc)}"
    f"A{f(rc)} {f(rc)} 0 0 1 {f(-hx)} {f(hy - rc)}V{f(-hy + rc)}A{f(rc)} {f(rc)} 0 0 1 {f(-hx + rc)} {f(-hy)}Z"
)

th, cx, cy = P["th"], P["cx"], P["cy"]
m = hy  # décalage de la ligne médiane d'un grand côté
cos_, sin_ = math.cos(math.radians(th)), math.sin(math.radians(th))
haut, bas = (cx, cy - m / cos_), (cx, cy + m / cos_)
gauche, droite = (cx - m / sin_, cy), (cx + m / sin_, cy)
rho = t * 1.15  # rayon de la zone où l'on entaille la boucle du dessous

# --- Le ballon : un pentagone au centre, cinq coutures, cinq pentagones au bord.
R = P["rballe"] or (b - t) - 0.9
pc = 0.40 * R
def point(rayon, angle):
    return (cx + rayon * math.cos(math.radians(angle)), cy + rayon * math.sin(math.radians(angle)))
def poly(centre_r, centre_a, rayon, rotation):
    ox, oy = point(centre_r, centre_a)
    pts = [(ox + rayon * math.cos(math.radians(rotation + 72 * k)),
            oy + rayon * math.sin(math.radians(rotation + 72 * k))) for k in range(5)]
    return " ".join(f"{f(x)},{f(y)}" for x, y in pts)
angles = [-90 + 72 * k for k in range(5)]
coutures = "".join(
    f'<line x1="{f(point(pc, al)[0])}" y1="{f(point(pc, al)[1])}" '
    f'x2="{f(point(R * 1.02, al)[0])}" y2="{f(point(R * 1.02, al)[1])}"/>'
    for al in angles
)
bords = "".join(f'<polygon points="{poly(R * 1.08, al, R * 0.40, al + 180)}"/>' for al in angles)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="8 -4 172 192">
  <title>UNO League</title>
  <defs>
    <path id="bouclier" d="{bouclier}"/>
    <clipPath id="dedans"><use href="#bouclier"/></clipPath>
    <path id="boucle" d="{boucle}"/>
    <clipPath id="balle"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}"/></clipPath>
    <!-- Chaque boucle est entaillée là où l'autre passe dessus. -->
    <mask id="sousA" maskUnits="userSpaceOnUse" x="0" y="-10" width="190" height="200">
      <rect x="0" y="-10" width="190" height="200" fill="#fff"/>
      <g clip-path="url(#croisGD)">
        <use href="#boucle" transform="translate({f(cx)} {f(cy)}) rotate({f(-th)})" fill="none" stroke="#000" stroke-width="{f(t + 2 * P['halo'])}"/>
      </g>
    </mask>
    <mask id="sousB" maskUnits="userSpaceOnUse" x="0" y="-10" width="190" height="200">
      <rect x="0" y="-10" width="190" height="200" fill="#fff"/>
      <g clip-path="url(#croisHB)">
        <use href="#boucle" transform="translate({f(cx)} {f(cy)}) rotate({f(th)})" fill="none" stroke="#000" stroke-width="{f(t + 2 * P['halo'])}"/>
      </g>
    </mask>
    <clipPath id="croisHB">
      <circle cx="{f(haut[0])}" cy="{f(haut[1])}" r="{f(rho)}"/>
      <circle cx="{f(bas[0])}" cy="{f(bas[1])}" r="{f(rho)}"/>
    </clipPath>
    <clipPath id="croisGD">
      <circle cx="{f(gauche[0])}" cy="{f(gauche[1])}" r="{f(rho)}"/>
      <circle cx="{f(droite[0])}" cy="{f(droite[1])}" r="{f(rho)}"/>
    </clipPath>
  </defs>
  <use href="#bouclier" fill="{ORANGE}"/>
  <!-- Le nœud de Salomon : A passe dessus en haut et en bas, B à gauche et à droite. -->
  <g fill="none" stroke="{MARINE}" stroke-width="{f(t)}">
    <!-- Le masque se pose sur un groupe sans transformation : posé sur la
         boucle tournée, il serait lu dans son repère à elle. -->
    <g mask="url(#sousA)"><use href="#boucle" transform="translate({f(cx)} {f(cy)}) rotate({f(th)})"/></g>
    <g mask="url(#sousB)"><use href="#boucle" transform="translate({f(cx)} {f(cy)}) rotate({f(-th)})"/></g>
  </g>
  <g clip-path="url(#balle)">
    <circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R)}" fill="{BLANC}"/>
    <g fill="{ORANGE}">
      <polygon points="{poly(0, 0, pc, -90)}"/>
      {bords}
    </g>
    <g stroke="{ORANGE}" stroke-width="{f(P['couture'])}" stroke-linecap="round">{coutures}</g>
  </g>
  <use href="#bouclier" fill="none" stroke="{MARINE}" stroke-width="{f(2 * P['bord'])}" clip-path="url(#dedans)"/>
</svg>
'''
import pathlib
cible = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).with_name("ecusson.svg")
cible.write_text(svg, encoding="utf-8")
print(cible)
