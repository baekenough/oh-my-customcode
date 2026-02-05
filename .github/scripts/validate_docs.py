"""
Documentation Validator Script
- Uses Claude API to validate that documentation matches implementation
- Checks agent/skill/rule counts, CLI commands, and feature descriptions
"""

import os
import sys
import glob
import json
import anthropic


def collect_implementation_stats() -> dict:
    """Collect actual counts and details from implementation."""
    stats = {}

    # Count agents
    agent_files = glob.glob("templates/.claude/agents/*.md")
    stats["agent_count"] = len(agent_files)
    stats["agent_names"] = [os.path.basename(f).replace(".md", "") for f in agent_files]

    # Count skills (directories with SKILL.md)
    skill_dirs = glob.glob("templates/.claude/skills/*/")
    valid_skill_dirs = [
        d for d in skill_dirs if os.path.isfile(os.path.join(d, "SKILL.md"))
    ]
    stats["skill_count"] = len(valid_skill_dirs)
    stats["skill_names"] = [os.path.basename(d.rstrip("/")) for d in valid_skill_dirs]

    # Count rules
    rule_files = glob.glob("templates/.claude/rules/*.md")
    stats["rule_count"] = len(rule_files)

    # Count guides
    guide_dirs = glob.glob("templates/guides/*/")
    stats["guide_count"] = len(guide_dirs)

    # Count hooks
    hook_dirs = glob.glob("templates/.claude/hooks/*/")
    stats["hook_count"] = len(hook_dirs)

    # Count contexts
    context_files = glob.glob("templates/.claude/contexts/*.md")
    stats["context_count"] = len(context_files)

    # Count pipelines
    pipeline_dirs = glob.glob("templates/pipelines/*/")
    stats["pipeline_count"] = len(pipeline_dirs)

    return stats


def extract_readme_claims(readme_path: str) -> str:
    """Extract relevant sections from README for validation."""
    try:
        with open(readme_path, "r", encoding="utf-8") as f:
            content = f.read()
        return content
    except FileNotFoundError:
        return ""


def build_prompt(stats: dict, readme_en: str, readme_ko: str) -> str:
    """Build the validation prompt for Claude."""
    stats_json = json.dumps(stats, indent=2, ensure_ascii=False)

    return f"""당신은 oh-my-customcode 프로젝트의 문서 검증 전문가입니다.
구현 현황과 README 문서를 비교하여 불일치 사항을 찾아주세요.

---

## 구현 현황 (실제 파일 기반)

```json
{stats_json}
```

---

## README.md (English)

```markdown
{readme_en[:8000]}
```

---

## README_ko.md (Korean)

```markdown
{readme_ko[:8000]}
```

---

## 검증 항목

다음 항목들을 검증하세요:

1. **숫자 일치**: README에 언급된 agent/skill/rule/guide 개수가 실제와 일치하는가?
2. **목록 일치**: README에 나열된 agent/skill 이름이 실제 존재하는가?
3. **언어 일관성**: README.md와 README_ko.md의 정보가 일치하는가?
4. **오래된 정보**: 더 이상 존재하지 않는 기능이 문서에 남아있는가?

---

## 응답 형식 (Markdown)

> 🔍 **Documentation Validator**

### 검증 결과

(✅ 일치 / ⚠️ 불일치 / ❌ 오류)

### 발견된 불일치

| 항목 | 문서 값 | 실제 값 | 파일 |
|------|--------|--------|------|
| (불일치 항목 나열) |

### 권장 수정사항

(구체적인 수정 제안)

### 요약

(전체 검증 결과 요약 1-2문장)

---
_이 검증은 Claude API에 의해 자동 수행되었습니다._
"""


def validate_docs() -> str:
    """Main validation function."""
    # Collect implementation stats
    stats = collect_implementation_stats()

    # Read READMEs
    readme_en = extract_readme_claims("README.md")
    readme_ko = extract_readme_claims("README_ko.md")

    if not readme_en:
        return "⚠️ README.md를 찾을 수 없습니다."

    # Call Claude API
    client = anthropic.Anthropic()

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": build_prompt(stats, readme_en, readme_ko),
            }
        ],
    )

    # Extract text response
    result_parts = []
    for block in message.content:
        if block.type == "text":
            result_parts.append(block.text)

    return "\n".join(result_parts)


if __name__ == "__main__":
    try:
        result = validate_docs()
        print(result)
    except anthropic.APIError as e:
        print(f"⚠️ Claude API 호출 중 오류가 발생했습니다: {e}", file=sys.stderr)
        print("⚠️ 문서 검증에 실패했습니다.")
        sys.exit(1)
    except Exception as e:
        print(f"⚠️ 예기치 않은 오류: {e}", file=sys.stderr)
        print("⚠️ 문서 검증 중 오류가 발생했습니다.")
        sys.exit(1)
