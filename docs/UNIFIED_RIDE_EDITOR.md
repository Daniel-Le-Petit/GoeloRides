# Un seul éditeur de sortie

Le point d’entrée est `gestion-sorties.html?mode=create`, libellé « Créer une sortie » sur l’accueil, le cockpit et les accès de création. Le même formulaire gère la modification (`mode=edit&id=…`), la duplication (`mode=duplicate&id=…`) et la reprise d’une trace de la bibliothèque (`mode=create&ride=…`).

- « Voir » ouvre toujours `parcours.html?id=…`, y compris dans le cockpit. « Modifier » ouvre l’éditeur.
- La bibliothèque Itinéraires sert à stocker/importer des traces. « Utiliser cet itinéraire » ouvre l’éditeur commun ; choisir une trace ne publie rien.
- Le formulaire permet aussi de choisir une trace existante, sans effacer le titre, la date, le groupe ou les horaires déjà renseignés.
- Les quatre rubriques principales concernent les informations, le départ, la trace et l’organisation. Sécurité, flyer et textes sociaux restent dans des blocs repliables facultatifs.
- Une création propose « Enregistrer brouillon » et « Publier la sortie ». Le titre et une date valide sont nécessaires à la publication ; aucune date n’est choisie automatiquement.
- Pour une sortie publiée, le bouton devient « Enregistrer les modifications ». Son état est conservé, notamment pour une sortie annulée. La gestion (statut, duplication, annulation) est séparée de la création.
- La duplication prépare une nouvelle sortie sans date ni participants et ne touche pas à l’original.
- Les paramètres existants, l’adresse, la météo et le matériel sont conservés à l’enregistrement. Une source introuvable bloque les actions plutôt que de préparer une sortie vide.

Les anciennes pages `new-gestion-sorties.html` et `team-rider-info.html` redirigent respectivement vers l’éditeur commun (avec paramètres conservés) et le cockpit courant. L’ancien assistant de création de l’accueil a été retiré.

Vérifications : parcours navigateur avec réponses Supabase simulées (création, brouillon incomplet, modification, duplication, reprise de trace, conservation des réglages et des états, source introuvable, redirection, mobile), tests des permissions sur la fiche et tests de persistance de l’annulation. Aucune sortie réelle n’a été créée pendant les essais.
