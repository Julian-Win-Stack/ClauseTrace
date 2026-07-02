export interface AplListItem {
  id: number;
  apl_number: string | null;
  title: string;
  issued_date: string | null;
  is_adhoc: boolean;
  analyzed: boolean;
  created_at: string;
}

export interface Apl {
  id: number;
  apl_number: string | null;
  title: string;
  issued_date: string | null;
  source_url: string | null;
  full_text: string;
  char_length: number;
  is_adhoc: boolean;
  summary: string | null;
  analyzed_at: string | null;
}

export interface ActionItem {
  text: string;
  suggested_owner_department: string;
  priority: 'high' | 'medium' | 'low';
}

export type RequirementStatus = 'grounded' | 'abstained' | 'excluded';

export interface Requirement {
  ordinal: number;
  requirement_text: string;
  source_quote: string | null;
  status: RequirementStatus;
  verification_method: 'exact' | 'normalized' | 'none';
  source_start_offset: number | null;
  source_end_offset: number | null;
  impacted_departments: string[];
  action_items: ActionItem[];
}

export interface Analysis {
  summary: string | null;
  analyzed_at: string | null;
  requirements: Requirement[];
}

export interface AnalysisResult extends Analysis {
  aplId: number;
  warnings: string[];
}

export interface AplDetail {
  apl: Apl;
  analysis: Analysis | null;
}

export interface Span {
  start: number;
  end: number;
}
