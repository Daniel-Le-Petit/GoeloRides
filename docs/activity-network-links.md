# Visites répétées par réseau

L’onglet Activité → Retours réseau rapproche les activités reçues après installation de la migration. Aucune ancienne IP n’est récupérée ou reconstruite.

Le déclencheur lit uniquement les activités émises par la RPC activity_event_log. Il utilise l’adresse transmise dans les en-têtes du proxy (cf-connecting-ip, puis x-real-ip, puis premier élément x-forwarded-for). Sans adresse exploitable, aucune clé réseau n’est créée. Ne jamais remplacer cette absence par l’adresse PostgreSQL ou une adresse de passerelle commune.

Cette provenance dépend du proxy Supabase et doit être considérée comme un indice, pas comme une IP certifiée : des en-têtes peuvent être absents ou modifiés. Ce mécanisme ne sert ni à l’authentification ni à une décision concernant une personne.

La clé est un SHA-256 d’un secret serveur aléatoire, du mois de Paris et de l’IP canonique. Le secret et les rapprochements restent dans des tables sans accès anon/authenticated. Seule la RPC admin_activity_network_links peut rendre les clés à un utilisateur dont le profil est admin. Aucune IP brute n’est ajoutée aux événements, au navigateur, aux logs ou au CSV d’export.

Les clés changent chaque mois. Le lecteur refuse les liens âgés de plus de 30 jours. La suppression physique s’exécute quotidiennement par Actions, et lors de la prochaine activité mesurable. Supprimer un événement supprime son lien. La purge Actions exige le secret GitHub SUPABASE_DATABASE_URL déjà utilisé pour les migrations.

Les listes comptent les parcours séparés après 30 minutes et distinguent les identifiants de navigateur. Une IP partagée ne fusionne pas les identités. Ni un clic sans confirmation ni l’absence de compte ne prouvent un refus ou une cause. Les filtres admin/robots/période s’appliquent avant regroupement.

Diagnostic : une collecte installée peut rester vide si le proxy ne transmet aucun de ces en-têtes. L’interface doit alors afficher zéro donnée rapprochable, jamais inventer un réseau commun.
