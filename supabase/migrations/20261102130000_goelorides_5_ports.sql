DO $$
DECLARE rid text;
BEGIN
 SELECT id INTO rid FROM public.routes WHERE id='goelorides_5' OR (front_config->>'rideDateIso'='2026-07-28' AND track_name ~ '#5([^0-9]|$)') ORDER BY CASE WHEN id='goelorides_5' THEN 0 ELSE 1 END,id LIMIT 1;
 IF rid IS NULL THEN
 rid := 'goelorides_5';
 INSERT INTO public.routes(id,track_name,sort_order,is_active,route_kind,front_config) VALUES(rid,'GoëloRides #5 - La boucle des ports du Goëlo',5,true,'custom',jsonb_build_object('visibility','public','sortieStatus','publiee','raceType','route','rideDateIso','2026-07-28','meetPlace','Casino - Saint-Quay-Portrieux','city','Saint-Quay-Portrieux','description','Encore une belle matinée sur les routes du Goëlo ! Des paysages magnifiques, une ambiance conviviale, de belles montées, de bons relais… et surtout le plaisir de rouler. Un grand merci aux participants pour leur bonne humeur. Envie de nous rejoindre lors de la prochaine sortie ? Les parcours sont ouverts à tous selon le niveau annoncé. Inscris-toi et viens rouler quelques kilomètres avec nous !'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ride_albums WHERE route_id=rid OR (ride_date='2026-07-28' AND title ~ '#5([^0-9]|$)')) THEN
 INSERT INTO public.ride_albums(route_id,title,ride_date,description,published) VALUES(rid,'GoëloRides #5 - La boucle des ports du Goëlo','2026-07-28','Encore une belle matinée sur les routes du Goëlo ! Des paysages magnifiques, une ambiance conviviale, de belles montées, de bons relais… et surtout le plaisir de rouler. Un grand merci aux participants pour leur bonne humeur. Envie de nous rejoindre lors de la prochaine sortie ? Les parcours sont ouverts à tous selon le niveau annoncé. Inscris-toi et viens rouler quelques kilomètres avec nous !',false);
 ELSE
 UPDATE public.ride_albums SET route_id=rid,updated_at=now() WHERE route_id IS NULL AND ride_date='2026-07-28' AND title ~ '#5([^0-9]|$)';
 END IF;
END $$;
SELECT r.track_name,a.ride_date,a.route_id,a.published FROM public.routes r JOIN public.ride_albums a ON a.route_id=r.id WHERE r.front_config->>'rideDateIso'='2026-07-28' AND r.track_name ~ '#5([^0-9]|$)';
