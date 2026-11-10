---
title: Go Best Practices
type: skill
updated: 2026-11-10
sources:
  - .claude/skills/go-best-practices/SKILL.md
related:
  - [[lang-golang-expert]]
  - [[go-backend-best-practices]]
---

# Go Best Practices

Idiomatic Go patterns drawn from the official Go documentation (Effective Go), with version-tagged modern features.

## Overview

Reference patterns for idiomatic Go, organized as 14 numbered sections: formatting, naming conventions, control structures, functions, data, methods, interfaces, concurrency, error handling (`fmt.Errorf` with `%w`, and `errors.Join` (Go 1.20) to combine several errors: nil errors are discarded, the result is nil if all are nil, and `errors.Is`/`errors.As` inspect each joined error), and project structure, followed by four newer sections. Section 11 covers generics (when to use them, constraints, type inference), section 12 covers range-over-func iterators and `iter.Pull`, section 13 covers the `slices` and `maps` packages with Go version tags, and section 14 covers table-driven testing and `go vet` (including the Go 1.25 waitgroup analyzer, which catches only the simple form of `wg.Add` inside the goroutine). The skill opens with a version baseline: Go 1.26 and 1.27 are the supported releases as of 2026-11, and the baseline should be re-measured before relying on it. Feature headings carry the Go version that introduced the feature, so check the `go` directive in `go.mod` first. Used by `lang-golang-expert`.

Not covered by this skill: the Uber style guide (see [[go-backend-best-practices]]) and sentinel-error patterns.

## Key Details

- **Scope**: core
- **User-invocable**: no
- **Effort**: not specified

## Relationships

- **Used by agents**: [[lang-golang-expert]]
- **Related skills**: [[go-backend-best-practices]]
- **See also**: guides/golang/

## Sources

- `.claude/skills/go-best-practices/SKILL.md` — skill definition
