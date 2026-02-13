"""Rule decomposition, extractive compression, and semantic deduplication.

This module provides rule compression capabilities based on query context.
No LLM calls - pure text-based processing using heading classification,
section selection, and Jaccard similarity-based deduplication.
"""

from dataclasses import dataclass, field
from enum import Enum


class RuleSection(Enum):
    """Rule section types based on heading classification."""

    DESCRIPTION = "description"
    REQUIREMENTS = "requirements"
    EXAMPLES = "examples"
    REFERENCES = "references"


@dataclass
class DecomposedRule:
    """A rule decomposed into classified sections."""

    rule_name: str
    sections: dict[RuleSection, str]
    section_tokens: dict[RuleSection, int]
    total_tokens: int


class RuleDecomposer:
    """Decompose markdown rule files into sections using H2 heading keywords.

    Pure text parsing - no LLM calls. Classifies sections based on heading
    keywords and estimates token counts.
    """

    # Section heading keyword mappings
    # Order matters: more specific patterns checked first
    HEADING_KEYWORDS = {
        RuleSection.REFERENCES: {
            "reference",
            "see",
            "related",
            "integration",
            "link",
            "external",
        },
        RuleSection.EXAMPLES: {
            "example",
            "usage",
            "sample",
            "template",
            "code",
            "quick",
            "demonstration",
        },
        RuleSection.REQUIREMENTS: {
            "must",
            "should",
            "requirement",
            "check",
            "validation",
            "table",
            "workflow",
            "permission",
            "tier",
            "rules",
            "policy",
        },
        RuleSection.DESCRIPTION: {
            "overview",
            "core",
            "rule",
            "principle",
            "format",
            "when",
            "purpose",
            "summary",
        },
    }

    def decompose(self, rule_name: str, content: str) -> DecomposedRule:
        """Decompose a rule markdown file into classified sections.

        Args:
            rule_name: Name/identifier of the rule.
            content: Full markdown content of the rule.

        Returns:
            DecomposedRule with classified sections and token counts.
        """
        sections: dict[RuleSection, str] = {}
        section_tokens: dict[RuleSection, int] = {}

        # Split content by H2 headings (##)
        lines = content.split("\n")
        current_section = RuleSection.DESCRIPTION
        current_content: list[str] = []

        for line in lines:
            if line.startswith("## "):
                # Save previous section (merge if same type exists)
                if current_content:
                    section_text = "\n".join(current_content).strip()
                    if section_text:
                        if current_section in sections:
                            sections[current_section] += "\n\n" + section_text
                        else:
                            sections[current_section] = section_text
                        section_tokens[current_section] = _estimate_tokens(
                            sections[current_section]
                        )

                # Start new section
                heading = line[3:].strip()
                current_section = self._classify_section(heading, "")
                current_content = []
            else:
                current_content.append(line)

        # Save final section (merge if same type exists)
        if current_content:
            section_text = "\n".join(current_content).strip()
            if section_text:
                if current_section in sections:
                    sections[current_section] += "\n\n" + section_text
                else:
                    sections[current_section] = section_text
                section_tokens[current_section] = _estimate_tokens(
                    sections[current_section]
                )

        total_tokens = sum(section_tokens.values())

        return DecomposedRule(
            rule_name=rule_name,
            sections=sections,
            section_tokens=section_tokens,
            total_tokens=total_tokens,
        )

    def _classify_section(self, heading: str, content: str) -> RuleSection:
        """Classify a section based on heading text keywords.

        Uses substring matching so plurals work (e.g. "requirement"
        matches "Requirements"). HEADING_KEYWORDS is ordered with more
        specific patterns first to prevent false positives.

        Args:
            heading: The H2 heading text.
            content: Section content (currently unused, for future use).

        Returns:
            Classified RuleSection enum value.
        """
        heading_lower = heading.lower()

        for section_type, keywords in self.HEADING_KEYWORDS.items():
            if any(keyword in heading_lower for keyword in keywords):
                return section_type

        return RuleSection.DESCRIPTION


