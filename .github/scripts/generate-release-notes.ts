#!/usr/bin/env bun
/**
 * Release Notes Generator Script
 * - Uses Claude API to generate release notes from git commits
 * - Analyzes changes between tags/commits
 * - Produces structured markdown release notes
 */

import Anthropic from "@anthropic-ai/sdk";
import { $ } from "bun";

const GIT_LOG_FORMAT = "--pretty=format:%h %s";

async function getCommitsSinceTag(tag?: string): Promise<string> {
  /**
   * Get commit messages since the last tag or specified tag.
   */
  let commits: string;

  if (tag) {
    try {
      // Get commits since specified tag
      const result = await $`git log ${{ raw: `${tag}..HEAD` }} ${GIT_LOG_FORMAT}`.text();
      commits = result;
    } catch {
      // Tag not found or not fetchable, fall through to auto-detection
      commits = "";
    }
  }

  if (!tag || !commits) {
    // Find the previous tag (skip the tag at HEAD if any)
    try {
      const tagsResult = await $`git tag --sort=-version:refname`.text();
      const tags = tagsResult.trim().split('\n').filter(t => t);

      if (tags.length >= 2) {
        // Use second tag (previous version) when HEAD is at a tag
        const prevTag = tags[1];
        const result = await $`git log ${{ raw: `${prevTag}..HEAD` }} ${GIT_LOG_FORMAT}`.text();
        commits = result;
      } else if (tags.length === 1) {
        // Only one tag exists, get all commits
        const result = await $`git log ${GIT_LOG_FORMAT}`.text();
        commits = result;
      } else {
        // No tags at all
        const result = await $`git log -50 ${GIT_LOG_FORMAT}`.text();
        commits = result;
      }
    } catch {
      // Fallback: get last 50 commits
      const result = await $`git log -50 ${GIT_LOG_FORMAT}`.text();
      commits = result;
    }
  }

  return commits;
}

async function getChangedFiles(tag?: string): Promise<string> {
  /**
   * Get list of changed files since last tag.
   */
  let changedFiles: string;

  if (tag) {
    try {
      const result = await $`git diff --name-status ${{ raw: `${tag}..HEAD` }}`.text();
      changedFiles = result;
    } catch {
      // Tag not found or not fetchable, fall through to auto-detection
      changedFiles = "";
    }
  }

  if (!tag || !changedFiles) {
    // Find the previous tag (skip the tag at HEAD if any)
    try {
      const tagsResult = await $`git tag --sort=-version:refname`.text();
      const tags = tagsResult.trim().split('\n').filter(t => t);

      if (tags.length >= 2) {
        const prevTag = tags[1];
        const result = await $`git diff --name-status ${{ raw: `${prevTag}..HEAD` }}`.text();
        changedFiles = result;
      } else {
        const result = await $`git diff --name-status HEAD~50..HEAD`.text();
        changedFiles = result;
      }
    } catch {
      const result = await $`git diff --name-status HEAD~50..HEAD`.text();
      changedFiles = result;
    }
  }

  return changedFiles;
}

function buildPrompt(version: string, commits: string, changedFiles: string): string {
  /**
   * Build the release notes generation prompt.
   */
  return `당신은 oh-my-customcode 프로젝트의 릴리스 노트 작성 전문가입니다.

## 프로젝트 정보

oh-my-customcode는 Claude Code를 커스터마이징하는 npm 패키지입니다.
주요 구성요소: Agents, Skills, Rules, Guides, Pipelines

## 릴리스 버전

${version}

## 커밋 히스토리

\`\`\`
${commits.substring(0, 5000)}
\`\`\`

## 변경된 파일

\`\`\`
${changedFiles.substring(0, 3000)}
\`\`\`

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

# Release v${version}

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
`;
}

async function generateReleaseNotes(version?: string): Promise<string> {
  /**
   * Generate release notes using Claude API.
   */
  const releaseVersion = version || process.env.RELEASE_VERSION || "X.X.X";
  const previousTag = process.env.PREVIOUS_TAG;

  const commits = await getCommitsSinceTag(previousTag);
  const changedFiles = await getChangedFiles(previousTag);

  if (!commits.trim()) {
    return `⚠️ v${releaseVersion}에 대한 커밋을 찾을 수 없습니다.`;
  }

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const message = await client.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: buildPrompt(releaseVersion, commits, changedFiles),
      },
    ],
  });

  const resultParts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text") {
      resultParts.push(block.text);
    }
  }

  return resultParts.join("\n");
}

// Main execution
if (import.meta.main) {
  const version = process.argv[2];

  try {
    const result = await generateReleaseNotes(version);
    console.log(result);
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(`⚠️ Claude API 호출 중 오류가 발생했습니다: ${error.message}`);
      console.log("⚠️ 릴리스 노트 생성에 실패했습니다.");
      process.exit(1);
    } else {
      console.error(`⚠️ 예기치 않은 오류: ${error}`);
      console.log("⚠️ 릴리스 노트 생성 중 오류가 발생했습니다.");
      process.exit(1);
    }
  }
}
