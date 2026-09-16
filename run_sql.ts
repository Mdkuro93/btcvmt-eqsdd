import { supabase, isSupabaseConfigured } from './src/lib/supabase';

async function run() {
  if (!isSupabaseConfigured) {
    console.log("No Supabase");
    return;
  }
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_string: `
      DO $$
      BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'asset_declaration_requests' AND policyname = 'Admins can update asset_declaration_requests'
        ) THEN
            CREATE POLICY "Admins can update asset_declaration_requests"
              ON asset_declaration_requests FOR UPDATE
              TO authenticated
              USING (
                EXISTS (
                  SELECT 1 FROM profiles
                  WHERE profiles.id = auth.uid()
                  AND profiles.role IN ('super_admin', 'admin', 'btc_manager')
                )
              );
        END IF;
      END
      $$;
    `
  });
  console.log("Error?", error);
}

run();
