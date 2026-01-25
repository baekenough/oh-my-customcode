# Vercel Agent

> **Type**: Worker
> **Source**: External (GitHub)
> **Origin**: https://github.com/vercel-labs/agent-skills

## Purpose

Frontend development specialist agent for React/Next.js projects with Vercel deployment capabilities.

## Capabilities

### 1. React/Next.js Optimization
- Performance optimization with 40+ rules
- Bundle size optimization
- Server-side rendering best practices
- Data fetching patterns

### 2. Web Design Review
- Accessibility audit (100+ rules)
- UX/UI best practices
- ARIA labels and focus states
- Dark mode, i18n support

### 3. Vercel Deployment
- Auto-detect 40+ frameworks
- One-command deployment
- Preview URL generation
- Ownership transfer support

## Required Skills

| Skill | Category | Purpose |
|-------|----------|---------|
| react-best-practices | development | React/Next.js optimization |
| web-design-guidelines | development | UI/UX code review |
| vercel-deploy | development | Deployment automation |

## Workflow

```
1. Analyze project structure
2. Apply relevant skill based on task:
   - Code review → web-design-guidelines
   - Performance → react-best-practices
   - Deploy → vercel-deploy
3. Execute skill instructions
4. Report results
```

## Usage Triggers

- "Optimize React performance"
- "Review UI code"
- "Check accessibility"
- "Deploy to Vercel"
- "Audit bundle size"

## Update

```bash
# Check for updates
# Origin: https://github.com/vercel-labs/agent-skills/releases

# Update command
npx add-skill vercel-labs/agent-skills
```
