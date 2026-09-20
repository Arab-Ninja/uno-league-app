"""La planche de la famille : `famille.png`, la seule image qu'on montre.

Elle est engendrée plutôt que capturée à la main pour la même raison que les
SVG : sinon elle montre la marque d'avant. `rendu.mjs` la photographie.
"""

import pathlib

RACINE = pathlib.Path(__file__).resolve().parent
NAVY, ORANGE = "#0F172A", "#F97316"


def corps(nom: str) -> str:
    """Le contenu d'un SVG de la famille, sans son enveloppe."""
    brut = (RACINE / nom).read_text(encoding="utf-8")
    return brut.split("</title>", 1)[1].replace("</svg>", "").strip()


MARQUE, MONO = corps("mark.svg"), corps("mark-mono.svg")
ICONE, ROGNABLE = corps("icon.svg"), corps("icon-maskable.svg")
BADGE = corps("badge.svg")


def vue(c: str, taille: int, vb="0 0 64 64", style="") -> str:
    return (
        f'<svg viewBox="{vb}" width="{taille}" height="{taille}"'
        f'{f" style={chr(34)}{style}{chr(34)}" if style else ""}>{c}</svg>'
    )


TAILLES = (64, 48, 32, 24, 20, 16)
ECHELLE = "".join(vue(MARQUE, t) for t in TAILLES)
ECHELLE_MONO_CLAIR = "".join(vue(MONO, t, style=f"color:{NAVY}") for t in TAILLES)
ECHELLE_MONO_SOMBRE = "".join(vue(MONO, t, style="color:#fff") for t in TAILLES)

PAGE = f"""<!doctype html><html lang="fr"><meta charset="utf-8"><title>UNO League — la marque</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<style>
 body {{ margin:0; background:#E2E8F0; font:15px/1.55 -apple-system,"Segoe UI",Roboto,sans-serif; color:{NAVY} }}
 .feuille {{ width:1160px; margin:0 auto; background:#F8FAFC; padding:48px 56px 56px }}
 h1 {{ font-size:15px; letter-spacing:.14em; text-transform:uppercase; color:#94A3B8; margin:0 0 6px; font-weight:700 }}
 h2 {{ font-size:32px; margin:0 0 34px; letter-spacing:-.01em }}
 h3 {{ font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:#94A3B8; margin:0 0 12px; font-weight:700 }}
 section {{ margin-bottom:34px }}
 .rang {{ display:flex; gap:20px; align-items:stretch }}
 .boite {{ border-radius:16px; padding:20px 24px; display:flex; align-items:center; gap:18px }}
 .sombre {{ background:{NAVY} }} .clair {{ background:#fff; border:1px solid #E2E8F0 }}
 .boite svg {{ display:block }}
 .mot {{ font:800 27px/1 "Roboto Condensed",Roboto,sans-serif; letter-spacing:.08em; color:#fff }}
 .mot em {{ font-style:normal; color:{ORANGE} }}
 .mot.encre {{ color:{NAVY} }}
 .tuiles {{ display:flex; gap:22px; align-items:flex-end }}
 .tuile {{ text-align:center; font-size:12px; color:#64748B }}
 .tuile svg {{ display:block; margin:0 auto 8px; border-radius:22px }}
 .tuile .carre svg {{ border-radius:0 }}
 .cercle {{ position:relative; width:104px; height:104px; margin:0 auto 8px }}
 .cercle svg {{ border-radius:0; margin:0 }}
 .cercle::after {{ content:""; position:absolute; inset:0; border-radius:50%;
                   outline:2px dashed {ORANGE}; outline-offset:-1px }}
 .palette {{ display:flex; gap:14px }}
 .pastille {{ border-radius:12px; padding:14px 18px; color:#fff; font-size:12px; min-width:150px }}
 .pastille b {{ display:block; font-size:14px; margin-bottom:2px }}
 .note {{ color:#64748B; font-size:13px; margin:10px 0 0; max-width:820px }}
</style>
<div class="feuille">
 <h1>UNO League</h1>
 <h2>L'écusson et ses déclinaisons</h2>

 <section>
  <h3>La marque, sur ses deux fonds</h3>
  <div class="rang">
   <div class="boite sombre">{vue(MARQUE, 76)}<span class="mot">UNO <em>LEAGUE</em></span></div>
   <div class="boite clair">{vue(MARQUE, 76)}<span class="mot encre">UNO <em>LEAGUE</em></span></div>
  </div>
  <p class="note">Le ballon est un disque marine <b>posé</b> dans l'écusson, non
  découpé : la marque ne change pas selon ce qu'elle a derrière.</p>
 </section>

 <section>
  <h3>À l'échelle — 64, 48, 32, 24, 20 et 16 pixels</h3>
  <div class="rang">
   <div class="boite sombre" style="gap:22px">{ECHELLE}</div>
   <div class="boite clair" style="gap:22px">{ECHELLE}</div>
  </div>
 </section>

 <section>
  <h3>Une seule encre — maillot brodé, tampon, notification</h3>
  <div class="rang">
   <div class="boite sombre" style="gap:22px">{ECHELLE_MONO_SOMBRE}</div>
   <div class="boite clair" style="gap:22px">{ECHELLE_MONO_CLAIR}</div>
  </div>
  <p class="note">Ici le ballon est <b>évidé</b> : posé plein, il disparaîtrait
  dans l'écusson de la même couleur.</p>
 </section>

 <section>
  <h3>Les tuiles</h3>
  <div class="tuiles">
   <div class="tuile">{vue(ICONE, 104, vb="0 0 512 512")}icon.svg — 192 et 512 px</div>
   <div class="tuile"><div class="cercle">{vue(ROGNABLE, 104, vb="0 0 512 512")}</div>icon-maskable.svg — le système peut rogner</div>
   <div class="tuile"><div style="background:{NAVY};border-radius:22px;padding:20px;display:inline-block;margin-bottom:8px">{vue(BADGE, 64)}</div><br>badge.svg — 72 px</div>
  </div>
  <p class="note">Le trait orange montre jusqu'où Android a le droit de rogner
  la tuile « maskable » : tout ce qui compte tient dans les 66 % du centre.</p>
 </section>

 <section>
  <h3>La palette</h3>
  <div class="palette">
   <div class="pastille" style="background:{NAVY}"><b>Marine</b>{NAVY} — fond, ballon</div>
   <div class="pastille" style="background:{ORANGE}"><b>Orange</b>{ORANGE} — écusson, accent</div>
  </div>
 </section>
</div>
</html>"""

(RACINE / "famille.html").write_text(PAGE, encoding="utf-8")
print(f"famille.html  {len(PAGE)} o")
