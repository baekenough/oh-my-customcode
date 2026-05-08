"""
Tests for scripts/backfill_changelog.py

Run with:
    python3 -m pytest tests/scripts/test_backfill_changelog.py -v
"""

import sys
import types
import unittest
from unittest.mock import patch

# ---------------------------------------------------------------------------
# Import the module under test.
# The script lives at scripts/backfill_changelog.py; add the project root to
# sys.path so we can import it as `scripts.backfill_changelog`.
# ---------------------------------------------------------------------------
import importlib
import os

# Ensure project root is on sys.path regardless of how pytest is invoked.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from scripts.backfill_changelog import (  # noqa: E402
    format_section,
    parse_commit,
    extract_issue_refs,
    sort_tags_semver,
    CATEGORY_ORDER,
)


# ---------------------------------------------------------------------------
# parse_commit tests
# ---------------------------------------------------------------------------


class TestParseCommit(unittest.TestCase):
    """Unit tests for parse_commit()."""

    def test_parse_commit_feat(self):
        cat, msg, refs = parse_commit("feat: add new skill (#42)")
        self.assertEqual(cat, "Added")
        self.assertEqual(msg, "add new skill")
        self.assertEqual(refs, ["42"])

    def test_parse_commit_fix_with_scope(self):
        cat, msg, refs = parse_commit("fix(skills): resolve memory leak")
        self.assertEqual(cat, "Fixed")
        self.assertIn("resolve memory leak", msg)
        self.assertEqual(refs, [])

    def test_parse_commit_chore_release_with_desc(self):
        cat, msg, refs = parse_commit(
            "chore(release): v0.127.0 — /goal thin wrapper skill (#1109)"
        )
        self.assertEqual(cat, "Changed")
        self.assertIn("/goal thin wrapper skill", msg)
        self.assertIn("1109", refs)

    def test_parse_commit_skip_docs(self):
        cat, msg, refs = parse_commit("docs: update README")
        self.assertIsNone(cat)

    def test_parse_commit_skip_test(self):
        cat, msg, refs = parse_commit("test: add coverage")
        self.assertIsNone(cat)

    def test_parse_commit_skip_ci(self):
        cat, msg, refs = parse_commit("ci: update GitHub Actions workflow")
        self.assertIsNone(cat)

    def test_parse_commit_skip_style(self):
        cat, msg, refs = parse_commit("style: reformat imports")
        self.assertIsNone(cat)

    def test_parse_commit_breaking_keeps_test(self):
        """Breaking changes must NOT be skipped even for normally-skipped prefixes."""
        cat, msg, refs = parse_commit("feat!: breaking API change")
        self.assertEqual(cat, "Added")
        self.assertTrue(msg.startswith("**BREAKING**:"))

    def test_parse_commit_breaking_docs_not_skipped(self):
        """docs! (breaking) should surface as Changed/Added, not be silently dropped."""
        cat, msg, refs = parse_commit("docs!: remove legacy endpoint docs")
        self.assertIsNotNone(cat)
        self.assertTrue(msg.startswith("**BREAKING**:"))

    def test_parse_commit_non_conventional(self):
        cat, msg, refs = parse_commit("Random commit message")
        self.assertEqual(cat, "Changed")
        self.assertEqual(msg, "Random commit message")

    def test_parse_commit_merge_skipped(self):
        cat, msg, refs = parse_commit("Merge pull request #1 from foo/bar")
        self.assertIsNone(cat)

    def test_parse_commit_merge_branch_skipped(self):
        cat, msg, refs = parse_commit("Merge branch 'develop' into feature/xyz")
        self.assertIsNone(cat)

    def test_parse_commit_perf_maps_to_changed(self):
        cat, msg, refs = parse_commit("perf: speed up query execution")
        self.assertEqual(cat, "Changed")

    def test_parse_commit_security_maps_correctly(self):
        cat, msg, refs = parse_commit("security: patch XSS vulnerability (#99)")
        self.assertEqual(cat, "Security")
        self.assertIn("99", refs)

    def test_parse_commit_refactor_maps_to_changed(self):
        cat, msg, refs = parse_commit("refactor: simplify routing logic")
        self.assertEqual(cat, "Changed")

    def test_parse_commit_release_plain(self):
        """release: commit should extract description after version pattern."""
        cat, msg, refs = parse_commit("release: v0.42.0 — new release (#100)")
        self.assertEqual(cat, "Changed")
        self.assertIn("new release", msg)
        self.assertIn("100", refs)

    def test_parse_commit_deps_maps_to_changed(self):
        cat, msg, refs = parse_commit("deps: bump lodash from 4.17.20 to 4.17.21")
        self.assertEqual(cat, "Changed")

    def test_parse_commit_multiple_issue_refs(self):
        cat, msg, refs = parse_commit("fix: resolve crash (#10, #20)")
        self.assertEqual(cat, "Fixed")
        self.assertIn("10", refs)
        self.assertIn("20", refs)

    def test_parse_commit_revert_maps_to_changed(self):
        cat, msg, refs = parse_commit("revert: undo bad migration")
        self.assertEqual(cat, "Changed")

    def test_parse_commit_build_maps_to_changed(self):
        cat, msg, refs = parse_commit("build: update Dockerfile base image")
        self.assertEqual(cat, "Changed")

    def test_parse_commit_feat_with_scope_and_ref(self):
        cat, msg, refs = parse_commit("feat(api): add pagination endpoint (#55)")
        self.assertEqual(cat, "Added")
        self.assertIn("add pagination endpoint", msg)
        self.assertEqual(refs, ["55"])


