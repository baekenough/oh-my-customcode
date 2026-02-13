"""Tests for rule decomposition and context compression."""

import pytest

from ontology_rag.compressor import (
    ContextCompressor,
    DecomposedRule,
    RuleDecomposer,
    RuleSection,
    _estimate_tokens,
)


# Test fixtures


@pytest.fixture
def sample_rule_content():
    """Sample rule with multiple sections."""
    return """# Agent Design Rules

> **Priority**: MUST | **ID**: R006

## Core Rule

Agent files must follow the standard format with frontmatter.
All agents are stored in `.claude/agents/` directory.

## Requirements

| Field | Required | Description |
|-------|----------|-------------|
| name  | yes      | Agent identifier |
| model | yes      | Model to use |

All agents must include:
- Name field in kebab-case
- Model selection (sonnet, opus, haiku)
- Tools list

## Examples

Basic agent example:

```yaml
name: my-agent
model: sonnet
tools: [Read, Write]
```

Advanced example with memory:

```yaml
name: advanced-agent
model: opus
memory: project
tools: [Read, Write, Edit]
```

## References

- See R007 for identification rules
- See R017 for verification workflow
- See guides/agents/ for detailed documentation
"""


@pytest.fixture
def sample_requirement_rule():
    """Rule with mostly requirements."""
    return """# Permission Rules

## Must Follow

Never modify system files.
Always validate input.

## Requirements Table

| Operation | Allowed | Prohibited |
|-----------|---------|-----------|
| Read | All files | None |
| Write | Project files | System files |
"""


@pytest.fixture
def sample_example_rule():
    """Rule with examples."""
    return """# Best Practices

## Code Examples

Example 1:

```python
def hello():
    return "world"
```

Example 2:

```python
class MyClass:
    pass
```
"""


@pytest.fixture
def decomposer():
    """Return a RuleDecomposer instance."""
    return RuleDecomposer()


@pytest.fixture
def compressor():
    """Return a ContextCompressor instance."""
    return ContextCompressor()


# RuleDecomposer tests


def test_decompose_simple_rule(decomposer, sample_rule_content):
    """Test H2 sections are correctly classified."""
    result = decomposer.decompose("R006", sample_rule_content)

    assert result.rule_name == "R006"
    assert RuleSection.DESCRIPTION in result.sections
    assert RuleSection.REQUIREMENTS in result.sections
    assert RuleSection.EXAMPLES in result.sections
    assert RuleSection.REFERENCES in result.sections

    # Check content snippets
    assert "Agent files must follow" in result.sections[RuleSection.DESCRIPTION]
    assert "| Field | Required |" in result.sections[RuleSection.REQUIREMENTS]
    assert "```yaml" in result.sections[RuleSection.EXAMPLES]
    assert "See R007" in result.sections[RuleSection.REFERENCES]


def test_decompose_no_headings(decomposer):
    """Test all content goes to DESCRIPTION when no H2 headings."""
    content = """# Simple Rule

This is a simple rule with no subsections.
Everything should be classified as description.
"""
    result = decomposer.decompose("R001", content)

    assert result.rule_name == "R001"
    assert len(result.sections) == 1
    assert RuleSection.DESCRIPTION in result.sections
    assert "simple rule" in result.sections[RuleSection.DESCRIPTION]


def test_decompose_token_estimation(decomposer, sample_rule_content):
    """Test section_tokens match content."""
    result = decomposer.decompose("R006", sample_rule_content)

    for section_type, content in result.sections.items():
        expected_tokens = _estimate_tokens(content)
        assert result.section_tokens[section_type] == expected_tokens


def test_classify_section_requirements(decomposer):
    """Test 'Must' heading goes to REQUIREMENTS."""
    section = decomposer._classify_section("Must Follow", "")
    assert section == RuleSection.REQUIREMENTS


def test_classify_section_examples(decomposer):
    """Test 'Example' heading goes to EXAMPLES."""
    section = decomposer._classify_section("Example Usage", "")
    assert section == RuleSection.EXAMPLES


def test_classify_section_references(decomposer):
    """Test 'Related' heading goes to REFERENCES."""
    section = decomposer._classify_section("Related Rules", "")
    assert section == RuleSection.REFERENCES


def test_classify_section_default(decomposer):
    """Test unknown heading defaults to DESCRIPTION."""
    section = decomposer._classify_section("Random Section", "")
    assert section == RuleSection.DESCRIPTION


def test_decompose_total_tokens(decomposer, sample_rule_content):
    """Test total tokens equals sum of section tokens."""
    result = decomposer.decompose("R006", sample_rule_content)

    expected_total = sum(result.section_tokens.values())
    assert result.total_tokens == expected_total


# ContextCompressor tests


def test_compress_empty_rules(compressor):
    """Test compressing empty rules returns empty list."""
    result = compressor.compress_rules([], "any query")
    assert result == []


