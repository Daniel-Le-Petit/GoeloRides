DO $$
DECLARE rid text;
BEGIN
 SELECT id INTO STRICT rid FROM public.routes WHERE front_config->>'rideDateIso'='2026-08-01' AND track_name ~ '#6([^0-9]|$)';
 UPDATE public.routes SET track_name='GoëloRides #6 - La traversée du Goëlo',
 group_label='Groupe Blanc',pace_label='Rythme modéré',
 front_config=coalesce(front_config,'{}'::jsonb)||jsonb_build_object('rideDateIso','2026-08-01','rideTime','09:00','meetTime','09:00','meetPlace','Casino de Saint-Quay-Portrieux','raceType','route','levelClass','level-blanc','km',48.4,'dplus',461,'estimatedDurationHm','2h12','description','Une belle traversée du Goëlo, accessible et idéale pour rouler ensemble sans chercher la performance. 48,4 km et 461 m de dénivelé positif, pour environ 2h12 de vélo sur route. Groupe Blanc, à un rythme modéré. Départ à 9h00 du Casino de Saint-Quay-Portrieux.','stats',coalesce(front_config->'stats','{}'::jsonb)||jsonb_build_object('totalKm',48.4,'elevGainM',461))
 WHERE id=rid;
 IF NOT EXISTS(SELECT 1 FROM public.ride_albums WHERE route_id=rid OR (ride_date='2026-08-01' AND title ~ '#6([^0-9]|$)')) THEN
 INSERT INTO public.ride_albums(route_id,title,ride_date,description,published)
 VALUES(rid,'GoëloRides #6 - La traversée du Goëlo','2026-08-01','Une belle traversée du Goëlo, accessible et idéale pour rouler ensemble sans chercher la performance. 48,4 km et 461 m de dénivelé positif, pour environ 2h12 de vélo sur route. Groupe Blanc, à un rythme modéré. Départ à 9h00 du Casino de Saint-Quay-Portrieux.',false);
 ELSE
 UPDATE public.ride_albums SET route_id=rid,updated_at=now() WHERE route_id IS NULL AND ride_date='2026-08-01' AND title ~ '#6([^0-9]|$)';
 END IF;
END $$;
SELECT r.track_name,a.ride_date,a.route_id,a.published FROM public.routes r JOIN public.ride_albums a ON a.route_id=r.id WHERE r.front_config->>'rideDateIso'='2026-08-01' AND r.track_name ~ '#6([^0-9]|$)';
