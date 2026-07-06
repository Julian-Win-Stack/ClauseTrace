export interface Span {
  start: number;
  end: number;
}

/** One row of the answer-key CSV. */
export interface KeyItem {
  id: string;
  quote: string;
}

/** A key item whose quote was located in full_text (offsets into full_text). */
export interface ResolvedKeyItem extends KeyItem {
  start: number;
  end: number;
}

export type AppStatus = 'grounded' | 'abstained' | 'excluded';

/** One requirement from the app's analysis, reduced to what grading needs. */
export interface AppRequirement {
  ordinal: number;
  text: string;
  status: AppStatus;
  /** Verified citation spans only — the offsets grading points at. */
  spans: Span[];
}

export interface FoundMatch {
  key: ResolvedKeyItem;
  req: AppRequirement;
  /** overlap chars ÷ key length; a low value is a grazing match worth eyeballing. */
  overlapRatio: number;
}

/** A key item the app pointed at but grounding rejected (recall hit, grounding miss). */
export interface ExcludedMatch {
  key: ResolvedKeyItem;
  reqs: AppRequirement[];
}

export interface MatchResult {
  found: FoundMatch[];
  missed: ResolvedKeyItem[];
  excluded: ExcludedMatch[];
  extra: AppRequirement[];
}
