DO $$
DECLARE live_id uuid; draft_count integer;
BEGIN
 SELECT id INTO STRICT live_id FROM public.ride_albums
 WHERE ride_date='2026-08-01' AND title ~ '#6([^0-9]|$)' AND published=true;
 IF EXISTS(SELECT 1 FROM public.ride_albums WHERE ride_date='2026-08-01' AND title ~ '#6([^0-9]|$)' AND NOT published AND (jsonb_array_length(photos)>0 OR facebook_url<>'')) THEN
 RAISE EXCEPTION 'Le brouillon contient des photos ou un lien Facebook : fusion nécessaire.';
 END IF;
 UPDATE public.ride_albums a SET route_id=coalesce(a.route_id,(SELECT d.route_id FROM public.ride_albums d WHERE d.ride_date='2026-08-01' AND d.title ~ '#6([^0-9]|$)' AND NOT d.published AND d.route_id IS NOT NULL ORDER BY d.updated_at DESC LIMIT 1)),updated_at=now() WHERE a.id=live_id;
 DELETE FROM public.ride_albums WHERE ride_date='2026-08-01' AND title ~ '#6([^0-9]|$)' AND NOT published AND jsonb_array_length(photos)=0 AND facebook_url='';
 GET DIAGNOSTICS draft_count = ROW_COUNT;
 RAISE NOTICE 'Brouillons vides supprimés : %',draft_count;
END $$;
SELECT title,ride_date,published,route_id,jsonb_array_length(photos) AS photos FROM public.ride_albums WHERE ride_date='2026-08-01' AND title ~ '#6([^0-9]|$)';
