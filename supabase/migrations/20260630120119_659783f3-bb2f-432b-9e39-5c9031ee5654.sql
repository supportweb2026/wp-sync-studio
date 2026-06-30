CREATE TABLE public.site_b_publications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  source_post_id integer,
  source_slug text,
  apify_run_id text,
  status text NOT NULL DEFAULT 'pending',
  post_url text,
  post_id integer,
  error text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_b_publications TO authenticated;
GRANT ALL ON public.site_b_publications TO service_role;
ALTER TABLE public.site_b_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own publications" ON public.site_b_publications FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER site_b_publications_touch BEFORE UPDATE ON public.site_b_publications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();