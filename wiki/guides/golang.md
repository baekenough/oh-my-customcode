---
title: "Golang Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/golang/concurrency.md
related:
  - [[lang-golang-expert]]
  - [[go-best-practices]]
---

# Golang Guide

Reference documentation for idiomatic Go language patterns, concurrency, error handling, and code style.

## Overview

Covers Go's core language philosophy and idiomatic patterns: goroutines, channels, context propagation, error handling with `errors.As`/`errors.Is`, interface design, and testing. Based on Effective Go, the Go specification, and the Uber Go Style Guide. Used by `lang-golang-expert` for Go language tasks across all domains.

## Key Topics

- Goroutines and channel patterns (unbuffered vs buffered, directional)
- Concurrency patterns: fan-out/fan-in, pipeline, worker pool, semaphore
- Context propagation for cancellation and timeouts
- Error handling: `fmt.Errorf("%w")`, sentinel errors, custom error types
- Interface design principles (small, implicit, composable)
- Naming conventions: package names, exported identifiers, acronyms
- Testing: table-driven tests, subtests, `testify`

## Relationships

- **Used by agents**: [[lang-golang-expert]], [[be-go-backend-expert]]
- **Related skills**: [[go-best-practices]]
- **See also**: [[go-backend]], [[rust]]

## Sources

- `guides/golang/concurrency.md` — goroutines, channels, concurrency patterns
