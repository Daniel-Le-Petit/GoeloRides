-- GoëloRides — Storage bucket for reusable ride GPX files
-- Public read · authenticated team_rider/admin upload

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rides-gpx',
  'rides-gpx',
  true,
  10485760,
  ARRAY['application/gpx+xml', 'application/xml', 'text/xml', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public._goelo_can_upload_ride_gpx()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'team_rider')
  );
$$;

REVOKE ALL ON FUNCTION public._goelo_can_upload_ride_gpx() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._goelo_can_upload_ride_gpx() TO authenticated, service_role;

DROP POLICY IF EXISTS rides_gpx_public_read ON storage.objects;
CREATE POLICY rides_gpx_public_read
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'rides-gpx');

DROP POLICY IF EXISTS rides_gpx_auth_upload ON storage.objects;
CREATE POLICY rides_gpx_auth_upload
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'rides-gpx'
    AND public._goelo_can_upload_ride_gpx()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS rides_gpx_auth_update ON storage.objects;
CREATE POLICY rides_gpx_auth_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'rides-gpx'
    AND public._goelo_can_upload_ride_gpx()
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'rides-gpx'
    AND public._goelo_can_upload_ride_gpx()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS rides_gpx_auth_delete ON storage.objects;
CREATE POLICY rides_gpx_auth_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'rides-gpx'
    AND public._goelo_can_upload_ride_gpx()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
