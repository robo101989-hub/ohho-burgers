
UPDATE storage.buckets
SET
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE id = 'menu-images';

DROP POLICY IF EXISTS menu_images_authenticated_insert ON storage.objects;
DROP POLICY IF EXISTS menu_images_authenticated_update ON storage.objects;
DROP POLICY IF EXISTS menu_images_authenticated_delete ON storage.objects;

CREATE POLICY menu_images_admin_owner_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'menu-images'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.role IN ('ADMIN'::public.user_role, 'OWNER'::public.user_role)
  )
);

CREATE POLICY menu_images_admin_owner_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'menu-images'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.role IN ('ADMIN'::public.user_role, 'OWNER'::public.user_role)
  )
)
WITH CHECK (
  bucket_id = 'menu-images'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.role IN ('ADMIN'::public.user_role, 'OWNER'::public.user_role)
  )
);

CREATE POLICY menu_images_admin_owner_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'menu-images'
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND p.role IN ('ADMIN'::public.user_role, 'OWNER'::public.user_role)
  )
);
