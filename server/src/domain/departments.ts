/**
 * The controlled vocabulary of impacted departments / functional areas.
 * The model may only choose from this list; code discards anything else.
 */
export const DEPARTMENTS = [
  'Utilization Management / Prior Authorization',
  'Claims',
  'Member Services',
  'Provider Network Management',
  'Quality Improvement',
  'Pharmacy / Formulary',
  'Appeals & Grievances',
  'Care Management / Case Management',
  'Behavioral Health',
  'Compliance / Regulatory Affairs',
  'Enrollment & Eligibility',
  'Finance',
  'Delegation Oversight',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export function isValidDepartment(value: string): value is Department {
  return (DEPARTMENTS as readonly string[]).includes(value);
}
