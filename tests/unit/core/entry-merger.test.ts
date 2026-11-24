import { describe, expect, it } from 'bun:test';
import {
  mergeEntryDoc,
  parseEntryDoc,
  wrapInManagedMarkers,
} from '../../../src/core/entry-merger.js';

describe('entry-merger', () => {
  describe('parseEntryDoc', () => {
    it('should parse document with no markers as single custom section', () => {
      const content = 'This is custom content\nNo markers here';
      const result = parseEntryDoc(content);

      expect(result.sections.length).toBe(1);
      expect(result.sections[0].type).toBe('custom');
      expect(result.sections[0].content).toBe('This is custom content\nNo markers here');
    });

    it('should parse document with one managed section', () => {
      const content = `<!-- omcustom:start -->
Managed content here
<!-- omcustom:end -->`;

      const result = parseEntryDoc(content);

      expect(result.sections.length).toBe(1);
      expect(result.sections[0].type).toBe('managed');
      expect(result.sections[0].content).toBe('Managed content here');
    });

    it('should parse document with custom + managed + custom sections', () => {
      const content = `Custom intro
<!-- omcustom:start -->
Managed content
<!-- omcustom:end -->
Custom outro`;

      const result = parseEntryDoc(content);

      expect(result.sections.length).toBe(3);
      expect(result.sections[0].type).toBe('custom');
      expect(result.sections[0].content).toBe('Custom intro');
      expect(result.sections[1].type).toBe('managed');
      expect(result.sections[1].content).toBe('Managed content');
      expect(result.sections[2].type).toBe('custom');
      expect(result.sections[2].content).toBe('Custom outro');
    });

    it('should handle empty content', () => {
      const content = '';
      const result = parseEntryDoc(content);

      // Empty content results in empty custom section
      expect(result.sections.length).toBe(1);
      expect(result.sections[0].type).toBe('custom');
      expect(result.sections[0].content).toBe('');
    });

    it('should handle multiple managed sections', () => {
      const content = `<!-- omcustom:start -->
First managed section
<!-- omcustom:end -->
Middle custom content
<!-- omcustom:start -->
Second managed section
<!-- omcustom:end -->`;

      const result = parseEntryDoc(content);

      expect(result.sections.length).toBe(3);
      expect(result.sections[0].type).toBe('managed');
      expect(result.sections[0].content).toBe('First managed section');
      expect(result.sections[1].type).toBe('custom');
      expect(result.sections[1].content).toBe('Middle custom content');
      expect(result.sections[2].type).toBe('managed');
      expect(result.sections[2].content).toBe('Second managed section');
    });

    it('should handle markers with whitespace', () => {
      const content = `   <!-- omcustom:start -->
Managed with whitespace
   <!-- omcustom:end -->   `;

      const result = parseEntryDoc(content);

      expect(result.sections.length).toBe(1);
      expect(result.sections[0].type).toBe('managed');
      expect(result.sections[0].content).toBe('Managed with whitespace');
    });

    it('should handle stray end marker without matching start marker', () => {
      const content = `Custom content
<!-- omcustom:end -->
More custom content`;

      const result = parseEntryDoc(content);

      // Stray end marker is ignored, all content treated as custom
      expect(result.sections.length).toBe(1);
      expect(result.sections[0].type).toBe('custom');
      expect(result.sections[0].content).toContain('Custom content');
      expect(result.sections[0].content).toContain('More custom content');
    });

    it('should handle unclosed managed section', () => {
      const content = `<!-- omcustom:start -->
Unclosed managed section`;

      const result = parseEntryDoc(content);

      // Unclosed section is treated as custom content
      expect(result.sections.length).toBe(1);
      expect(result.sections[0].type).toBe('custom');
      expect(result.sections[0].content).toBe('Unclosed managed section');
    });

    it('should ignore markers inside fenced code blocks with backticks', () => {
      const content = `Custom intro
\`\`\`markdown
<!-- omcustom:start -->
This is example code, not a real marker
<!-- omcustom:end -->
\`\`\`
Custom outro`;

      const result = parseEntryDoc(content);

      // Entire content should be treated as one custom section
      expect(result.sections.length).toBe(1);
      expect(result.sections[0].type).toBe('custom');
      expect(result.sections[0].content).toBe(content);
    });

    it('should ignore markers inside fenced code blocks with tildes', () => {
      const content = `Custom intro
~~~
<!-- omcustom:start -->
Example marker inside tilde code block
<!-- omcustom:end -->
~~~
Custom outro`;

      const result = parseEntryDoc(content);

      // Entire content should be treated as one custom section
      expect(result.sections.length).toBe(1);
      expect(result.sections[0].type).toBe('custom');
      expect(result.sections[0].content).toBe(content);
    });

    it('should handle markers in code blocks with language specifier', () => {
      const content = `Documentation text
\`\`\`typescript
// Showing how markers work:
<!-- omcustom:start -->
<!-- omcustom:end -->
\`\`\`
More documentation`;

      const result = parseEntryDoc(content);

      expect(result.sections.length).toBe(1);
      expect(result.sections[0].type).toBe('custom');
      expect(result.sections[0].content).toBe(content);
    });

    it('should detect real markers after closing code block', () => {
      const content = `\`\`\`
<!-- omcustom:start -->
Fake marker in code
<!-- omcustom:end -->
\`\`\`
<!-- omcustom:start -->
Real managed section
<!-- omcustom:end -->`;

      const result = parseEntryDoc(content);

      expect(result.sections.length).toBe(2);
      expect(result.sections[0].type).toBe('custom');
      expect(result.sections[0].content).toContain('Fake marker in code');
      expect(result.sections[1].type).toBe('managed');
      expect(result.sections[1].content).toBe('Real managed section');
    });

    it('should handle multiple code blocks', () => {
      const content = `Text
\`\`\`
<!-- omcustom:start -->
\`\`\`
Middle text
\`\`\`
<!-- omcustom:end -->
\`\`\`
End text`;

      const result = parseEntryDoc(content);

      // All markers are in code blocks, so all custom
      expect(result.sections.length).toBe(1);
      expect(result.sections[0].type).toBe('custom');
      expect(result.sections[0].content).toBe(content);
    });

    it('should handle nested code block scenarios', () => {
      const content = `Custom intro
<!-- omcustom:start -->
Managed content with code example:
\`\`\`
<!-- This marker in code should be ignored -->
\`\`\`
More managed content
<!-- omcustom:end -->
Custom outro`;

      const result = parseEntryDoc(content);

      expect(result.sections.length).toBe(3);
      expect(result.sections[0].type).toBe('custom');
      expect(result.sections[0].content).toBe('Custom intro');
      expect(result.sections[1].type).toBe('managed');
      expect(result.sections[1].content).toContain('Managed content with code example');
      expect(result.sections[2].type).toBe('custom');
      expect(result.sections[2].content).toBe('Custom outro');
    });

    it('should handle inline code with marker-like text', () => {
      const content = `Use \`<!-- omcustom:start -->\` in your docs
<!-- omcustom:start -->
Real managed section
<!-- omcustom:end -->`;

      const result = parseEntryDoc(content);

      // Inline code is NOT fenced blocks, so real markers still work
      expect(result.sections.length).toBe(2);
      expect(result.sections[0].type).toBe('custom');
      expect(result.sections[0].content).toContain('Use `<!-- omcustom:start -->`');
      expect(result.sections[1].type).toBe('managed');
      expect(result.sections[1].content).toBe('Real managed section');
    });
  });

  describe('mergeEntryDoc', () => {
    it('should wrap template when no markers exist in existing content', () => {
      const existingContent = 'Custom user content';
      const templateContent = 'Template content';

      const result = mergeEntryDoc(existingContent, templateContent);

      expect(result.content).toBe(`<!-- omcustom:start -->
Template content
<!-- omcustom:end -->

Custom user content`);
      expect(result.managedSections).toBe(1);
      expect(result.customSections).toBe(1);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain('No managed sections found');
      expect(result.warnings[0]).toContain('preserved below');
    });

    it('should only wrap template when existing content is empty', () => {
      const existingContent = '';
      const templateContent = 'Template content';

      const result = mergeEntryDoc(existingContent, templateContent);

      expect(result.content).toBe(`<!-- omcustom:start -->
Template content
<!-- omcustom:end -->`);
      expect(result.managedSections).toBe(1);
      expect(result.customSections).toBe(0);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain('wrapping template entirely');
    });

    it('should preserve multiline project content when no markers exist', () => {
      const existingContent = `# My Project

This is a project-specific README.
It has multiple lines of important content.

## Setup
Run \`npm install\` to get started.`;
      const templateContent = 'Template content';

      const result = mergeEntryDoc(existingContent, templateContent);

      expect(result.content).toBe(`<!-- omcustom:start -->
Template content
<!-- omcustom:end -->

# My Project

This is a project-specific README.
It has multiple lines of important content.

## Setup
Run \`npm install\` to get started.`);
      expect(result.managedSections).toBe(1);
      expect(result.customSections).toBe(1);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain('preserved below');
    });

    describe('marker-less existing content (#1991)', () => {
      const templateContent = '# AI Agent System\n\nTemplate body\n\n## Rules\nTemplate rules';

      it('warns about duplication and how to clean up when the template H1 is already present', () => {
        const existingContent =
          '# AI Agent System\n\nOld template body\n\n## Project Notes\nKeep this note';

        const result = mergeEntryDoc(existingContent, templateContent);

        // Nothing of the existing file is lost: it is kept verbatim below the managed block
        expect(result.content).toBe(
          `${wrapInManagedMarkers(templateContent)}\n\n${existingContent.trim()}`
        );
        expect(result.managedSections).toBe(1);
        expect(result.customSections).toBe(1);
        expect(result.warnings.length).toBe(1);
        const [warning] = result.warnings;
        expect(warning).toContain('No managed sections found');
        expect(warning).toContain('preserved below');
        expect(warning).toContain('"# AI Agent System"');
        expect(warning).toContain('appears to be duplicated');
        expect(warning).toContain('<!-- omcustom:start -->');
        expect(warning).toContain('<!-- omcustom:end -->');
        expect(warning).toContain('keep only project-specific sections outside it');
      });

      it('matches the H1 with trailing whitespace on the existing line', () => {
        const result = mergeEntryDoc('# AI Agent System   \nOld body', templateContent);

        expect(result.warnings[0]).toContain('appears to be duplicated');
      });

      it('matches the H1 after a leading BOM and when indented by 1-3 spaces', () => {
        for (const existing of ['\uFEFF# AI Agent System\nOld body', '   # AI Agent System\nOld']) {
          const result = mergeEntryDoc(existing, templateContent);

          expect(result.warnings[0]).toContain('"# AI Agent System"');
          expect(result.warnings[0]).toContain('appears to be duplicated');
        }
      });

      it('does not match an H1 indented by 4 spaces or a tab (an indented code line)', () => {
        for (const existing of ['    # AI Agent System\nOld', '\t# AI Agent System\nOld']) {
          const result = mergeEntryDoc(existing, templateContent);

          expect(result.warnings[0]).not.toContain('appears to be duplicated');
        }
      });

      it('does not let a fence marker indented by 4+ spaces hide a later H1', () => {
        const result = mergeEntryDoc('intro\n\n    ```\n# AI Agent System\nold', templateContent);

        expect(result.warnings[0]).toContain('appears to be duplicated');
      });

      it('still treats a fence indented by up to 3 spaces as a fence', () => {
        const result = mergeEntryDoc('intro\n   ```\n# AI Agent System\n   ```\n', templateContent);

        expect(result.warnings[0]).not.toContain('appears to be duplicated');
      });

      it('warns on every update when a custom section still holds the template H1 (managed markers present)', () => {
        const fence = '```';
        const existing = `${wrapInManagedMarkers('old template')}\n\n# AI Agent System\nold copy\n${fence}md\n# ignored\n${fence}\n`;

        const result = mergeEntryDoc(existing, templateContent);

        expect(result.content.startsWith(wrapInManagedMarkers(templateContent))).toBe(true);
        expect(result.content).toContain('# AI Agent System\nold copy');
        expect(result.warnings).toEqual([
          `The preserved content contains the template heading "# AI Agent System", so the template appears to be duplicated. To clean up, keep the <!-- omcustom:start --> ... <!-- omcustom:end --> block and keep only project-specific sections outside it.`,
        ]);
        expect(mergeEntryDoc(result.content, templateContent).warnings).toEqual(result.warnings);
      });

      it('does not warn when the custom sections next to managed markers hold no template H1', () => {
        const fence = '```';
        // The managed block itself holds the H1: only custom sections count
        const existing = `# My Project\n\n${wrapInManagedMarkers('# AI Agent System\nold')}\n\n## Notes\n${fence}md\n# AI Agent System\n${fence}\n`;

        expect(mergeEntryDoc(existing, templateContent).warnings).toEqual([]);
      });

      it('gives one duplication warning when several custom sections hold the template H1', () => {
        const existing = `# AI Agent System\nabove\n${wrapInManagedMarkers('old')}\n# AI Agent System\nbelow`;

        const warnings = mergeEntryDoc(existing, templateContent).warnings;

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('appears to be duplicated');
      });

      it('keeps the plain preserve-below warning when the template H1 is not present', () => {
        const existingContent = '# My Project\n\nProject notes only';

        const result = mergeEntryDoc(existingContent, templateContent);

        expect(result.content).toBe(
          `${wrapInManagedMarkers(templateContent)}\n\n${existingContent}`
        );
        expect(result.warnings).toEqual([
          'No managed sections found in existing content. Template inserted as managed section, existing content preserved below.',
        ]);
      });

      it('does not treat a template H1 that only appears inside an existing code block as duplication', () => {
        const existingContent = '# My Project\n\n```md\n# AI Agent System\n```\n';

        const result = mergeEntryDoc(existingContent, templateContent);

        expect(result.warnings[0]).not.toContain('appears to be duplicated');
      });

      it('ignores "#" lines inside template code blocks when finding the template H1', () => {
        const fencedTemplate = '```bash\n# install\n```\n\n# Real Title\nBody';

        const onlyFencedLine = mergeEntryDoc('# install\nnotes', fencedTemplate);
        const realTitle = mergeEntryDoc('# Real Title\nold body', fencedTemplate);

        expect(onlyFencedLine.warnings[0]).not.toContain('appears to be duplicated');
        expect(realTitle.warnings[0]).toContain('"# Real Title"');
      });

      it('keeps the plain warning when the template has no H1 at all', () => {
        const result = mergeEntryDoc('## Template body', '## Template body\nmore');

        expect(result.warnings[0]).not.toContain('appears to be duplicated');
      });
    });

    it('should replace managed section with new template', () => {
      const existingContent = `<!-- omcustom:start -->
Old template content
<!-- omcustom:end -->`;
      const templateContent = 'New template content';

      const result = mergeEntryDoc(existingContent, templateContent);

      expect(result.content).toBe(`<!-- omcustom:start -->
New template content
<!-- omcustom:end -->`);
      expect(result.managedSections).toBe(1);
      expect(result.customSections).toBe(0);
      expect(result.warnings.length).toBe(0);
    });

    it('should preserve custom sections around managed section', () => {
      const existingContent = `Custom intro
<!-- omcustom:start -->
Old template
<!-- omcustom:end -->
Custom outro`;
      const templateContent = 'New template';

      const result = mergeEntryDoc(existingContent, templateContent);

      expect(result.content).toBe(`Custom intro
<!-- omcustom:start -->
New template
<!-- omcustom:end -->
Custom outro`);
      expect(result.managedSections).toBe(1);
      expect(result.customSections).toBe(2);
      expect(result.warnings.length).toBe(0);
    });

    it('should handle multiple custom sections', () => {
      const existingContent = `First custom
<!-- omcustom:start -->
Template
<!-- omcustom:end -->
Second custom
Third custom`;
      const templateContent = 'New template';

      const result = mergeEntryDoc(existingContent, templateContent);

      expect(result.content).toBe(`First custom
<!-- omcustom:start -->
New template
<!-- omcustom:end -->
Second custom
Third custom`);
      expect(result.managedSections).toBe(1);
      expect(result.customSections).toBe(2);
    });

    it('should warn about multiple managed sections', () => {
      const existingContent = `<!-- omcustom:start -->
First managed
<!-- omcustom:end -->
Custom content
<!-- omcustom:start -->
Second managed
<!-- omcustom:end -->`;
      const templateContent = 'New template';

      const result = mergeEntryDoc(existingContent, templateContent);

      // Only first managed section should be replaced
      expect(result.content).toBe(`<!-- omcustom:start -->
New template
<!-- omcustom:end -->
Custom content`);
      expect(result.managedSections).toBe(1);
      expect(result.customSections).toBe(1);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain('Multiple managed sections found');
    });

    it('should handle empty template content', () => {
      const existingContent = `<!-- omcustom:start -->
Old content
<!-- omcustom:end -->`;
      const templateContent = '';

      const result = mergeEntryDoc(existingContent, templateContent);

      expect(result.content).toBe(`<!-- omcustom:start -->

<!-- omcustom:end -->`);
      expect(result.managedSections).toBe(1);
      expect(result.warnings.length).toBe(0);
    });

    it('should handle multiline template content', () => {
      const existingContent = `Custom intro
<!-- omcustom:start -->
Old
<!-- omcustom:end -->`;
      const templateContent = `Line 1
Line 2
Line 3`;

      const result = mergeEntryDoc(existingContent, templateContent);

      expect(result.content).toBe(`Custom intro
<!-- omcustom:start -->
Line 1
Line 2
Line 3
<!-- omcustom:end -->`);
      expect(result.managedSections).toBe(1);
      expect(result.customSections).toBe(1);
    });
  });

  describe('wrapInManagedMarkers', () => {
    it('should wrap content with start and end markers', () => {
      const content = 'Template content';
      const result = wrapInManagedMarkers(content);

      expect(result).toBe(`<!-- omcustom:start -->
Template content
<!-- omcustom:end -->`);
    });

    it('should handle multiline content', () => {
      const content = `Line 1
Line 2
Line 3`;
      const result = wrapInManagedMarkers(content);

      expect(result).toBe(`<!-- omcustom:start -->
Line 1
Line 2
Line 3
<!-- omcustom:end -->`);
    });

    it('should handle empty content', () => {
      const content = '';
      const result = wrapInManagedMarkers(content);

      expect(result).toBe(`<!-- omcustom:start -->

<!-- omcustom:end -->`);
    });

    it('should handle content with special characters', () => {
      const content = 'Content with <tags> and "quotes"';
      const result = wrapInManagedMarkers(content);

      expect(result).toBe(`<!-- omcustom:start -->
Content with <tags> and "quotes"
<!-- omcustom:end -->`);
    });
  });
});
