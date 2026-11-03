/*
 * The figure's settings in the docs: the design workbench's dial defaults
 * (apps/web, zk-program-config.ts), sized to the docs' text column and code.
 */
export const PROGRAM_VALUES = {
  lanes: {
    mode: "off" as string,
    spacing: 118,
    left: 14,
    gutterGap: 16,
    lines: "neutral" as string,
    lineStrength: 0.35,
    dot: 3,
  },
  trust: {
    palette: "two" as string,
    boundary: "none" as string,
    crossings: false,
    badges: "same" as string,
    icons: true,
    band: 0.07,
    strip: 3,
    sideWidth: 400,
    developer: "#e11d48",
    auditor: "#2563eb",
  },
  headings: {
    structure: "headings" as string,
    title: 40,
    phase: 18,
    section: 16,
    phaseGap: 28,
    sectionGap: 16,
    body: "flush" as string,
    bodyIndent: 12,
    numbers: false,
    dividers: false,
    actorDots: false,
  },
  actors: {
    style: "badge" as string,
    repeatNames: false,
    tintRows: false,
  },
  colors: {
    certifiers: "#0d9488",
    workers: "#e11d48",
    zkServer: "#d97706",
    challenger: "#2563eb",
    verifier: "#7c3aed",
  },
  code: {
    values: "plain" as string,
    commitments: "name" as string,
    assign: "=" as string,
    outputs: "chip" as string,
    functionColor: "var(--foreground)",
  },
  blocks: {
    style: "outline" as string,
    split: "runs" as string,
    padX: 16,
    padY: 12,
    radius: 8,
    gap: 0,
  },
  params: {
    style: "table" as string,
  },
  layout: {
    width: 680,
    rowHeight: 24,
    indent: 14,
    cardGap: 12,
    nameGap: 14,
  },
  type: {
    body: 16,
    code: 14,
    actor: 13,
    label: 13,
  },
  cards: {
    style: "outline" as string,
    radius: 10,
  },
}

export type ProgramValues = typeof PROGRAM_VALUES
