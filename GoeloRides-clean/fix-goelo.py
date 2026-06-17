#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GoëloRides — Script de synchronisation
Lance : python3 fix-goelo.py
Depuis : /media/daniel/HDD/AIFB/GoeloRides/
"""

import re, os, sys

BASE = '/media/daniel/HDD/AIFB/GoeloRides'

def read(f):
    with open(os.path.join(BASE, f), 'r', encoding='utf-8') as fh:
        return fh.read()

def write(f, content):
    with open(os.path.join(BASE, f), 'w', encoding='utf-8') as fh:
        fh.write(content)
    print(f'✅ {f}')

# ─────────────────────────────────────────────
# FOOTER UNIFIÉ (référence infos-pratiques)
# ─────────────────────────────────────────────
FOOTER_CSS = '''
/* ── FOOTER UNIFIÉ ────────────────────────────────────────────── */
.gr-footer {
  background: #1A1A1A;
  border-top: 1px solid #2E2E2E;
  padding: 3rem 2rem 2rem;
  font-family: 'Inter', sans-serif;
}
.gr-footer-inner {
  max-width: 900px; margin: 0 auto;
  display: grid; grid-template-columns: 1fr 1fr 1fr;
  gap: 2.5rem; align-items: start;
}
.gr-footer-logo {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 1.4rem; font-weight: 800;
  color: #F0F0F0; margin-bottom: 0.4rem;
}
.gr-footer-logo span { color: #C8F135; }
.gr-footer-loc { font-size: 0.78rem; color: #888888; line-height: 1.65; }
.gr-footer-col-title {
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: #888888; margin-bottom: 0.9rem;
}
.gr-footer-links { display: flex; flex-direction: column; gap: 0.6rem; }
.gr-footer-link {
  display: inline-flex; align-items: center; gap: 0.55rem;
  font-size: 0.83rem; color: rgba(255,255,255,0.7); text-decoration: none;
  transition: color 0.15s;
}
.gr-footer-link:hover { color: #F0F0F0; }
.gr-footer-link svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; opacity: 0.6; }
.gr-footer-legal-text { font-size: 0.75rem; color: rgba(255,255,255,0.3); line-height: 1.7; }
.gr-footer-bottom {
  max-width: 900px; margin: 2rem auto 0;
  padding-top: 1.25rem; border-top: 1px solid #2E2E2E;
  display: flex; align-items: center; justify-content: space-between;
  gap: 1rem; flex-wrap: wrap;
}
.gr-footer-bottom-copy { font-size: 0.72rem; color: rgba(255,255,255,0.25); }
.gr-footer-bottom-nav { display: flex; gap: 1.25rem; }
.gr-footer-bottom-nav a { font-size: 0.72rem; color: rgba(255,255,255,0.35); text-decoration: none; transition: color 0.15s; }
.gr-footer-bottom-nav a:hover { color: #F0F0F0; }
@media (max-width: 768px) {
  .gr-footer { padding: 2rem 1rem 1.5rem; }
  .gr-footer-inner { grid-template-columns: 1fr; gap: 1.75rem; }
  .gr-footer-bottom { flex-direction: column; align-items: flex-start; }
  .gr-footer-bottom-nav { flex-wrap: wrap; gap: 0.75rem; }
}
'''

def make_footer(current_page=''):
    current = f'aria-current="page"' 
    pages = {
        'sorties': ('sorties.html', 'Sorties'),
        'groupes': ('groupes.html', 'Groupes'),
        'infos': ('infos-pratiques.html', 'Infos pratiques'),
        'gestion': ('gestion-sorties.html', 'Espace Team Rider'),
    }
    nav_links = ''
    for key, (href, label) in pages.items():
        ac = ' aria-current="page"' if key in current_page else ''
        nav_links += f'        <a href="{href}"{ac}>{label}</a>\n'

    return f'''  <footer class="gr-footer" role="contentinfo">
    <div class="gr-footer-inner">
      <div>
        <p class="gr-footer-logo">GOËLO<span>RIDES</span></p>
        <p class="gr-footer-loc">Saint-Quay-Portrieux<br>Côtes-d\u2019Armor \u00b7 22410<br>Bretagne \u00b7 France</p>
      </div>
      <div>
        <p class="gr-footer-col-title">Nous suivre</p>
        <div class="gr-footer-links">
          <a href="https://www.instagram.com/goelo.rides/" target="_blank" rel="noopener" class="gr-footer-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>
            @goelo.rides
          </a>
          <a href="https://www.facebook.com/goelo.rides" target="_blank" rel="noopener" class="gr-footer-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            Goëlo Rides
          </a>
          <a href="mailto:goelo.rides@gmail.com" class="gr-footer-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>
            goelo.rides@gmail.com
          </a>
        </div>
      </div>
      <div>
        <p class="gr-footer-col-title">Le projet</p>
        <p class="gr-footer-legal-text">Initiative locale et ind\u00e9pendante.<br>Pas d\u2019adh\u00e9sion. Pas de f\u00e9d\u00e9ration.<br>Pas de course. Juste du v\u00e9lo.<br><br>\u00c9t\u00e9 2026 \u00b7 Go\u00ebloRides</p>
      </div>
    </div>
    <div class="gr-footer-bottom">
      <span class="gr-footer-bottom-copy">\u00a9 2026 Go\u00ebloRides \u2014 Saint-Quay-Portrieux</span>
      <nav class="gr-footer-bottom-nav" aria-label="Liens du footer">
{nav_links.rstrip()}
      </nav>
    </div>
  </footer>'''

# ─────────────────────────────────────────────
# 1. FOOTER : groupes, sorties, parcours
# ─────────────────────────────────────────────
OLD_FOOTER_PATTERN = r'  <footer class="gr-footer" role="contentinfo">\s*<p>.*?</footer>'

for fname, page_key in [
    ('groupes.html', 'groupes'),
    ('sorties.html', 'sorties'),
    ('parcours.html', ''),
]:
    content = read(fname)
    new_footer = make_footer(page_key)
    result = re.sub(OLD_FOOTER_PATTERN, new_footer, content, flags=re.DOTALL)
    if result != content:
        write(fname, result)
    else:
        print(f'⚠️  Footer non trouvé dans {fname} — vérification manuelle requise')

# ─────────────────────────────────────────────
# 2. FOOTER : gestion-sorties (footer simple en bas)
# ─────────────────────────────────────────────
content = read('gestion-sorties.html')
# Trouver et remplacer le footer simple s'il existe
old_gs = re.search(r'<footer[^>]*>.*?</footer>', content, re.DOTALL)
if old_gs:
    new_footer = make_footer('gestion')
    content = content[:old_gs.start()] + new_footer + content[old_gs.end():]
    # Injecter le CSS footer dans le <style> si pas déjà là
    if 'gr-footer-inner' not in content:
        content = content.replace('</style>', FOOTER_CSS + '\n</style>', 1)
    write('gestion-sorties.html', content)
else:
    print('⚠️  Pas de footer dans gestion-sorties.html')

# ─────────────────────────────────────────────
# 3. HERO index.html — fix image + contenu
# ─────────────────────────────────────────────
content = read('index.html')

OLD_HERO_CSS_CONFLICT = '.app-main--home .gr-hero {\n  margin: 0;\n  width: 100%;\n  max-width: none !important;\n  padding: 0 !important;\n  background: var(--color-bg) !important;'
NEW_HERO_CSS_FIX = '.app-main--home .gr-hero {\n  margin: 0;\n  width: 100%;\n  max-width: none !important;\n  padding: 0 !important;\n  background: transparent !important;'

if OLD_HERO_CSS_CONFLICT in content:
    content = content.replace(OLD_HERO_CSS_CONFLICT, NEW_HERO_CSS_FIX)
    print('✅ Fix hero CSS (background !important)')
else:
    print('ℹ️  Conflit CSS hero non trouvé dans index.html (peut être déjà corrigé)')

OLD_HERO_CONTENT = '''    <div class="gr-hero-content">
      <h1 class="gr-hero-headline">Sorties vélo.<br>Esprit club.<br>Goëlo.</h1>
      <p class="gr-hero-subtitle">Découvre, partage et participe aux plus belles sorties du Goëlo.</p>
      <div class="gr-hero-ctas">
      <a href="sorties.html" class="gr-btn gr-btn--accent" style="color:#fff;">
  Explorer les sorties
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
      </a>
      <a href="#" class="gr-btn gr-btn--ghost" data-goelo-auth-trigger style="color:#fff;">
        Rejoindre en Team Rider
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
      </a>
      </div>
    </div>'''

NEW_HERO_CONTENT = '''    <div class="gr-hero-content">
      <div class="gr-hero-badges">
        <span class="gr-hero-badge">🚴 Route · Gravel · VTT</span>
        <span class="gr-hero-badge">🌊 Côte du Goëlo</span>
        <span class="gr-hero-badge">☕ Sorties conviviales</span>
      </div>
      <h1 class="gr-hero-headline">
        Rouler ensemble.<br>
        Profiter du paysage.<br>
        <span class="gr-hero-headline-accent">Partager quelques kilomètres.</span>
      </h1>
      <p class="gr-hero-subtitle">
        Que tu reprennes le vélo ou que tu roules chaque semaine,
        il y a une place pour toi dans le groupe.
      </p>
      <div class="gr-hero-ctas">
        <a href="sorties.html" class="gr-btn gr-btn--accent">
          Voir les sorties
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
        </a>
        <a href="groupes.html" class="gr-btn gr-btn--ghost">
          Découvrir les groupes
        </a>
      </div>
      <p class="gr-hero-signature">On part ensemble. On roule ensemble. On rentre ensemble.</p>
    </div>'''

if OLD_HERO_CONTENT in content:
    content = content.replace(OLD_HERO_CONTENT, NEW_HERO_CONTENT)
    print('✅ Hero content mis à jour')
else:
    print('ℹ️  Contenu hero non trouvé — peut-être déjà mis à jour')

# Injecter CSS hero manquant si absent
HERO_EXTRA_CSS = '''
/* ── HERO ADDITIONS ── */
.gr-hero-badges { display:flex; flex-wrap:wrap; gap:0.5rem; margin-bottom:1.5rem; }
.gr-hero-badge {
  font-size:0.75rem; font-weight:500; color:rgba(255,255,255,0.80);
  background:rgba(255,255,255,0.10); border:1px solid rgba(255,255,255,0.18);
  border-radius:999px; padding:0.3rem 0.8rem; backdrop-filter:blur(4px);
}
.gr-hero-headline-accent { color: var(--color-accent); }
.gr-hero-signature {
  font-size:0.78rem; font-style:italic;
  color:rgba(255,255,255,0.35); margin-top:1.25rem;
}
.gr-btn--accent { color: #000 !important; font-weight: 700; }
.gr-btn--ghost  { color: #fff !important; }
'''
if 'gr-hero-badges' not in content:
    content = content.replace('/* ── STATS STRIP', HERO_EXTRA_CSS + '\n/* ── STATS STRIP', 1)
    if '/* ── STATS STRIP' not in content:
        content = content.replace('</style>\n</head>', HERO_EXTRA_CSS + '</style>\n</head>', 1)

write('index.html', content)

# ─────────────────────────────────────────────
# 4. FOOTER index.html — aligner avec infos-pratiques
# ─────────────────────────────────────────────
content = read('index.html')
old_idx_footer = re.search(r'  <footer class="gr-footer" role="contentinfo">.*?</footer>', content, re.DOTALL)
if old_idx_footer:
    new_footer = make_footer('')
    content = content[:old_idx_footer.start()] + new_footer + content[old_idx_footer.end():]
    write('index.html', content)
else:
    print('⚠️  Footer index.html non trouvé')

print('\n🏁 Terminé — recharge les pages avec Ctrl+Shift+R')
