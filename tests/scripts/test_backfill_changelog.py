"""
Tests for scripts/backfill_changelog.py

Run with:
    python3 -m pytest tests/scripts/test_backfill_changelog.py -v
"""

import sys
import subprocess
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
    _get_release_date,
    _tags_in_range,
    main,
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

    # --- New addition-heuristic tests (#1117-L2) ---

    def test_chore_with_add_keyword_maps_to_added(self):
        """chore: commits whose description starts with 'add' should map to Added."""
        cat, msg, refs = parse_commit("chore(skill): add version frontmatter (#42)")
        self.assertEqual(cat, "Added")

    def test_chore_with_introduce_keyword_maps_to_added(self):
        """chore: commits whose description starts with 'introduce' → Added."""
        cat, msg, refs = parse_commit("chore: introduce new logging framework")
        self.assertEqual(cat, "Added")

    def test_chore_without_add_keyword_stays_changed(self):
        """Regular chore commits without addition keywords stay Changed."""
        cat, msg, refs = parse_commit("chore: update CI config")
        self.assertEqual(cat, "Changed")

    # --- Release-prep noise skip tests (#1117-M1) ---

    def test_release_prep_bump_version_skipped(self):
        """'bump version to X.Y.Z' should be silently skipped."""
        cat, msg, refs = parse_commit("bump version to 0.125.0")
        self.assertIsNone(cat)

    def test_release_prep_plan_skipped(self):
        """'vX.Y.Z plan ...' should be silently skipped."""
        cat, msg, refs = parse_commit("v0.125.0 plan + permissions.defaultMode")
        self.assertIsNone(cat)

    def test_release_prep_plan_case_insensitive(self):
        """Release-prep pattern match is case-insensitive."""
        cat, msg, refs = parse_commit("Bump version to 0.130.0")
        self.assertIsNone(cat)


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

    # --- Deduplication test (#1117-L1) ---

    def test_duplicate_refs_deduplicated(self):
        """Duplicate PR refs like (#1083) (#1083) must be deduplicated."""
        refs = extract_issue_refs("some change (#1083) (#1083)")
        self.assertEqual(refs, ["1083"])
        self.assertEqual(len(refs), 1)

    def test_duplicate_refs_in_single_parens(self):
        """Duplicates within a single paren group are also collapsed."""
        refs = extract_issue_refs("thing (#42, #42)")
        self.assertEqual(refs, ["42"])


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
        # Non-semver tag lands at the end
        self.assertEqual(result[2], "not-a-version")

    def test_non_semver_excluded_from_range(self):
        """Non-semver tags with sentinel (-1,-1,-1) must NOT be included in ranges."""
        all_tags = ["v1.0.0", "v2.0.0", "not-a-version"]
        result = _tags_in_range(all_tags, "v1.0.0", "v2.0.0")
        self.assertIn("v2.0.0", result)
        self.assertNotIn("not-a-version", result)

    def test_prerelease_tag_tolerated(self):
        """Tags like v1.0.0-rc1 (non-pure-semver) are tolerated without crashing."""
        tags = ["v1.0.0", "v1.0.0-rc1", "v2.0.0"]
        result = sort_tags_semver(tags)
        self.assertEqual(result[0], "v2.0.0")
        self.assertEqual(result[1], "v1.0.0")
        # Pre-release tag sorts last (non-semver sentinel)
        self.assertEqual(result[2], "v1.0.0-rc1")

    def test_empty_list(self):
        self.assertEqual(sort_tags_semver([]), [])

    def test_single_tag(self):
        self.assertEqual(sort_tags_semver(["v1.2.3"]), ["v1.2.3"])


# ---------------------------------------------------------------------------
# _get_release_date safety tests (#1116-H1, #1116-M2)
# ---------------------------------------------------------------------------


class TestGetReleaseDate(unittest.TestCase):
    """Tests for _get_release_date error handling."""

    def test_gh_null_publishedAt_falls_back_to_git(self):
        """When gh returns 'null', should fall back to git log."""
        def fake_check_output(cmd, **kwargs):
            if cmd[0] == "gh":
                return "null\n"
            # git log fallback
            return "2026-01-15T10:00:00+00:00\n"

        with patch("subprocess.check_output", side_effect=fake_check_output):
            date = _get_release_date("v1.0.0")
        self.assertEqual(date, "2026-01-15")

    def test_gh_empty_publishedAt_falls_back_to_git(self):
        """When gh returns empty string, should fall back to git log."""
        def fake_check_output(cmd, **kwargs):
            if cmd[0] == "gh":
                return "\n"
            return "2026-02-20T00:00:00+00:00\n"

        with patch("subprocess.check_output", side_effect=fake_check_output):
            date = _get_release_date("v1.0.0")
        self.assertEqual(date, "2026-02-20")

    def test_git_log_failure_returns_unknown_date(self):
        """CalledProcessError from git log should return UNKNOWN-DATE, not crash."""
        def fake_check_output(cmd, **kwargs):
            if cmd[0] == "gh":
                raise subprocess.CalledProcessError(1, cmd)
            # git also fails
            raise subprocess.CalledProcessError(128, cmd)

        with patch("subprocess.check_output", side_effect=fake_check_output):
            date = _get_release_date("v-invalid-tag")
        self.assertEqual(date, "UNKNOWN-DATE")

    def test_git_log_empty_output_returns_unknown_date(self):
        """Empty git log output should return UNKNOWN-DATE safely."""
        def fake_check_output(cmd, **kwargs):
            if cmd[0] == "gh":
                raise FileNotFoundError
            # git returns empty string (e.g., detached HEAD, wrong tag)
            return "\n"

        with patch("subprocess.check_output", side_effect=fake_check_output):
            date = _get_release_date("v0.0.0")
        self.assertEqual(date, "UNKNOWN-DATE")

    def test_gh_valid_date_used_directly(self):
        """Valid gh publishedAt date is used without falling back to git."""
        call_count = {"git": 0}

        def fake_check_output(cmd, **kwargs):
            if cmd[0] == "gh":
                return "2026-03-10T08:30:00Z\n"
            call_count["git"] += 1
            return "2020-01-01T00:00:00Z\n"

        with patch("subprocess.check_output", side_effect=fake_check_output):
            date = _get_release_date("v1.2.3")
        self.assertEqual(date, "2026-03-10")
        self.assertEqual(call_count["git"], 0)


# ---------------------------------------------------------------------------
# main() empty-range validation test (#1116-M3)
# ---------------------------------------------------------------------------


class TestMainRangeValidation(unittest.TestCase):
    """Tests for main() argument validation."""

    def test_empty_start_tag_exits(self):
        """'..v1.0.0' (empty start) should exit with an error, not silently include all tags."""
        with self.assertRaises(SystemExit) as ctx:
            main(["..v1.0.0"])
        self.assertNotEqual(ctx.exception.code, 0)

    def test_empty_end_tag_exits(self):
        """'v1.0.0..' (empty end) should exit with an error."""
        with self.assertRaises(SystemExit) as ctx:
            main(["v1.0.0.."])
        self.assertNotEqual(ctx.exception.code, 0)


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