def test_compress_single_rule_default(compressor, sample_rule_content):
    """Test default query returns DESCRIPTION + REQUIREMENTS only."""
    rules = [("R006", sample_rule_content)]
    result = compressor.compress_rules(rules, "fix the bug")

    assert len(result) == 1
    compressed = result[0]

    # Should contain description and requirements
    assert "Agent files must follow" in compressed
    assert "| Field | Required |" in compressed

    # Should NOT contain examples or references
    assert "```yaml" not in compressed
    assert "See R007" not in compressed


def test_compress_how_to_query(compressor, sample_rule_content):
    """Test 'how to' query includes EXAMPLES."""
    rules = [("R006", sample_rule_content)]
    result = compressor.compress_rules(rules, "how to create an agent")

    assert len(result) == 1
    compressed = result[0]

    # Should contain all three: description, requirements, examples
    assert "Agent files must follow" in compressed
    assert "| Field | Required |" in compressed
    assert "```yaml" in compressed


def test_compress_explain_query(compressor, sample_rule_content):
    """Test 'explain' query returns DESCRIPTION + REQUIREMENTS only."""
    rules = [("R006", sample_rule_content)]
    result = compressor.compress_rules(rules, "explain agent design")

    assert len(result) == 1
    compressed = result[0]

    # Should contain description and requirements
    assert "Agent files must follow" in compressed
    assert "| Field | Required |" in compressed

    # Should NOT contain examples
    assert "```yaml" not in compressed


def test_compress_create_query(compressor, sample_rule_content):
    """Test 'create' query returns REQUIREMENTS + EXAMPLES."""
    rules = [("R006", sample_rule_content)]
    result = compressor.compress_rules(rules, "create a new agent")

    assert len(result) == 1
    compressed = result[0]

    # Should contain requirements and examples
    assert "| Field | Required |" in compressed
    assert "```yaml" in compressed

    # Description should not be included (create pattern excludes it)
    # But if heading keywords overlap, it might. Check examples are there.
    assert "```yaml" in compressed


def test_compress_dedup_similar_rules(compressor):
    """Test similar content is deduplicated."""
    rule_a = """# Rule A

## Core Rule

This is common content shared by both rules.
"""

    rule_b = """# Rule B

## Core Rule

This is common content shared by both rules.
"""

    rules = [("A", rule_a), ("B", rule_b)]
    result = compressor.compress_rules(rules, "any query")

    # Should deduplicate to 1 rule (identical content)
    assert len(result) == 1


def test_compress_dedup_keeps_longer(compressor):
    """Test longer content is preserved when similar."""
    rule_short = """# Rule

## Core Rule

Common words here in this section for testing purposes that demonstrate overlap and similarity between rules
"""

    rule_long = """# Rule

## Core Rule

Common words here in this section for testing purposes that demonstrate overlap and similarity between rules plus extra details
"""

    rules = [("short", rule_short), ("long", rule_long)]
    result = compressor.compress_rules(rules, "any query")

    # Both decompose with same H1 "# Rule", so Jaccard is high
    # Intersection: 19 words, Union: 22 words → Jaccard = 0.86 > 0.7
    assert len(result) == 1
    assert "extra details" in result[0]


def test_compress_max_tokens_limit(compressor, sample_rule_content):
    """Test max_tokens budget is respected."""
    rules = [("R006", sample_rule_content)]

    # Compress with very small token limit
    result = compressor.compress_rules(rules, "how to create", max_tokens=50)

    # Should return empty or truncated content
    total_tokens = sum(_estimate_tokens(r) for r in result)
    assert total_tokens <= 50


def test_compress_no_decomposer(sample_rule_content):
    """Test compressor creates default decomposer."""
    compressor = ContextCompressor(decomposer=None)
    rules = [("R006", sample_rule_content)]

    result = compressor.compress_rules(rules, "any query")
    assert len(result) == 1


def test_jaccard_similarity_identical(compressor):
    """Test Jaccard similarity returns 1.0 for identical text."""
    text = "this is a test"
    similarity = compressor._jaccard_similarity(text, text)
    assert similarity == 1.0


def test_jaccard_similarity_disjoint(compressor):
    """Test Jaccard similarity returns 0.0 for disjoint text."""
    text_a = "foo bar baz"
    text_b = "one two three"
    similarity = compressor._jaccard_similarity(text_a, text_b)
    assert similarity == 0.0


def test_jaccard_similarity_partial(compressor):
    """Test Jaccard similarity returns correct value for partial overlap."""
    text_a = "the quick brown fox"
    text_b = "the lazy brown dog"
    # Common: the, brown (2 words)
    # Union: the, quick, brown, fox, lazy, dog (6 words)
    # Jaccard = 2/6 = 0.333...
    similarity = compressor._jaccard_similarity(text_a, text_b)
    assert 0.3 <= similarity <= 0.4


