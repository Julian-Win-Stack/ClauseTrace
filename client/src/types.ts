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
  summary: string;
  requirements: Requirement[];
}

export interface AnalysisResult extends Analysis {
  warnings: string[];
}

export interface Span {
  start: number;
  end: number;
}
