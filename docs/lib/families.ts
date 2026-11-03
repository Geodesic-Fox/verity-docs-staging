/*
 * Backend families, lettered. `column` is the name the benchmark renderer
 * uses for the family (Table 2's column); `name` is what the site shows.
 * Frozen families have no page.
 */
export const families = [
  { letter: "A", name: "A-GKR", column: "A-GKR", href: null },
  { letter: "B", name: "B-Ligero", column: "B-Ligero", href: null },
  { letter: "C", name: "C-Flock", column: "Flock", href: "/docs/proof-systems/c-flock" },
  { letter: "D", name: "D-SP1", column: "SP1", href: null },
] as const

export type Family = (typeof families)[number]

const byColumn = new Map<string, Family>(families.map((f) => [f.column, f]))

// The site's name for a renderer column, or the column itself.
export function familyName(column: string): string {
  return byColumn.get(column)?.name ?? column
}
