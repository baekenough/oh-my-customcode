#!/usr/bin/env python3
"""Deterministic CHANGELOG.md backfill tool.

Generate a Keep-a-Changelog formatted history for a tag range by reading
git history and GitHub release metadata.

Usage
-----
    python3 scripts/backfill_changelog.py <START>..<END> [--output FILE]

Example
-------
    python3 scripts/backfill_changelog.py v0.36.0..v0.127.0 --output backfill.md

The range is exclusive of START_TAG and inclusive of END_TAG.
Output is ordered newest-first (reverse semver).
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Keep-a-Changelog canonical category order.
CATEGORY_ORDER: list[str] = [
    "Added",
    "Changed",
    "Fixed",
    "Security",
    "Removed",
    "Deprecated",
]

#: Conventional Commit prefix → changelog category.
_PREFIX_TO_CATEGORY: dict[str, str] = {
    "feat": "Added",
    "fix": "Fixed",
    "security": "Security",
    "perf": "Changed",
    "refactor": "Changed",
    "chore": "Changed",
    "build": "Changed",
    "deps": "Changed",
    "revert": "Changed",
}

#: Conventional Commit prefixes whose commits are silently skipped
#: UNLESS they carry a breaking-change marker (!).
_SKIP_PREFIXES: frozenset[str] = frozenset({"docs", "test", "ci", "style"})

#: Regex for Conventional Commits.
#: Groups: (type)(scope?)(breaking?)(subject)
_CONV_COMMIT_RE = re.compile(
    r"^([a-z]+)"          # type
    r"(\([^)]+\))?"       # optional scope
    r"(!)?"               # optional breaking marker
    r":\s*"               # colon + whitespace
    r"(.+)$"              # subject
)

#: Regex for issue references like #123.
_ISSUE_REF_RE = re.compile(r"#(\d+)")

#: Regex to strip version prefix from release/chore(release) descriptions.
#: Matches: "v0.127.0 — rest of message" or "v0.127.0 - rest of message"
_RELEASE_VERSION_RE = re.compile(r"^v\d+\.\d+\.\d+\s*[—-]\s*")

#: Merge commit patterns to skip.
_MERGE_PATTERNS: tuple[str, ...] = (
    "Merge pull request",
    "Merge branch",
)

#: Release-prep noise patterns to skip (both as start-of-line anchored regex).
#: These are version-bump and plan commits that leak into changelogs.
_RELEASE_PREP_RE = re.compile(
    r"^(?:"
    r"bump version to \d+\.\d+\.\d+"      # "bump version to X.Y.Z"
    r"|v\d+\.\d+\.\d+ plan\b"             # "vX.Y.Z plan ..."
    r")",
    re.IGNORECASE,
)


# ---------------------------------------------------------------------------
# Public helpers (importable by tests)
# ---------------------------------------------------------------------------


def extract_issue_refs(text: str) -> list[str]:
    """Return deduplicated issue numbers (as strings) found in *text*.

    Args:
        text: Arbitrary string, e.g. a commit subject.

    Returns:
        Ordered, deduplicated list of issue number strings (no ``#`` prefix).

    Example::

        >>> extract_issue_refs("fix crash (#42, #99)")
        ['42', '99']
        >>> extract_issue_refs("thing (#42) (#42)")
        ['42']
    """
    seen: set[str] = set()
    result: list[str] = []
    for num in _ISSUE_REF_RE.findall(text):
        if num not in seen:
            seen.add(num)
            result.append(num)
    return result


def parse_commit(subject: str) -> tuple[Optional[str], str, list[str]]:
    """Classify a commit subject into a changelog entry.

    Args:
        subject: Raw git commit subject line.

    Returns:
        A 3-tuple ``(category, message, refs)``:

        * ``category`` — one of the :data:`CATEGORY_ORDER` strings, or
          ``None`` if the commit should be skipped entirely.
        * ``message`` — cleaned human-readable description.  Breaking
          changes are prefixed with ``**BREAKING**: ``.
        * ``refs`` — deduplicated list of issue numbers extracted from the
          subject.

    The caller is responsible for assembling the final formatted line.
    """
    # Skip merge commits unconditionally.
    if subject.startswith(_MERGE_PATTERNS):
        return None, subject, []

    # Skip release-prep noise commits (version bumps, plan commits).
    if _RELEASE_PREP_RE.match(subject):
        return None, subject, []

    refs = extract_issue_refs(subject)

    m = _CONV_COMMIT_RE.match(subject)
    if m:
        commit_type, _scope, breaking, raw_desc = m.groups()
        is_breaking = breaking == "!"

        # Handle release commits: extract human description after version stamp.
        if commit_type == "release" or (
            commit_type == "chore" and _scope in ("(release)",)
        ):
            desc = _RELEASE_VERSION_RE.sub("", raw_desc, count=1)
            # Strip issue refs from desc; they are returned separately.
            desc = _strip_issue_refs(desc)
            message = _build_message(desc, is_breaking)
            return "Changed", message, refs

        # Normally-skipped prefixes are kept only when breaking.
        if commit_type in _SKIP_PREFIXES and not is_breaking:
            return None, subject, []

        category = _PREFIX_TO_CATEGORY.get(commit_type)
        if category is None:
            # Unknown conventional prefix → treat as Changed.
            category = "Changed"

        # Classify "add"/"introduce" keywords as "Added" when not already mapped.
        if category == "Changed" and _looks_like_addition(raw_desc):
            category = "Added"

        # Strip issue refs from raw_desc; they are returned separately.
        desc = _strip_issue_refs(raw_desc)
        message = _build_message(desc, is_breaking)
        return category, message, refs

    # Non-conventional commit → Changed, full subject as message.
    return "Changed", subject, refs


def format_section(
    version: str,
    date: str,
    categories: dict[str, list[str]],
) -> str:
    """Render a single changelog section in Keep-a-Changelog format.

    Args:
        version: Semver version string without ``v`` prefix (e.g. ``"0.42.0"``).
        date: ISO date string ``YYYY-MM-DD``.
        categories: Mapping of category name → list of formatted entry strings.
            Only categories present in :data:`CATEGORY_ORDER` are rendered.

    Returns:
        Markdown-formatted changelog section string.

    Example::

        >>> print(format_section("1.0.0", "2026-01-01", {"Added": ["new thing"]}))
        ## [1.0.0] - 2026-01-01
        <BLANKLINE>
        ### Added
        - new thing
        <BLANKLINE>
    """
    lines: list[str] = [f"## [{version}] - {date}", ""]

    has_entries = any(
        entries
        for cat, entries in categories.items()
        if cat in CATEGORY_ORDER
    )

    if not has_entries:
        lines.append("_No user-visible changes (internal only)._")
        lines.append("")
        return "\n".join(lines)

    for cat in CATEGORY_ORDER:
        entries = categories.get(cat)
        if not entries:
            continue
        lines.append(f"### {cat}")
        for entry in entries:
            lines.append(f"- {entry}")
        lines.append("")

    return "\n".join(lines)


def sort_tags_semver(tags: list[str]) -> list[str]:
    """Sort tag strings in descending semver order (newest first).

    Non-semver tags are placed at the end of the list in their original
    relative order (they do not raise errors).

    Args:
        tags: List of git tag strings, optionally prefixed with ``v``.

    Returns:
        New sorted list.
    """
    def _key(tag: str) -> tuple[int, ...]:
        cleaned = tag.lstrip("v")
        parts = cleaned.split(".")
        try:
            return tuple(int(p) for p in parts)
        except ValueError:
            # Non-semver sorts last (sentinel matches _tags_in_range).
            return (-1, -1, -1)

    return sorted(tags, key=_key, reverse=True)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _looks_like_addition(desc: str) -> bool:
    """Return True if *desc* reads like a new feature/skill introduction.

    Heuristic: subjects starting with "add " or "introduce " should map to
    "Added" rather than the default "Changed" category.
    """
    lower = desc.strip().lower()
    return lower.startswith(("add ", "introduce ", "adds ", "introduces "))


def _strip_issue_refs(text: str) -> str:
    """Remove all issue references and resulting empty parens from *text*.

    For example::

        "fix crash (#42)" → "fix crash"
        "thing (#10, #20)" → "thing"
        "no refs here" → "no refs here"
    """
    # Remove individual #NNN occurrences.
    cleaned = _ISSUE_REF_RE.sub("", text)
    # Remove empty or whitespace-only parentheses left behind, e.g. "(, )" or "()".
    cleaned = re.sub(r"\(\s*[,\s]*\)", "", cleaned)
    # Strip trailing commas, spaces.
    return cleaned.rstrip(" ,")


def _build_message(desc: str, is_breaking: bool) -> str:
    """Combine description with optional breaking prefix.

    Issue refs are NOT appended here — they are returned separately by
    ``parse_commit`` and composed into the final entry by the caller
    (e.g., ``_build_categories``).
    """
    desc = desc.strip()
    if is_breaking:
        desc = f"**BREAKING**: {desc}"
    return desc


def _get_release_date(tag: str) -> str:
    """Return YYYY-MM-DD for *tag*, preferring GitHub release metadata.

    Falls back to ``git log`` author date if ``gh`` is unavailable or the
    release does not exist on GitHub.

    If the git fallback also fails (e.g., invalid tag, detached HEAD, empty
    repo), prints a warning and returns ``"UNKNOWN-DATE"``.
    """
    try:
        raw = subprocess.check_output(
            [
                "gh", "release", "view", tag,
                "--json", "publishedAt",
                "--jq", ".publishedAt",
            ],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
        # jq outputs the literal string "null" when the field is absent.
        if raw and raw != "null":
            return raw[:10]
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    # Git fallback — guard against invalid tags / detached HEAD / empty repo.
    try:
        raw = subprocess.check_output(
            ["git", "log", "-1", "--format=%aI", tag],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        if raw:
            return raw[:10]
        print(
            f"Warning: git log returned empty output for tag {tag!r}. "
            "Using UNKNOWN-DATE.",
            file=sys.stderr,
        )
        return "UNKNOWN-DATE"
    except subprocess.CalledProcessError as exc:
        print(
            f"Warning: could not determine date for tag {tag!r}: {exc}. "
            "Using UNKNOWN-DATE.",
            file=sys.stderr,
        )
        return "UNKNOWN-DATE"


def _get_commits_in_range(prev_tag: str, tag: str) -> list[str]:
    """Return raw commit subjects between *prev_tag* and *tag* (no merges)."""
    output = subprocess.check_output(
        ["git", "log", f"{prev_tag}..{tag}", "--pretty=%s", "--no-merges"],
        text=True,
    )
    return [line.strip() for line in output.splitlines() if line.strip()]


def _list_all_tags() -> list[str]:
    """Return all git tags in the repository."""
    output = subprocess.check_output(
        ["git", "tag", "--list"],
        text=True,
    )
    return [t.strip() for t in output.splitlines() if t.strip()]


def _tags_in_range(all_tags: list[str], start: str, end: str) -> list[str]:
    """Return tags strictly after *start* and up to and including *end*.

    Returns tags in descending semver order (newest first).
    """
    sorted_all = sort_tags_semver(all_tags)

    # Build a semver-comparable key for boundary comparison.
    # Sentinel (-1,-1,-1) matches sort_tags_semver's non-semver fallback,
    # ensuring consistent treatment across both functions.
    def _semver(tag: str) -> tuple[int, ...]:
        cleaned = tag.lstrip("v")
        parts = cleaned.split(".")
        try:
            return tuple(int(p) for p in parts[:3])
        except ValueError:
            return (-1, -1, -1)

    start_key = _semver(start)
    end_key = _semver(end)

    result = []
    for tag in sorted_all:
        k = _semver(tag)
        if start_key < k <= end_key:
            result.append(tag)
    return result


def _previous_tag(sorted_all: list[str], tag: str) -> Optional[str]:
    """Return the semver-immediately-prior tag to *tag* in *sorted_all*.

    *sorted_all* must be in **descending** semver order.
    Returns ``None`` if *tag* is the earliest.
    """
    try:
        idx = sorted_all.index(tag)
    except ValueError:
        return None
    # Descending order → next index is the older tag.
    if idx + 1 < len(sorted_all):
        return sorted_all[idx + 1]
    return None


def _build_categories(subjects: list[str]) -> dict[str, list[str]]:
    """Parse commit subjects and group entries by changelog category.

    Each entry is a formatted string ``"description (#ref1, #ref2)"``
    ready for direct inclusion in the changelog.
    """
    categories: dict[str, list[str]] = {}
    for subject in subjects:
        cat, msg, refs = parse_commit(subject)
        if cat is None:
            continue
        entry = msg
        if refs:
            entry = f"{msg} ({', '.join('#' + r for r in refs)})"
        categories.setdefault(cat, []).append(entry)
    return categories


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def _parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a Keep-a-Changelog backfill for a git tag range.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Example:\n"
            "  python3 scripts/backfill_changelog.py v0.36.0..v0.127.0 "
            "--output backfill.md"
        ),
    )
    parser.add_argument(
        "range",
        metavar="START..END",
        help="Tag range in git log notation (START exclusive, END inclusive).",
    )
    parser.add_argument(
        "--output",
        metavar="FILE",
        default=None,
        help="Write output to FILE instead of stdout.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> None:
    """CLI entry point."""
    args = _parse_args(argv)

    if ".." not in args.range:
        sys.exit(f"Error: range must be in START..END format, got: {args.range!r}")

    start_tag, end_tag = args.range.split("..", 1)

    # Validate that neither side of the range is empty.
    if not start_tag or not end_tag:
        sys.exit(
            f"Error: both START and END must be non-empty in range, "
            f"got: {args.range!r}"
        )

    all_tags = _list_all_tags()
    sorted_all = sort_tags_semver(all_tags)

    tags_to_process = _tags_in_range(all_tags, start_tag, end_tag)

    if not tags_to_process:
        sys.exit(
            f"No tags found in range {start_tag!r}..{end_tag!r}. "
            "Check that both tags exist."
        )

    sections: list[str] = []
    for tag in tags_to_process:
        prev = _previous_tag(sorted_all, tag)
        if prev is None:
            # No earlier tag — use git root commit as base.
            prev_ref = ""
        else:
            prev_ref = prev

        date = _get_release_date(tag)
        version = tag.lstrip("v")

        if prev_ref:
            subjects = _get_commits_in_range(prev_ref, tag)
        else:
            # Range from first commit to tag.
            first = subprocess.check_output(
                ["git", "rev-list", "--max-parents=0", "HEAD"],
                text=True,
            ).strip()
            subjects = _get_commits_in_range(first, tag)

        categories = _build_categories(subjects)
        sections.append(format_section(version, date, categories))

    output = "\n".join(sections).rstrip() + "\n"

    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(output)
        print(f"Written to {args.output}")
    else:
        sys.stdout.write(output)


if __name__ == "__main__":
    main()
