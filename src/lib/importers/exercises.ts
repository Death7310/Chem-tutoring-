/** Finds likely end-of-chapter exercise sections in a book, to suggest as practice-problem sources. */

export interface SectionText {
  index: number;
  title: string;
  text: string;
}

export interface ExerciseRange {
  start: number;
  end: number;
  label: string;
}

const HEADING =
  /^\s*(chemistry\s+)?(end[- ]of[- ]chapter\s+)?(exercises|problems|questions and problems|review questions|practice problems|additional problems|conceptual problems|homework problems)\s*$/im;

/** Lines like "12. Calculate…" or "12) …" — numbered exercise items. */
function numberedItems(text: string): number {
  return (text.match(/^\s*\d{1,3}\s*[.)]\s+\S/gm) ?? []).length;
}

/** Pages (or chapters) that are exercise sections, grouped into contiguous ranges. */
export function detectExerciseRanges(sections: SectionText[]): ExerciseRange[] {
  const ranges: ExerciseRange[] = [];
  let current: ExerciseRange | null = null;

  for (const section of sections) {
    const heading = HEADING.test(section.text) || HEADING.test(section.title);
    const items = numberedItems(section.text);
    const continues = current !== null && section.index === current.end + 1 && items >= 3;

    if (heading && (items >= 2 || HEADING.test(section.title))) {
      if (current && section.index === current.end + 1) {
        current.end = section.index;
      } else {
        if (current) ranges.push(current);
        current = { start: section.index, end: section.index, label: section.title };
      }
    } else if (continues && current) {
      current.end = section.index;
    } else if (current) {
      ranges.push(current);
      current = null;
    }
  }
  if (current) ranges.push(current);
  return ranges;
}
