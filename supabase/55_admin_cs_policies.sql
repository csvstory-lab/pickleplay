-- P!CKLE — 관리자 CS (admin_cs.html) inquiries / faqs / cs_settings
-- 운영 환경에서는 authenticated + admin role 로 제한 권장

DROP POLICY IF EXISTS inquiries_select_admin ON public.inquiries;
CREATE POLICY inquiries_select_admin
  ON public.inquiries FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS inquiries_update_admin ON public.inquiries;
CREATE POLICY inquiries_update_admin
  ON public.inquiries FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS faqs_select_admin ON public.faqs;
CREATE POLICY faqs_select_admin
  ON public.faqs FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS faqs_insert_admin ON public.faqs;
CREATE POLICY faqs_insert_admin
  ON public.faqs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS faqs_update_admin ON public.faqs;
CREATE POLICY faqs_update_admin
  ON public.faqs FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS faqs_delete_admin ON public.faqs;
CREATE POLICY faqs_delete_admin
  ON public.faqs FOR DELETE
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS cs_settings_update_admin ON public.cs_settings;
CREATE POLICY cs_settings_update_admin
  ON public.cs_settings FOR UPDATE
  TO anon, authenticated
  USING (id = 1)
  WITH CHECK (id = 1);

NOTIFY pgrst, 'reload schema';
