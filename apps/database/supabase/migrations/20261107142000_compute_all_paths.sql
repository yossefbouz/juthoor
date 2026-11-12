-- W3.3 / D12: return up to N alternate paths (not only shortest) between two
-- persons. Same edge set as compute_degrees (parent/child/spouse/sibling +
-- same_as hops). Max depth 8. Names masked per-viewer via mask_degrees_path.

CREATE OR REPLACE FUNCTION public.compute_all_paths(
  p_source   uuid,
  p_target   uuid,
  p_max_paths int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_src_tree uuid;
  v_max int;
  v_paths jsonb := '[]'::jsonb;
  v_row record;
BEGIN
  IF p_source IS NULL OR p_target IS NULL OR p_source = p_target THEN
    RETURN jsonb_build_object('paths', jsonb_build_array(), 'note', 'same_person');
  END IF;

  SELECT tree_id INTO v_src_tree FROM public.persons WHERE id = p_source;
  IF v_src_tree IS NULL OR NOT public.can_access_tree(v_src_tree) THEN
    RETURN NULL;
  END IF;

  v_max := GREATEST(1, LEAST(COALESCE(p_max_paths, 5), 10));

  FOR v_row IN
    WITH RECURSIVE edges AS (
      SELECT fam.partner1_id AS a, fc.child_id AS b, 'parent'::text AS rel
        FROM public.family_children fc JOIN public.families fam ON fam.id = fc.family_id
        WHERE fam.partner1_id IS NOT NULL
      UNION ALL
      SELECT fam.partner2_id, fc.child_id, 'parent'
        FROM public.family_children fc JOIN public.families fam ON fam.id = fc.family_id
        WHERE fam.partner2_id IS NOT NULL
      UNION ALL
      SELECT fc.child_id, fam.partner1_id, 'child'
        FROM public.family_children fc JOIN public.families fam ON fam.id = fc.family_id
        WHERE fam.partner1_id IS NOT NULL
      UNION ALL
      SELECT fc.child_id, fam.partner2_id, 'child'
        FROM public.family_children fc JOIN public.families fam ON fam.id = fc.family_id
        WHERE fam.partner2_id IS NOT NULL
      UNION ALL
      SELECT partner1_id, partner2_id, 'spouse' FROM public.families
        WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL
      UNION ALL
      SELECT partner2_id, partner1_id, 'spouse' FROM public.families
        WHERE partner1_id IS NOT NULL AND partner2_id IS NOT NULL
      UNION ALL
      SELECT fc1.child_id, fc2.child_id, 'sibling'
        FROM public.family_children fc1
        JOIN public.family_children fc2 ON fc1.family_id = fc2.family_id
        WHERE fc1.child_id <> fc2.child_id
      UNION ALL
      SELECT person_a_id, person_b_id, 'same_as' FROM public.person_links WHERE status = 'confirmed'
      UNION ALL
      SELECT person_b_id, person_a_id, 'same_as' FROM public.person_links WHERE status = 'confirmed'
    ),
    bfs AS (
      SELECT
        p_source AS node,
        0 AS depth,
        ARRAY[p_source] AS path,
        ARRAY[]::text[] AS rels
      UNION ALL
      SELECT
        e.b,
        bfs.depth + CASE WHEN e.rel = 'same_as' THEN 0 ELSE 1 END,
        bfs.path || e.b,
        bfs.rels || e.rel
      FROM bfs
      JOIN edges e ON e.a = bfs.node
      WHERE bfs.depth < 8
        AND NOT (e.b = ANY(bfs.path))
        AND cardinality(bfs.path) < 16
    ),
    hits AS (
      SELECT *
      FROM bfs
      WHERE node = p_target
      ORDER BY depth ASC, cardinality(path) ASC
      LIMIT v_max
    )
    SELECT
      h.depth AS degrees,
      (SELECT jsonb_agg(
          jsonb_build_object(
            'person_id', pid,
            'relation', CASE WHEN idx = 1 THEN 'self' ELSE h.rels[idx - 1] END
          ) ORDER BY idx)
        FROM unnest(h.path) WITH ORDINALITY AS t(pid, idx)
      ) AS struct_path
    FROM hits h
  LOOP
    v_paths := v_paths || jsonb_build_array(
      jsonb_build_object(
        'degrees', v_row.degrees,
        'path', public.mask_degrees_path(p_source, v_row.struct_path)
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'paths', v_paths,
    'max_paths', v_max,
    'note', 'all_paths_within_graph'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_all_paths(uuid, uuid, int) TO authenticated;

COMMENT ON FUNCTION public.compute_all_paths IS
  'W3.3/D12: limited multi-path BFS (default 5 paths, depth ≤ 8) between two persons. Masks names via mask_degrees_path. Source-access guard matches compute_degrees.';
