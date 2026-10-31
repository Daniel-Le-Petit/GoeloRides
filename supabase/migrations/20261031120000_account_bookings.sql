-- Liste personnelle : identité issue du JWT, jamais d'un identifiant fourni par le navigateur.
CREATE OR REPLACE FUNCTION public.account_my_bookings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(latest) || jsonb_build_object('route', to_jsonb(r))), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (s.route_id) s.* FROM public.signups s
    WHERE s.user_id = auth.uid()
    ORDER BY s.route_id, s.created_at DESC NULLS LAST, s.id DESC
  ) latest
  LEFT JOIN public.routes r ON r.id::text = latest.route_id
  WHERE latest.status IN ('joined', 'waiting') AND latest.canceled_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.account_my_bookings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_my_bookings() TO authenticated;

-- Annulation idempotente : même verrou que toggle_signup et promotion de la file.
CREATE OR REPLACE FUNCTION public.account_cancel_booking(p_route_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  rid text := trim(p_route_id);
  cap record;
  latest public.signups;
  fc jsonb;
  departure timestamptz;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_authenticated'); END IF;
  IF rid IS NULL OR length(rid) NOT BETWEEN 1 AND 150 THEN RETURN jsonb_build_object('ok',false,'error','invalid_route'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('signup:'||rid,0));
  SELECT * INTO cap FROM public._signup_route_capacity(rid);
  IF NOT cap.route_ok THEN RETURN jsonb_build_object('ok',false,'error','invalid_route'); END IF;
  IF cap.sortie_status NOT IN ('open','published','publiee','publiée') THEN
    RETURN jsonb_build_object('ok',false,'error','sortie_closed');
  END IF;
  SELECT front_config INTO fc FROM public.routes WHERE id::text=rid;
  IF coalesce(fc->>'rideDateIso','') ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN
      departure := ((fc->>'rideDateIso') || ' ' || coalesce(nullif(fc->>'rideTime',''),'08:30'))::timestamp AT TIME ZONE 'Europe/Paris';
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RETURN jsonb_build_object('ok',false,'error','invalid_departure');
    END;
    IF departure <= now() THEN RETURN jsonb_build_object('ok',false,'error','sortie_past'); END IF;
  END IF;
  latest := public._signup_latest_row(rid, uid);
  UPDATE public.signups SET status='cancelled', canceled_at=now()
  WHERE route_id=rid AND user_id=uid AND status IN ('joined','waiting') AND canceled_at IS NULL;
  IF latest.status='joined' AND latest.canceled_at IS NULL THEN PERFORM public._signup_promote_waitlist(rid); END IF;
  RETURN jsonb_build_object('ok',true,'action','removed','joined',false);
END $$;
REVOKE ALL ON FUNCTION public.account_cancel_booking(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_cancel_booking(text) TO authenticated;
