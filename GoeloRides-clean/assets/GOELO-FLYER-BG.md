# Photo de fond pour le flyer (étape 6)

Pour utiliser **ta** photo paysage + cyclistes (format proche **9:16** ou plus large) :

1. Enregistre le fichier sous **`goelo-flyer-bg.jpg`** ou **`goelo-flyer-bg.png`** dans ce dossier `assets/`.
2. Recharge la page Sorties / Index, ouvre la modale sortie, étape 6, puis **Générer le flyer**.

Sinon, le site essaie dans l’ordre : `goelo-flyer-bg.jpg`, `goelo-flyer-bg.png`, puis le modèle Story existant `gestion-sorties-story-exemple.png`.

Tu peux aussi définir dans la page HTML, **avant** `parcours.js` :

```html
<script>window.GOELO_FLYER_BG_URL = "https://exemple.org/ma-photo.jpg";</script>
```

L’image est recadrée en **720×1280** (centrage type Story).
