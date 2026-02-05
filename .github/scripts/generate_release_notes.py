"""
Release Notes Generator Script
- Uses Claude API to generate release notes from git commits
- Analyzes changes between tags/commits
- Produces structured markdown release notes
"""

import os
import sys
import subprocess
import anthropic


def get_commits_since_tag(tag: str = None) -> str:
    """Get commit messages since the last tag or specified tag."""
    try:
        if tag:
            # Get commits since specified tag
            result = subprocess.run(
                ["git", "log", f"{tag}..HEAD", "--pretty=format:%h %s"],
                capture_output=True,
                text=True,
                check=True,
            )
        else:
            # Get last tag
            last_tag = subprocess.run(
                ["git", "describe", "--tags", "--abbrev=0"],
                capture_output=True,
                text=True,
            )
            if last_tag.returncode == 0:
                tag = last_tag.stdout.strip()
                result = subprocess.run(
                    ["git", "log", f"{tag}..HEAD", "--pretty=format:%h %s"],
                    capture_output=True,
                    text=True,
                    check=True,
                )
            else:
                # No tags, get last 50 commits
                result = subprocess.run(
                    ["git", "log", "-50", "--pretty=format:%h %s"],
                    capture_output=True,
                    text=True,
                    check=True,
                )
        return result.stdout
    except subprocess.CalledProcessError as e:
        return f"Error getting commits: {e}"


def get_changed_files(tag: str = None) -> str:
    """Get list of changed files since last tag."""
    try:
        if tag:
            result = subprocess.run(
                ["git", "diff", "--name-status", f"{tag}..HEAD"],
                capture_output=True,
                text=True,
                check=True,
            )
        else:
            last_tag = subprocess.run(
                ["git", "describe", "--tags", "--abbrev=0"],
                capture_output=True,
                text=True,
            )
            if last_tag.returncode == 0:
                tag = last_tag.stdout.strip()
                result = subprocess.run(
                    ["git", "diff", "--name-status", f"{tag}..HEAD"],
                    capture_output=True,
                    text=True,
                    check=True,
                )
            else:
                result = subprocess.run(
                    ["git", "diff", "--name-status", "HEAD~50..HEAD"],
                    capture_output=True,
                    text=True,
                    check=True,
                )
        return result.stdout
    except subprocess.CalledProcessError as e:
        return f"Error getting changed files: {e}"


def build_prompt(version: str, commits: str, changed_files: str) -> str:
    """Build the release notes generation prompt."""
    return f"""당신은 oh-my-customcode 프로젝트의 릴리스 노트 작성 전문가입니다.

## 프로젝트 정보

oh-my-customcode는 Claude Code를 커스터마이징하는 npm 패키지입니다.
주요 구성요소: Agents, Skills, Rules, Guides, Pipelines

## 릴리스 버전

{version}

## 커밋 히스토리

```
{commits[:5000]}
```

## 변경된 파일

```
{changed_files[:3000]}
```

## 작성 지침

1. **Conventional Commits 기반 분류**:
   - 🚀 Features (feat:)
   - 🐛 Bug Fixes (fix:)
   - 📚 Documentation (docs:)
   - ♻️ Refactoring (refactor:)
   - 🧪 Tests (test:)
   - 🔧 Chores (chore:)

2. **사용자 친화적 설명**: 기술적 변경을 사용자 관점에서 설명

3. **Breaking Changes**: 있다면 별도 섹션으로 강조

4. **마이그레이션 가이드**: 필요 시 포함

## 응답 형식 (Markdown)

# Release v{version}

## Highlights

(이번 릴리스의 주요 특징 1-3개)

## 🚀 Features

- (새로운 기능들)

## 🐛 Bug Fixes

- (버그 수정들)

## 📚 Documentation

- (문서 변경사항)

## ♻️ Other Changes

- (기타 변경사항)

## ⚠️ Breaking Changes

(해당사항 없으면 "None" 또는 섹션 생략)

## 📋 Full Changelog

(주요 커밋 요약)

---
_이 릴리스 노트는 Claude API에 의해 자동 생성되었습니다._
"""


def generate_release_notes(version: str = None) -> str:
    """Generate release notes using Claude API."""
    if not version:
        version = os.environ.get("RELEASE_VERSION", "X.X.X")

    tag = os.environ.get("PREVIOUS_TAG")

    commits = get_commits_since_tag(tag)
    changed_files = get_changed_files(tag)

    if not commits.strip():
        return f"⚠️ v{version}에 대한 커밋을 찾을 수 없습니다."

    client = anthropic.Anthropic()

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": build_prompt(version, commits, changed_files),
            }
        ],
    )

    result_parts = []
    for block in message.content:
        if block.type == "text":
            result_parts.append(block.text)

    return "\n".join(result_parts)


if __name__ == "__main__":
    version = sys.argv[1] if len(sys.argv) > 1 else None

    try:
        result = generate_release_notes(version)
        print(result)
    except anthropic.APIError as e:
        print(f"⚠️ Claude API 호출 중 오류가 발생했습니다: {e}", file=sys.stderr)
        print("⚠️ 릴리스 노트 생성에 실패했습니다.")
        sys.exit(1)
    except Exception as e:
        print(f"⚠️ 예기치 않은 오류: {e}", file=sys.stderr)
        print("⚠️ 릴리스 노트 생성 중 오류가 발생했습니다.")
        sys.exit(1)