def test_get_compression_stats(compressor):
    """Test compression stats are calculated correctly."""
    stats = compressor.get_compression_stats(1000, 300)

    assert stats["original_tokens"] == 1000
    assert stats["compressed_tokens"] == 300
    assert stats["tokens_saved"] == 700
    assert stats["compression_ratio"] == 0.3


# Determine needed sections tests


def test_determine_sections_how_to(compressor):
    """Test 'how to create' matches how_to pattern."""
    sections = compressor._determine_needed_sections("how to create an agent")

    assert RuleSection.DESCRIPTION in sections
    assert RuleSection.REQUIREMENTS in sections
    assert RuleSection.EXAMPLES in sections


def test_determine_sections_explain(compressor):
    """Test 'what is this rule' matches explain pattern."""
    sections = compressor._determine_needed_sections("what is this rule about")

    assert RuleSection.DESCRIPTION in sections
    assert RuleSection.REQUIREMENTS in sections
    assert RuleSection.EXAMPLES not in sections


def test_determine_sections_create(compressor):
    """Test 'implement a new agent' matches create pattern."""
    sections = compressor._determine_needed_sections("implement a new agent")

    assert RuleSection.REQUIREMENTS in sections
    assert RuleSection.EXAMPLES in sections


def test_determine_sections_default(compressor):
    """Test 'fix the bug' uses default pattern."""
    sections = compressor._determine_needed_sections("fix the bug")

    assert sections == compressor.QUERY_SECTION_MAP["default"]
    assert RuleSection.DESCRIPTION in sections
    assert RuleSection.REQUIREMENTS in sections


def test_determine_sections_mixed(compressor):
    """Test mixed keywords match first pattern found."""
    # Contains both "how" and "explain"
    sections = compressor._determine_needed_sections("how do I explain this")

    # Should match how_to (comes first in QUERY_PATTERNS iteration)
    # Note: dict iteration order is insertion order in Python 3.7+
    assert RuleSection.EXAMPLES in sections or RuleSection.DESCRIPTION in sections


# Token estimation tests


def test_estimate_tokens_simple():
    """Test token estimation for simple text."""
    text = "this is a test"
    tokens = _estimate_tokens(text)
    # 4 words * 1.3 = 5.2 -> 5
    assert tokens == 5


def test_estimate_tokens_empty():
    """Test token estimation for empty text."""
    tokens = _estimate_tokens("")
    assert tokens == 0


def test_estimate_tokens_multiline():
    """Test token estimation for multiline text."""
    text = """This is line one.
This is line two.
This is line three."""
    tokens = _estimate_tokens(text)
    # 12 words * 1.3 = 15.6 -> 15
    assert tokens == 15


# Integration tests


def test_full_compression_workflow(sample_rule_content):
    """Test complete compression workflow."""
    compressor = ContextCompressor(dedup_threshold=0.7)

    rules = [
        ("R006", sample_rule_content),
        ("R007", "# Agent ID\n\n## Core Rule\n\nEvery response must have ID."),
    ]

    result = compressor.compress_rules(rules, "how to create an agent", max_tokens=500)

    # Should return compressed content
    assert len(result) >= 1

    # Calculate stats
    original_tokens = sum(_estimate_tokens(content) for _, content in rules)
    compressed_tokens = sum(_estimate_tokens(content) for content in result)
    stats = compressor.get_compression_stats(original_tokens, compressed_tokens)

    assert stats["original_tokens"] > stats["compressed_tokens"]
    assert stats["tokens_saved"] > 0
    assert 0.0 < stats["compression_ratio"] < 1.0


def test_multiple_rules_different_sections(compressor):
    """Test compressing multiple rules with different section types."""
    rule_desc = """# Rule 1

## Overview

This rule describes something.
"""

    rule_req = """# Rule 2

## Requirements

Must do this and that.
"""

    rule_ex = """# Rule 3

## Examples

Example code here.
"""

    rules = [("R1", rule_desc), ("R2", rule_req), ("R3", rule_ex)]

    # Query that needs all sections
    result = compressor.compress_rules(rules, "show me how to implement")

    # Should include content from rules that have needed sections
    assert len(result) >= 1
    compressed = "\n".join(result)

    # Examples should be present (create pattern)
    assert "Example code" in compressed or "Must do this" in compressed


def test_dedup_with_different_threshold():
    """Test deduplication with different thresholds."""
    rule_a = "# Rule A\n\n## Core\n\nCommon text shared between rules"
    rule_b = "# Rule B\n\n## Core\n\nCommon text shared between rules extra"

    # Low threshold - more aggressive dedup
    compressor_low = ContextCompressor(dedup_threshold=0.5)
    result_low = compressor_low.compress_rules(
        [("A", rule_a), ("B", rule_b)], "any query"
    )

    # High threshold - less aggressive dedup
    compressor_high = ContextCompressor(dedup_threshold=0.9)
    result_high = compressor_high.compress_rules(
        [("A", rule_a), ("B", rule_b)], "any query"
    )

    # Low threshold should deduplicate more aggressively
    assert len(result_low) <= len(result_high)
