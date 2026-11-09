export type PathNode = {
  person_id: string;
  relation: 'self' | 'parent' | 'child' | 'spouse' | 'sibling';
  name_ar: string | null;
  name_en: string | null;
  gender: 'M' | 'F' | 'X' | 'U' | null;
};

export type DegreesOk = {
  degrees: number;
  path: PathNode[];
  cached?: boolean;
};

/** null = inaccessible / no self / same person. Prefer throw for real RPC errors. */
export type DegreesResult = DegreesOk | { error: string } | null;

export function isDegreesOk(d: DegreesResult): d is DegreesOk {
  return d != null && 'degrees' in d && typeof (d as DegreesOk).degrees === 'number';
}

export type AllPathsResult = {
  paths: Array<{ degrees: number; path: PathNode[] }>;
  max_paths?: number;
  note?: string;
  error?: string;
} | null;