class ContextCompressor:
    """Query-based section selection and semantic deduplication.

    Compresses rule content based on query intent by selecting relevant
    sections and removing semantically similar content across rules.
    """

    # Query pattern → needed sections mapping
    QUERY_SECTION_MAP = {
        "how_to": [
            RuleSection.DESCRIPTION,
            RuleSection.REQUIREMENTS,
            RuleSection.EXAMPLES,
        ],
        "explain": [RuleSection.DESCRIPTION, RuleSection.REQUIREMENTS],
        "create": [RuleSection.REQUIREMENTS, RuleSection.EXAMPLES],
        "default": [RuleSection.DESCRIPTION, RuleSection.REQUIREMENTS],
    }

    # Query pattern keywords
    QUERY_PATTERNS = {
        "how_to": {"how", "example", "show", "demonstrate", "tutorial"},
        "explain": {"what", "explain", "describe", "overview", "summary"},
        "create": {
            "create",
            "implement",
            "build",
            "add",
            "write",
            "make",
            "generate",
        },
    }

    def __init__(
        self, decomposer: RuleDecomposer | None = None, dedup_threshold: float = 0.7
    ):
        """Initialize the context compressor.

        Args:
            decomposer: RuleDecomposer instance (creates default if None).
            dedup_threshold: Jaccard similarity threshold for deduplication.
        """
        self.decomposer = decomposer or RuleDecomposer()
        self.dedup_threshold = dedup_threshold

    def compress_rules(
        self, rule_contents: list[tuple[str, str]], query: str, max_tokens: int = 0
    ) -> list[str]:
        """Compress multiple rules based on query.

        Applies section selection and semantic deduplication.

        Args:
            rule_contents: List of (rule_name, full_content) tuples.
            query: User query to determine needed sections.
            max_tokens: Maximum total tokens (0 = no limit).

        Returns:
            List of compressed rule content strings.
        """
        if not rule_contents:
            return []

        # 1. Decompose all rules
        decomposed_rules = [
            self.decomposer.decompose(name, content)
            for name, content in rule_contents
        ]

        # 2. Determine needed sections from query
        needed_sections = self._determine_needed_sections(query)

        # 3. Select only needed sections from each rule
        selected_contents: list[str] = []
        for rule in decomposed_rules:
            rule_parts: list[str] = []
            for section_type in needed_sections:
                if section_type in rule.sections:
                    rule_parts.append(rule.sections[section_type])

            if rule_parts:
                selected_contents.append("\n\n".join(rule_parts))

        # 4. Dedup across rules
        deduplicated = self._dedup_content(selected_contents)

        # 5. Apply max_tokens budget if specified
        if max_tokens > 0:
            result = []
            current_tokens = 0
            for content in deduplicated:
                content_tokens = _estimate_tokens(content)
                if current_tokens + content_tokens <= max_tokens:
                    result.append(content)
                    current_tokens += content_tokens
                else:
                    break
            return result

        return deduplicated

    def _determine_needed_sections(self, query: str) -> list[RuleSection]:
        """Determine which sections are needed based on query pattern.

        Args:
            query: User query string.

        Returns:
            List of RuleSection types needed for this query.
        """
        query_lower = query.lower()

        # Check query words against QUERY_PATTERNS
        for pattern_name, keywords in self.QUERY_PATTERNS.items():
            if any(keyword in query_lower for keyword in keywords):
                return self.QUERY_SECTION_MAP[pattern_name]

        return self.QUERY_SECTION_MAP["default"]

    def _dedup_content(self, sections: list[str]) -> list[str]:
        """Remove semantically similar content using Jaccard similarity.

        When Jaccard similarity > threshold, keep only the longer content.

        Args:
            sections: List of content strings to deduplicate.

        Returns:
            Deduplicated list of content strings.
        """
        if len(sections) <= 1:
            return sections

        result: list[str] = []
        skip_indices: set[int] = set()

        for i, content_a in enumerate(sections):
            if i in skip_indices:
                continue

            for j in range(i + 1, len(sections)):
                if j in skip_indices:
                    continue

                content_b = sections[j]
                similarity = self._jaccard_similarity(content_a, content_b)

                if similarity > self.dedup_threshold:
                    # Keep the longer one
                    if len(content_a) < len(content_b):
                        skip_indices.add(i)
                        break
                    else:
                        skip_indices.add(j)

            if i not in skip_indices:
                result.append(content_a)

        return result

    def _jaccard_similarity(self, text_a: str, text_b: str) -> float:
        """Compute Jaccard similarity between two text strings (word-level).

        Args:
            text_a: First text string.
            text_b: Second text string.

        Returns:
            Jaccard similarity score (0.0 to 1.0).
        """
        words_a = set(text_a.lower().split())
        words_b = set(text_b.lower().split())

        if not words_a or not words_b:
            return 0.0

        intersection = words_a & words_b
        union = words_a | words_b

        return len(intersection) / len(union)

    def get_compression_stats(
        self, original_tokens: int, compressed_tokens: int
    ) -> dict[str, int | float]:
        """Return compression statistics.

        Args:
            original_tokens: Token count before compression.
            compressed_tokens: Token count after compression.

        Returns:
            Dictionary with compression statistics.
        """
        return {
            "original_tokens": original_tokens,
            "compressed_tokens": compressed_tokens,
            "tokens_saved": original_tokens - compressed_tokens,
            "compression_ratio": (
                round(compressed_tokens / original_tokens, 3)
                if original_tokens > 0
                else 1.0
            ),
        }


def _estimate_tokens(text: str) -> int:
    """Rough token estimation: words * 1.3.

    Args:
        text: Input text string.

    Returns:
        Estimated token count.
    """
    return int(len(text.split()) * 1.3)
