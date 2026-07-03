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

export interface Citation {
  quote: string;
  verified: boolean;
  start: number | null;
  end: number | null;
  method: 'exact' | 'normalized' | 'none';
}

export interface Requirement {
  ordinal: number;
  requirement_text: string;
  status: RequirementStatus;
  citations: Citation[];
  faithfulness: 'supported' | 'needs_review' | null;
  faithfulness_reason: string | null;
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
