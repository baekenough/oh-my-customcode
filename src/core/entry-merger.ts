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
 * Parse entry doc into managed and custom sections
 */
export function parseEntryDoc(content: string): { sections: Section[] } {
  const sections: Section[] = [];
  const lines = content.split('\n');
  let currentSection: Section | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.trim() === MANAGED_START) {
      // Save any pending custom section
      if (currentLines.length > 0) {
        sections.push({
          type: 'custom',
          content: currentLines.join('\n'),
        });
        currentLines = [];
      }
      currentSection = { type: 'managed', content: '' };
      continue;
    }

    if (line.trim() === MANAGED_END) {
      if (currentSection && currentSection.type === 'managed') {
        currentSection.content = currentLines.join('\n');
        sections.push(currentSection);
        currentSection = null;
        currentLines = [];
      }
      continue;
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
    return {
      content: wrapped,
      managedSections: 1,
      customSections: 0,
      warnings: ['No managed sections found in existing content, wrapping template entirely'],
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
