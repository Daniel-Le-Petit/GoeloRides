-- Albums publics, administration et téléversement réservés aux administrateurs.
CREATE OR REPLACE FUNCTION public.gallery_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public._home_alerts_is_admin();
$$;
REVOKE ALL ON FUNCTION public.gallery_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gallery_is_admin() TO anon,authenticated;
CREATE TABLE IF NOT EXISTS public.ride_albums (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 route_id text REFERENCES public.routes(id) ON DELETE SET NULL,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
 ride_date date NOT NULL,
 description text NOT NULL DEFAULT '' CHECK(length(description)<=1500),
 photos jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(photos)='array' AND jsonb_array_length(photos)<=40),
 facebook_url text NOT NULL DEFAULT '' CHECK(facebook_url='' OR facebook_url ~ '^https://(www\.)?facebook\.com/'),
 published boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ride_albums ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS albums_read ON public.ride_albums;
CREATE POLICY albums_read ON public.ride_albums FOR SELECT TO anon,authenticated USING(published OR public.gallery_is_admin());
DROP POLICY IF EXISTS albums_admin ON public.ride_albums;
CREATE POLICY albums_admin ON public.ride_albums FOR ALL TO authenticated USING(public.gallery_is_admin()) WITH CHECK(public.gallery_is_admin());
GRANT SELECT ON public.ride_albums TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ride_albums TO authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('ride-photos','ride-photos',true,5242880,ARRAY['image/jpeg','image/png','image/webp'])
 ON CONFLICT(id) DO UPDATE SET public=true,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS ride_photos_insert ON storage.objects;
CREATE POLICY ride_photos_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='ride-photos' AND public.gallery_is_admin());
DROP POLICY IF EXISTS ride_photos_delete ON storage.objects;
CREATE POLICY ride_photos_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='ride-photos' AND public.gallery_is_admin());
NOTIFY pgrst,'reload schema';
