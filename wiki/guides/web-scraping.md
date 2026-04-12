---
title: "Web Scraping Guide"
type: guide
updated: 2026-04-12
sources:
  - guides/web-scraping/README.md
related:
  - [[lang-python-expert]]
---

# Web Scraping Guide

Reference documentation for reliable web scraping patterns with BeautifulSoup and Playwright, with emphasis on Korean government site parsing.

## Overview

Covers BeautifulSoup table parsing patterns (including `rowspan`/`colspan` handling), Playwright browser automation for dynamic content, retry logic, rate limiting, and data extraction patterns for complex HTML structures. Includes specialized patterns for Korean government QC crawling workflows. Used by `lang-python-expert` for data extraction tasks.

## Key Topics

- BeautifulSoup table parsing: `find_all("table")`, header extraction, row iteration
- Handling `rowspan`/`colspan` with 2D grid expansion algorithm
- Playwright async patterns for JavaScript-rendered pages
- Retry and rate-limiting decorators for robust crawlers
- Korean government site patterns: session handling, form submission
- Data cleaning and normalization after extraction
- Structured output to CSV/JSON/database

## Relationships

- **Used by agents**: [[lang-python-expert]]
- **Related skills**: [[python-best-practices]]
- **See also**: [[python]], [[fastapi]], [[postgres]]

## Sources

- `guides/web-scraping/README.md` — BeautifulSoup patterns, rowspan handling, Playwright automation
