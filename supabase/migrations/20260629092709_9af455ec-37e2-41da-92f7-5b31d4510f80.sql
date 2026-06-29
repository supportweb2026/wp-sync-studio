
CREATE TABLE public.wp_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('source', 'destination')),
  site_url TEXT NOT NULL,
  username TEXT NOT NULL,
  app_password_encrypted TEXT NOT NULL,
  last_tested_at TIMESTAMPTZ,
  last_capabilities JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_connections TO authenticated;
GRANT ALL ON public.wp_connections TO service_role;
ALTER TABLE public.wp_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own connections" ON public.wp_connections FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.migration_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  total INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  report JSONB NOT NULL DEFAULT '[]'::jsonb,
  log JSONB NOT NULL DEFAULT '[]'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_runs TO authenticated;
GRANT ALL ON public.migration_runs TO service_role;
ALTER TABLE public.migration_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs" ON public.migration_runs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER wp_connections_touch BEFORE UPDATE ON public.wp_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
