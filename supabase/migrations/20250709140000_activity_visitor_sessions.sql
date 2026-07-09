-- GoëloRides — Parcours visiteur anonyme (visitor_session_id dans metadata).

DROP VIEW IF EXISTS public.activity_visitor_sessions;
DROP VIEW IF EXISTS public.activity_feed_human;

CREATE VIEW public.activity_feed_human AS
SELECT
  ae.id AS id,
  ae.event_type,
  ae.created_at,
  ae.entity_type,
  ae.entity_id,
  coalesce(ae.metadata, '{}'::jsonb) AS metadata,
  coalesce(
    nullif(trim(ae.metadata->>'actor_pseudo'), ''),
    nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
    'Quelqu''un'
  ) AS actor_pseudo,
  public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata) AS route_title,
  CASE ae.event_type
    WHEN 'USER_REGISTERED' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' a créé un compte'
    WHEN 'USER_LOGIN' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' s''est connecté'
    WHEN 'RIDE_CREATED' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' a créé la sortie '
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
      || CASE
        WHEN nullif(trim(ae.metadata->>'km'), '') IS NOT NULL
        THEN ' (' || trim(ae.metadata->>'km') || ' km)'
        ELSE ''
      END
    WHEN 'RIDE_JOINED' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' s''est inscrit·e à '
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
    WHEN 'RIDE_LEFT' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' s''est désinscrit·e de '
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
    WHEN 'RIDE_VIEWED' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' a consulté '
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
    WHEN 'COMMENT_CREATED' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' a commenté sur '
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
      || CASE
        WHEN coalesce(
          nullif(trim(ae.metadata->>'excerpt'), ''),
          nullif(trim(ae.metadata->>'preview'), '')
        ) IS NOT NULL
        THEN ' : « ' || coalesce(
          nullif(trim(ae.metadata->>'excerpt'), ''),
          nullif(trim(ae.metadata->>'preview'), '')
        ) || ' »'
        ELSE ''
      END
    WHEN 'LIKE_ADDED' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' a aimé '
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
    WHEN 'LIKE_REMOVED' THEN
      coalesce(
        nullif(trim(ae.metadata->>'actor_pseudo'), ''),
        nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
        'Quelqu''un'
      ) || ' a retiré son like sur '
      || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata)
    WHEN 'PAGE_HOME_VIEWED' THEN 'Visite page d''accueil'
    WHEN 'HOME_SCROLL_DEPTH' THEN
      'Scroll accueil'
      || coalesce(' ' || nullif(trim(ae.metadata->>'depth'), '') || '%', '')
    WHEN 'HOME_FOOTER_VIEWED' THEN 'Footer accueil vu'
    WHEN 'UPCOMING_RIDE_CARD_CLICKED' THEN
      'Clic carte sortie (accueil)'
      || coalesce(' — ' || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata), '')
    WHEN 'UPCOMING_RIDE_VIEW_CLICKED' THEN
      'Clic Voir sortie (accueil)'
      || coalesce(' — ' || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata), '')
    WHEN 'UPCOMING_RIDE_JOIN_CLICKED' THEN
      'Clic Rejoindre (accueil)'
      || coalesce(' — ' || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata), '')
    WHEN 'TEAM_RIDER_JOIN_CLICKED' THEN 'Clic Rejoindre Team Rider'
    WHEN 'PAGE_SORTIES_VIEWED' THEN 'Visite page sorties'
    WHEN 'SORTIES_SCROLL_DEPTH' THEN
      'Scroll sorties'
      || coalesce(' ' || nullif(trim(ae.metadata->>'depth'), '') || '%', '')
    WHEN 'SORTIES_FOOTER_VIEWED' THEN 'Footer sorties vu'
    WHEN 'RIDE_PARTICIPATE_CLICKED' THEN
      'Clic participer'
      || coalesce(' — ' || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata), '')
    WHEN 'PAGE_PARCOURS_VIEWED' THEN
      'Visite fiche parcours'
      || coalesce(' — ' || public.goelo_activity_route_title(ae.entity_type, ae.entity_id, ae.metadata), '')
    WHEN 'NAVIGATE_TO_SORTIES_CLICKED' THEN 'Navigation vers sorties'
    WHEN 'RIDE_INFO_OPENED' THEN
      'Info ouverte'
      || coalesce(' : ' || nullif(trim(ae.metadata->>'section'), ''), '')
    WHEN 'ERROR_API' THEN
      'Erreur API'
      || coalesce(
        ' (' || nullif(trim(coalesce(ae.metadata->>'source', ae.metadata->>'endpoint')), '') || ')',
        ''
      )
      || coalesce(' : ' || nullif(trim(ae.metadata->>'message'), ''), '')
    WHEN 'SUSPICIOUS_LOGIN' THEN
      'Connexion suspecte'
      || coalesce(
        ' depuis ' || nullif(trim(coalesce(ae.metadata->>'location_hint', ae.metadata->>'ip')), ''),
        ''
      )
      || CASE
        WHEN coalesce(
          nullif(trim(ae.metadata->>'actor_pseudo'), ''),
          nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
          'Quelqu''un'
        ) <> 'Quelqu''un'
        THEN ' — ' || coalesce(
          nullif(trim(ae.metadata->>'actor_pseudo'), ''),
          nullif(trim(public.get_display_name(p.pseudo, p.username, u.email)), ''),
          'Quelqu''un'
        )
        ELSE ''
      END
    ELSE NULL
  END AS label
FROM public.activity_events ae
LEFT JOIN public.profiles p ON p.id = ae.actor_id
LEFT JOIN auth.users u ON u.id = ae.actor_id;

COMMENT ON VIEW public.activity_feed_human IS
  'Feed admin humanisé : label = phrase complète, titres via track_name, parcours visiteur.';

GRANT SELECT ON public.activity_feed_human TO authenticated, service_role;

CREATE VIEW public.activity_visitor_sessions AS
SELECT
  nullif(trim(ae.metadata->>'visitor_session_id'), '') AS visitor_session_id,
  ae.created_at,
  ae.event_type,
  h.label,
  h.route_title,
  ae.actor_id,
  h.actor_pseudo
FROM public.activity_events ae
JOIN public.activity_feed_human h ON h.id = ae.id
WHERE nullif(trim(ae.metadata->>'visitor_session_id'), '') IS NOT NULL;

COMMENT ON VIEW public.activity_visitor_sessions IS
  'Parcours visiteur : requêter avec ORDER BY visitor_session_id, created_at.';

GRANT SELECT ON public.activity_visitor_sessions TO authenticated, service_role;
