---
title: "Golang Guide"
type: guide
updated: 2026-11-10
sources:
  - guides/golang/concurrency.md
  - guides/golang/error-handling.md
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
- Concurrency patterns: fan-out/fan-in (the fan-in example terminates only because of `defer close(out)` and the `if !ok { chN = nil; continue }` nil-channel step; dropping the blocks or only the `chN = nil` assignments leaves the goroutine running forever, and without `close(out)` the consumer blocks forever), pipeline, worker pool, semaphore
- `sync.WaitGroup` with Go 1.22 per-iteration loop variables and Go 1.25 `wg.Go`, with a Go 1.22-1.24 fallback (`wg.Add(1)` before `go`)
- Context propagation for cancellation and timeouts
- Error handling: `fmt.Errorf("%w")`, sentinel errors, custom error types, aggregation with `errors.Join` (Go 1.20) and multiple `%w`
- Interface design principles (small, implicit, composable)
- Naming conventions: package names, exported identifiers, acronyms
- Testing: table-driven tests, subtests, `testify`

## Relationships

- **Used by agents**: [[lang-golang-expert]], [[be-go-backend-expert]]
- **Related skills**: [[go-best-practices]]
- **See also**: [[go-backend]], [[rust]]

## Sources

- `guides/golang/concurrency.md` — goroutines, channels, concurrency patterns
- `guides/golang/error-handling.md` — error wrapping, `errors.Join` aggregation
