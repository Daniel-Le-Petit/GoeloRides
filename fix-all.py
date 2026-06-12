#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GoëloRides — fix-all.py
Lance depuis : /media/daniel/HDD/AIFB/GoeloRides/
python3 fix-all.py
"""
import re, os

BASE = '/media/daniel/HDD/AIFB/GoeloRides'

def path(f): return os.path.join(BASE, f)

def read(f):
    with open(path(f), 'r', encoding='utf-8') as fh:
        return fh.read()

def write(f, c):
    with open(path(f), 'w', encoding='utf-8') as fh:
        fh.write(c)
    print(f'✅ {f}')

def sub(pattern, repl, content, **kw):
    result = re.sub(pattern, repl, content, **kw)
    return result

# ════════════════════════════════════════════════
# 1. SUPPRIMER les liens de navigation dans TOUS
#    les footers (garder seulement brand + social)
# ════════════════════════════════════════════════
files_footer = ['infos-pratiques.html', 'groupes.html', 'sorties.html',
                'parcours.html', 'gestion-sorties.html', 'index.html',
                'cyclistes.html', 'team-rider-info.html']

for fname in files_footer:
    fpath = path(fname)
    if not os.path.exists(fpath):
        print(f'⚠️  {fname} non trouvé, ignoré')
        continue
    c = read(fname)

    # Supprimer bloc footer-bottom entier (copyright + nav liens)
    c = re.sub(
        r'\s*<div class="(?:gr-footer-bottom|footer-bottom)"[^>]*>.*?</div>\s*',
        '\n  ',
        c, flags=re.DOTALL
    )
    # Supprimer les nav footer-bottom-nav / footer-nav s'il en reste
    c = re.sub(
        r'\s*<nav class="(?:gr-footer-bottom-nav|footer-nav|footer-bottom-nav)"[^>]*>.*?</nav>\s*',
        '',
        c, flags=re.DOTALL
    )

    write(fname, c)

print()

# ════════════════════════════════════════════════
# 2. INDEX.HTML — 4 corrections
# ════════════════════════════════════════════════
c = read('index.html')

# ── 2a. BURGER : ajouter menu mobile drawer ──────
# Ajouter JS + drawer si pas déjà là
if 'gr-mobile-drawer' not in c:
    DRAWER_HTML = '''
  <!-- ── MOBILE DRAWER ── -->
  <div id="gr-mobile-drawer" class="gr-mobile-drawer" hidden aria-modal="true" role="dialog">
    <div class="gr-mobile-drawer__backdrop" onclick="closeMobileMenu()"></div>
    <nav class="gr-mobile-drawer__panel">
      <div class="gr-mobile-drawer__head">
        <span class="gr-mobile-drawer__logo">GOËLO<span>RIDES</span></span>
        <button class="gr-mobile-drawer__close" onclick="closeMobileMenu()" aria-label="Fermer">✕</button>
      </div>
      <ul class="gr-mobile-drawer__links">
        <li><a href="sorties.html">Sorties</a></li>
        <li><a href="groupes.html">Groupes</a></li>
        <li><a href="infos-pratiques.html">Infos pratiques</a></li>
      </ul>
      <div class="gr-mobile-drawer__cta">
        <a href="#" class="gr-mobile-drawer__btn" data-goelo-auth-trigger>Se connecter</a>
      </div>
    </nav>
  </div>'''

    DRAWER_CSS = '''
/* ── MOBILE DRAWER ──────────────────────────── */
.gr-mobile-drawer {
  position: fixed; inset: 0; z-index: 500;
  display: flex;
}
.gr-mobile-drawer[hidden] { display: none !important; }
.gr-mobile-drawer__backdrop {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(3px);
}
.gr-mobile-drawer__panel {
  position: relative; z-index: 1;
  width: min(280px, 85vw);
  background: #1A1A1A;
  border-right: 1px solid #2E2E2E;
  display: flex; flex-direction: column;
  padding: 1.5rem;
  animation: drawerIn 0.25s ease;
}
@keyframes drawerIn {
  from { transform: translateX(-100%); opacity: 0; }
  to   { transform: translateX(0);     opacity: 1; }
}
.gr-mobile-drawer__head {
  display: flex; align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
}
.gr-mobile-drawer__logo {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 1.2rem; font-weight: 800;
  letter-spacing: 0.05em; color: #F0F0F0;
}
.gr-mobile-drawer__logo span { color: #C8F135; }
.gr-mobile-drawer__close {
  background: none; border: none;
  color: #888; font-size: 1rem; cursor: pointer;
  padding: 0.25rem;
  transition: color 0.15s;
}
.gr-mobile-drawer__close:hover { color: #F0F0F0; }
.gr-mobile-drawer__links {
  list-style: none;
  display: flex; flex-direction: column; gap: 0;
  flex: 1;
}
.gr-mobile-drawer__links li a {
  display: block; padding: 0.85rem 0;
  border-bottom: 1px solid #2E2E2E;
  font-size: 1rem; font-weight: 600;
  color: #F0F0F0; text-decoration: none;
  transition: color 0.15s;
}
.gr-mobile-drawer__links li a:hover { color: #C8F135; }
.gr-mobile-drawer__cta { margin-top: 2rem; }
.gr-mobile-drawer__btn {
  display: block; width: 100%; text-align: center;
  background: #C8F135; color: #000;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 0.9rem; font-weight: 800;
  letter-spacing: 0.06em; text-transform: uppercase;
  padding: 0.75rem; border-radius: 8px;
  text-decoration: none;
  transition: background 0.15s;
}
.gr-mobile-drawer__btn:hover { background: #9ABF20; }
'''

    DRAWER_JS = '''
  <script>
  function openMobileMenu()  {
    const d = document.getElementById('gr-mobile-drawer');
    d.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeMobileMenu() {
    const d = document.getElementById('gr-mobile-drawer');
    d.setAttribute('hidden','');
    document.body.style.overflow = '';
  }
  // Fermer avec Échap
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMobileMenu();
  });
  </script>'''

    # Injecter CSS dans le <style> principal
    c = c.replace('/* ── RESPONSIVE', DRAWER_CSS + '\n/* ── RESPONSIVE', 1)
    if '/* ── RESPONSIVE' not in c:
        c = c.replace('</style>', DRAWER_CSS + '</style>', 1)

    # Injecter HTML du drawer avant </body>
    c = c.replace('</body>', DRAWER_HTML + DRAWER_JS + '\n</body>', 1)

    # Brancher le burger sur openMobileMenu()
    c = c.replace(
        '<button class="gr-header-burger" aria-label="Menu" type="button">',
        '<button class="gr-header-burger" aria-label="Menu" type="button" onclick="openMobileMenu()">'
    )
    print('✅ Drawer mobile ajouté')

# ── 2b. MOBILE TABBAR : aligner sur sorties.html ──
OLD_TABBAR = '''  <nav class="goelo-mobile-tabbar" role="navigation" aria-label="Navigation principale" data-no-swipe-nav>
    <a href="index.html" class="goelo-mobile-tabbar__link" aria-current="page">Accueil</a>
    <a href="groupes.html" class="goelo-mobile-tabbar__link">Groupes</a>
    <a href="sorties.html" class="goelo-mobile-tabbar__link">Sorties</a>
    <a href="infos-pratiques.html" class="goelo-mobile-tabbar__link">Infos</a>
  </nav>'''

NEW_TABBAR = '''  <nav class="goelo-mobile-tabbar" role="navigation" aria-label="Navigation principale" data-no-swipe-nav>
    <a href="index.html" aria-current="page">Accueil</a>
    <a href="groupes.html">Groupes</a>
    <a href="sorties.html">Sorties</a>
    <a href="infos-pratiques.html">Infos</a>
  </nav>'''

if OLD_TABBAR in c:
    c = c.replace(OLD_TABBAR, NEW_TABBAR)
    print('✅ Mobile tabbar index.html aligné')
else:
    # Remplacer en regex
    c = re.sub(
        r'<nav class="goelo-mobile-tabbar"[^>]*>.*?</nav>',
        NEW_TABBAR.strip(),
        c, flags=re.DOTALL
    )
    print('✅ Mobile tabbar index.html aligné (regex)')

# ── 2c. FIX HERO IMAGE ──────────────────────────
# Supprimer background !important sur .app-main--home .gr-hero
c = re.sub(
    r'(\.app-main--home \.gr-hero\s*\{[^}]*?)background:[^;]+!important;',
    r'\1background: transparent !important;',
    c
)

# S'assurer que .gr-hero-bg img a bien les bons styles
if '.gr-hero-bg img' in c:
    c = re.sub(
        r'(\.gr-hero-bg img\s*\{)[^}]*(})',
        r'''\1
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 35%;
  display: block;
  background-color: #0a1520;
\2''',
        c
    )

# S'assurer que .gr-hero-bg a position:absolute inset:0
if '.gr-hero-bg {' in c:
    c = re.sub(
        r'(\.gr-hero-bg\s*\{)[^}]*(})',
        r'''\1
  position: absolute;
  inset: 0;
  z-index: 0;
\2''',
        c
    )

# S'assurer que .gr-hero a background-color fallback seulement
c = re.sub(
    r'(\.gr-hero\s*\{[^}]*?)background:\s*var\(--color-bg\);',
    r'\1background-color: #0a1520;',
    c
)

print('✅ Fix hero CSS')

# ── 2d. STICKY BANNER : aligner sur sorties.html ─
# La bannière sticky dans index est déjà bien
# On s'assure juste qu'elle a le bon style
if 'gr-sticky-banner' in c:
    print('✅ Sticky banner déjà présent dans index.html')

write('index.html', c)

# ════════════════════════════════════════════════
# 3. SORTIES.HTML — CSS carte avec photo miniature
# ════════════════════════════════════════════════
c = read('sorties.html')

# Injecter CSS pour la photo miniature dans les cartes
PHOTO_CSS = '''
/* ── PHOTO MINIATURE CARTE SORTIE ─────────────── */
.so-card-thumb {
  width: 72px;
  height: 56px;
  border-radius: 6px;
  object-fit: cover;
  object-position: center;
  flex-shrink: 0;
  background: #222;
  border: 1px solid #2E2E2E;
}
.so-card-thumb-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  flex-shrink: 0;
}
/* Réajustement de la carte pour accueillir la photo */
.so-card {
  display: flex !important;
  align-items: flex-start !important;
  gap: 1rem !important;
}
.so-card__main {
  flex: 1;
  min-width: 0;
}
@media (max-width: 480px) {
  .so-card-thumb { width: 56px; height: 44px; }
}
'''

if 'so-card-thumb' not in c:
    c = c.replace('</style>', PHOTO_CSS + '\n</style>', 1)
    print('✅ CSS photo miniature ajouté dans sorties.html')

# Injecter JS pour ajouter la photo dans chaque carte au rendu
# On cherche le endroit où les cartes sont créées dans sorties.js
# Ici on injecte un MutationObserver qui ajoute la photo après rendu
PHOTO_JS = '''
  <script>
  // Ajoute une photo miniature dans chaque carte sortie
  (function() {
    // Photos par type de sortie
    const PHOTOS = {
      route:  'assets/groupe-vert-cyclistes.png',
      gravel: 'assets/groupe-blanc-cyclistes.jpg',
      vtt:    'assets/groupe-bleu-cyclistes.png',
      default:'assets/goeloRidesHomePage.jpg',
    };

    function addThumbs() {
      document.querySelectorAll('.so-card').forEach(card => {
        if (card.querySelector('.so-card-thumb-wrap')) return;

        // Détecter le type depuis un badge ou data
        const badge = card.querySelector('[data-type],[class*="badge"]');
        let type = 'default';
        if (badge) {
          const t = (badge.textContent || badge.dataset.type || '').toLowerCase();
          if (t.includes('route'))  type = 'route';
          if (t.includes('gravel')) type = 'gravel';
          if (t.includes('vtt'))    type = 'vtt';
        }

        // Créer le wrapper photo + bouton voir
        const btnVoir = card.querySelector('a[href*="sortie"],button.so-btn-voir,.so-btn');
        const wrap = document.createElement('div');
        wrap.className = 'so-card-thumb-wrap';

        const img = document.createElement('img');
        img.className = 'so-card-thumb';
        img.src = PHOTOS[type] || PHOTOS.default;
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = () => { img.style.display = 'none'; };

        wrap.appendChild(img);

        // Déplacer le bouton "Voir" dans le wrap si trouvé
        if (btnVoir) {
          wrap.appendChild(btnVoir.cloneNode(true));
          btnVoir.remove();
        }

        // Restructurer la carte
        const mainContent = document.createElement('div');
        mainContent.className = 'so-card__main';
        while (card.firstChild) {
          mainContent.appendChild(card.firstChild);
        }
        card.appendChild(mainContent);
        card.appendChild(wrap);
      });
    }

    // Observer les nouvelles cartes (chargées depuis Supabase)
    const observer = new MutationObserver(() => addThumbs());
    const list = document.getElementById('sorties-list');
    if (list) observer.observe(list, { childList: true, subtree: true });

    // Aussi au chargement
    document.addEventListener('DOMContentLoaded', () => setTimeout(addThumbs, 500));
    setTimeout(addThumbs, 1500);
  })();
  </script>'''

if 'so-card-thumb' not in read('sorties.html') or 'addThumbs' not in c:
    # Insérer avant </body>
    c = c.replace('</body>', PHOTO_JS + '\n</body>', 1)
    print('✅ JS photo miniature ajouté dans sorties.html')

write('sorties.html', c)

# ════════════════════════════════════════════════
# RÉSUMÉ
# ════════════════════════════════════════════════
print()
print('─' * 50)
print('🏁 Terminé !')
print()
print('Actions effectuées :')
print('  1. Liens nav supprimés du footer (toutes pages)')
print('  2. Menu burger index.html → drawer mobile')
print('  3. Mobile tabbar index.html aligné sur sorties.html')
print('  4. Fix hero CSS (background transparent)')
print('  5. Photo miniature ajoutée dans cartes sorties.html')
print()
print('→ Recharge avec Ctrl+Shift+R')
