/**
 * Entry document merger - merges template and custom sections
 */

const MANAGED_START = '<!-- omcustom:start -->';
const MANAGED_END = '<!-- omcustom:end -->';

/**
 * Section type in entry document
 */
export type SectionType = 'managed' | 'custom';

/**
 * A section in the entry document
 */
export interface Section {
  /** Type of section */
  type: SectionType;
  /** Content of the section */
  content: string;
}

/**
 * Result of merging entry documents
 */
export interface MergeResult {
  /** Merged content */
  content: string;
  /** Number of managed sections */
  managedSections: number;
  /** Number of custom sections */
  customSections: number;
  /** Warnings encountered during merge */
  warnings: string[];
}

/**
 * Check if a line is a code block delimiter
 */
function isCodeBlockDelimiter(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('```') || trimmed.startsWith('~~~');
}

/**
 * Handle managed section start marker
 */
function handleManagedStart(
  currentLines: string[],
  sections: Section[]
): { currentSection: Section; currentLines: string[] } {
  // Save any pending custom section
  if (currentLines.length > 0) {
    sections.push({
      type: 'custom',
      content: currentLines.join('\n'),
    });
  }
  return {
    currentSection: { type: 'managed', content: '' },
    currentLines: [],
  };
}

/**
 * Handle managed section end marker
 */
function handleManagedEnd(
  currentSection: Section | null,
  currentLines: string[],
  sections: Section[]
): { currentSection: Section | null; currentLines: string[] } {
  if (currentSection && currentSection.type === 'managed') {
    currentSection.content = currentLines.join('\n');
    sections.push(currentSection);
    return {
      currentSection: null,
      currentLines: [],
    };
  }
  return { currentSection, currentLines };
}

/**
 * Parse entry doc into managed and custom sections
 */
export function parseEntryDoc(content: string): { sections: Section[] } {
  const sections: Section[] = [];
  const lines = content.split('\n');
  let currentSection: Section | null = null;
  let currentLines: string[] = [];
  let insideCodeBlock = false;

  for (const line of lines) {
    // Track fenced code block boundaries
    if (isCodeBlockDelimiter(line)) {
      insideCodeBlock = !insideCodeBlock;
    }

    // Process markers only outside code blocks
    if (!insideCodeBlock) {
      const trimmed = line.trim();

      if (trimmed === MANAGED_START) {
        const result = handleManagedStart(currentLines, sections);
        currentSection = result.currentSection;
        currentLines = result.currentLines;
        continue;
      }

      if (trimmed === MANAGED_END) {
        const result = handleManagedEnd(currentSection, currentLines, sections);
        currentSection = result.currentSection;
        currentLines = result.currentLines;
        continue;
      }
    }

    currentLines.push(line);
  }

  // Save any remaining content as custom
  if (currentLines.length > 0) {
    sections.push({
      type: 'custom',
      content: currentLines.join('\n'),
    });
  }

  return { sections };
}

/**
 * Lines outside fenced code blocks, without a leading BOM, up to 3 leading spaces and trailing
 * whitespace; a fence line may also be indented by at most 3 spaces
 */
function linesOutsideCodeBlocks(content: string): string[] {
  const lines: string[] = [];
  let insideCodeBlock = false;
  for (const line of content.split('\n')) {
    const normalized = line
      .replace(/^\uFEFF/, '')
      .replace(/^ {0,3}/, '')
      .trimEnd();
    if (normalized.startsWith('```') || normalized.startsWith('~~~')) {
      insideCodeBlock = !insideCodeBlock;
      continue;
    }
    if (!insideCodeBlock) lines.push(normalized);
  }
  return lines;
}

/** The first `# ` heading of the content outside fenced code blocks, or null */
function firstH1Line(content: string): string | null {
  return linesOutsideCodeBlocks(content).find((line) => /^# \S/.test(line)) ?? null;
}

/**
 * When preserved content contains the template's first H1 it most likely is a copy of an earlier
 * template (#1991). Nothing records whether it is unmodified (the lockfile does not cover the
 * entry doc), so it is never removed; this note says so and how to clean up. Null otherwise.
 */
function duplicationNote(preserved: string, templateContent: string): string | null {
  const h1 = firstH1Line(templateContent);
  if (h1 === null || !linesOutsideCodeBlocks(preserved).includes(h1)) return null;
  return `The preserved content contains the template heading "${h1}", so the template appears to be duplicated. To clean up, keep the ${MANAGED_START} ... ${MANAGED_END} block and keep only project-specific sections outside it.`;
}

/**
 * {@link duplicationNote} (at most one) for the first custom section holding the template's first
 * H1: a file duplicated by an earlier update keeps the old template copy outside the managed block
 */
function customSectionDuplicationNotes(sections: Section[], templateContent: string): string[] {
  for (const section of sections) {
    const note =
      section.type === 'custom' ? duplicationNote(section.content, templateContent) : null;
    if (note !== null) return [note];
  }
  return [];
}

/** Warning for a marker-less existing entry doc, which is kept whole below the new managed block */
function markerlessMergeWarning(existingContent: string, templateContent: string): string {
  const base =
    'No managed sections found in existing content. Template inserted as managed section, existing content preserved below.';
  const note = duplicationNote(existingContent, templateContent);
  return note === null ? base : `${base} ${note}`;
}

/**
 * Merge template content into existing entry doc
 * - Replace managed sections with template content
 * - Preserve custom sections
 */
export function mergeEntryDoc(existingContent: string, templateContent: string): MergeResult {
  const warnings: string[] = [];
  const { sections } = parseEntryDoc(existingContent);

  // If no managed markers found in existing content, wrap entire template
  const hasManagedSections = sections.some((s) => s.type === 'managed');

  if (!hasManagedSections) {
    const wrapped = wrapInManagedMarkers(templateContent);
    const existingTrimmed = existingContent.trim();
    const content = existingTrimmed ? `${wrapped}\n\n${existingTrimmed}` : wrapped;
    return {
      content,
      managedSections: 1,
      customSections: existingTrimmed ? 1 : 0,
      warnings: existingTrimmed
        ? [markerlessMergeWarning(existingContent, templateContent)]
        : ['No managed sections found in existing content, wrapping template entirely'],
    };
  }

  // Rebuild content: replace managed sections with template, keep custom sections
  const mergedSections: string[] = [];
  let managedCount = 0;
  let customCount = 0;
  let templateInserted = false;

  for (const section of sections) {
    if (section.type === 'managed') {
      if (!templateInserted) {
        // Replace first managed section with new template content
        mergedSections.push(MANAGED_START);
        mergedSections.push(templateContent);
        mergedSections.push(MANAGED_END);
        templateInserted = true;
        managedCount++;
      } else {
        // Multiple managed sections - warn and skip
        warnings.push('Multiple managed sections found, keeping only the first one');
      }
    } else {
      // Keep custom sections
      mergedSections.push(section.content);
      customCount++;
    }
  }

  warnings.push(...customSectionDuplicationNotes(sections, templateContent));

  return {
    content: mergedSections.join('\n'),
    managedSections: managedCount,
    customSections: customCount,
    warnings,
  };
}

/**
 * Wrap template content in section markers for first-time setup
 */
export function wrapInManagedMarkers(content: string): string {
  return `${MANAGED_START}\n${content}\n${MANAGED_END}`;
}
