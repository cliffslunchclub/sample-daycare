export const substitutionCodes = ['A', 'B', 'C', 'V'] as const;
export function substitutionName(school: { sub_option_names?: Record<string, string> } | null | undefined, code: string): string {
  return school?.sub_option_names?.[code]?.trim() || code;
}
