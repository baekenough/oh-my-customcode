---
name: vercel-deploy
description: Deploy applications to Vercel with auto-detection and preview URLs
---

## When to Use

- Deploy application to Vercel
- Create preview deployments
- Generate shareable URLs

## Features

### Framework Detection
```
Auto-detects 40+ frameworks from package.json:
- Next.js
- React
- Vue
- Nuxt
- Svelte
- Astro
- and more...
```

### Auto Exclusions
```
Automatically excludes:
- node_modules/
- .git/
- .env files
```

### Output
```
On successful deployment:
1. Preview URL (view deployment)
2. Claim URL (transfer ownership)
```

## Execution Flow

```
1. Detect project framework
2. Prepare deployment bundle
3. Upload to Vercel
4. Return URLs
```

## Output Format

```
[Deploy Success]
Preview: https://project-xxx.vercel.app
Claim: https://vercel.com/claim/xxx
```

## Scripts

See `scripts/deploy.sh` for deployment automation.

## Requirements

- Valid project structure
- package.json present
- Vercel CLI or API token (for authenticated deploys)

## Limitations

- Claimable deploys are anonymous
- Preview URLs are temporary
- Full features require Vercel account
```