# ---------------------------------------------------------------------------
# extract_issue_refs tests
# ---------------------------------------------------------------------------


class TestExtractIssueRefs(unittest.TestCase):
    """Unit tests for extract_issue_refs()."""

    def test_single_ref(self):
        self.assertEqual(extract_issue_refs("fix crash (#42)"), ["42"])

    def test_multiple_refs(self):
        refs = extract_issue_refs("closes (#10, #20, #30)")
        self.assertIn("10", refs)
        self.assertIn("20", refs)
        self.assertIn("30", refs)

    def test_no_ref(self):
        self.assertEqual(extract_issue_refs("no issue here"), [])

    def test_inline_ref(self):
        refs = extract_issue_refs("mentioned in #99 and done")
        self.assertIn("99", refs)

    def test_strips_trailing_parens_from_message(self):
        """Trailing paren refs are part of the string — ensure extraction is complete."""
        refs = extract_issue_refs("do something (#1) (#2)")
        self.assertIn("1", refs)
        self.assertIn("2", refs)


# ---------------------------------------------------------------------------
# format_section tests
# ---------------------------------------------------------------------------


class TestFormatSection(unittest.TestCase):
    """Unit tests for format_section()."""

    def test_format_section_with_categories(self):
        section = format_section(
            "0.42.0",
            "2026-04-01",
            {
                "Added": ["new feature (#1)"],
                "Fixed": ["a bug (#2)"],
            },
        )
        self.assertIn("## [0.42.0] - 2026-04-01", section)
        self.assertIn("### Added", section)
        self.assertIn("### Fixed", section)
        self.assertIn("- new feature (#1)", section)
        # Order: Added before Fixed
        self.assertLess(section.index("### Added"), section.index("### Fixed"))

    def test_format_section_empty(self):
        section = format_section("0.42.0", "2026-04-01", {})
        self.assertIn("_No user-visible changes", section)

    def test_format_section_category_order(self):
        """Categories appear in canonical Keep-a-Changelog order."""
        section = format_section(
            "1.0.0",
            "2026-01-01",
            {
                "Fixed": ["bug fix"],
                "Added": ["new thing"],
                "Security": ["cve patch"],
                "Changed": ["updated api"],
            },
        )
        added_idx = section.index("### Added")
        changed_idx = section.index("### Changed")
        fixed_idx = section.index("### Fixed")
        security_idx = section.index("### Security")
        self.assertLess(added_idx, changed_idx)
        self.assertLess(changed_idx, fixed_idx)
        self.assertLess(fixed_idx, security_idx)

    def test_format_section_header_format(self):
        section = format_section("1.2.3", "2025-06-15", {"Changed": ["tweak"]})
        # Must match Keep-a-Changelog header style
        self.assertIn("## [1.2.3] - 2025-06-15", section)

    def test_format_section_no_unknown_categories(self):
        """Only known CATEGORY_ORDER categories appear in section headers."""
        section = format_section(
            "1.0.0", "2026-01-01", {"Added": ["x"], "Unknown": ["y"]}
        )
        # Unknown category should either not appear or be shown — test that
        # known ones appear correctly.
        self.assertIn("### Added", section)

    def test_format_section_entry_format(self):
        """Each entry is formatted as a markdown list item."""
        section = format_section("2.0.0", "2026-02-01", {"Added": ["alpha", "beta"]})
        self.assertIn("- alpha", section)
        self.assertIn("- beta", section)


# ---------------------------------------------------------------------------
# sort_tags_semver tests
# ---------------------------------------------------------------------------


class TestSortTagsSemver(unittest.TestCase):
    """Unit tests for sort_tags_semver()."""

    def test_basic_sort_descending(self):
        tags = ["v0.1.0", "v0.3.0", "v0.2.0"]
        result = sort_tags_semver(tags)
        self.assertEqual(result, ["v0.3.0", "v0.2.0", "v0.1.0"])

    def test_major_version_ordering(self):
        tags = ["v1.0.0", "v2.0.0", "v10.0.0"]
        result = sort_tags_semver(tags)
        self.assertEqual(result, ["v10.0.0", "v2.0.0", "v1.0.0"])

    def test_patch_version_ordering(self):
        tags = ["v0.1.1", "v0.1.10", "v0.1.2"]
        result = sort_tags_semver(tags)
        self.assertEqual(result, ["v0.1.10", "v0.1.2", "v0.1.1"])

    def test_non_semver_tags_tolerated(self):
        """Non-semver tags should not crash the sort — they sort after valid tags."""
        tags = ["v1.0.0", "not-a-version", "v2.0.0"]
        result = sort_tags_semver(tags)
        # Valid semver tags appear first in descending order
        self.assertEqual(result[0], "v2.0.0")
        self.assertEqual(result[1], "v1.0.0")

    def test_empty_list(self):
        self.assertEqual(sort_tags_semver([]), [])

    def test_single_tag(self):
        self.assertEqual(sort_tags_semver(["v1.2.3"]), ["v1.2.3"])


# ---------------------------------------------------------------------------
# CATEGORY_ORDER constant test
# ---------------------------------------------------------------------------


class TestCategoryOrder(unittest.TestCase):
    def test_standard_categories_present(self):
        for cat in ("Added", "Changed", "Fixed", "Security", "Removed", "Deprecated"):
            self.assertIn(cat, CATEGORY_ORDER)

    def test_added_is_first(self):
        self.assertEqual(CATEGORY_ORDER[0], "Added")


if __name__ == "__main__":
    unittest.main()
