-- Extend access_log resource types for displacement, story, and person-page views.

ALTER TABLE public.access_log
  DROP CONSTRAINT IF EXISTS access_log_resource_type_check;

ALTER TABLE public.access_log
  ADD CONSTRAINT access_log_resource_type_check CHECK (
    resource_type IN (
      'verification_doc',
      'person_contact',
      'identity_verification',
      'person_displacement',
      'person_story',
      'person_page'
    )
  );

COMMENT ON TABLE public.access_log IS
  'Append-only access audit for sensitive views (verification docs, contact, displacement, story, living person pages).';
