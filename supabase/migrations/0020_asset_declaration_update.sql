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
