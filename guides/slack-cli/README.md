# Slack CLI Reference Guide

> Source: https://docs.slack.dev/tools/slack-cli/ | Version: v3.15.0

## Overview

Slack CLI allows creating and managing Slack apps from the command line. Works with Deno Slack SDK and Bolt frameworks (JavaScript/Python).

## Installation

```bash
# macOS/Linux
curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash

# Verify
slack version
slack doctor
```

## Quick Start

```bash
# Login to workspace
slack login

# Create new app
slack create my-app

# Run locally (development)
slack run

# Deploy to production
slack deploy
```

## Command Reference

### App Management

| Command | Description |
|---------|-------------|
| `slack create` | Create a new Slack project |
| `slack run` | Start local development server |
| `slack deploy` | Deploy app to Slack Platform |
| `slack delete` | Delete an app |
| `slack app install` | Install app to a workspace |
| `slack app uninstall` | Uninstall app from a workspace |
| `slack app list` | List installed apps |
| `slack doctor` | System diagnostics |

### Authentication

| Command | Description |
|---------|-------------|
| `slack login` / `slack auth login` | Log in to Slack account |
| `slack logout` / `slack auth logout` | Log out |
| `slack auth list` | List authorizations |
| `slack auth token` | Manage access tokens |
| `slack auth revoke` | Revoke authorization |

### Triggers

| Command | Description |
|---------|-------------|
| `slack trigger create` | Create a new trigger |
| `slack trigger update` | Update a trigger |
| `slack trigger delete` | Delete a trigger |
| `slack trigger list` | List all triggers |
| `slack trigger info` | View trigger details |
| `slack trigger access` | Manage trigger access |

### Datastore

| Command | Description |
|---------|-------------|
| `slack datastore put` | Add an item |
| `slack datastore get` | Retrieve an item |
| `slack datastore query` | Query items |
| `slack datastore update` | Update an item |
| `slack datastore delete` | Delete an item |
| `slack datastore count` | Count items |
| `slack datastore bulk-put` | Bulk add items |
| `slack datastore bulk-get` | Bulk retrieve items |
| `slack datastore bulk-delete` | Bulk delete items |

### Environment Variables

| Command | Description |
|---------|-------------|
| `slack env add` | Add environment variable |
| `slack env list` | List environment variables |
| `slack env remove` | Remove environment variable |

### Collaboration

| Command | Description |
|---------|-------------|
| `slack collaborator add` | Add a collaborator |
| `slack collaborator list` | List collaborators |
| `slack collaborator remove` | Remove a collaborator |

### Project Management

| Command | Description |
|---------|-------------|
| `slack init` | Initialize existing project for Slack CLI |
| `slack manifest validate` | Validate app manifest |
| `slack manifest info` | Display manifest information |
| `slack samples` | List available sample apps |
| `slack upgrade` | Check for CLI/SDK updates |

## Common Workflows

### Create and Deploy App

```bash
slack login                    # Authenticate
slack create my-app            # Create project
cd my-app
slack run                      # Test locally
slack deploy                   # Deploy to production
slack trigger create           # Set up triggers
```

### Manage Environment

```bash
slack env add MY_KEY my_value  # Add env var
slack env list                 # Verify
slack env remove MY_KEY        # Remove
```

### Datastore Operations

```bash
slack datastore put '{"datastore":"tasks","item":{"id":"1","title":"Test"}}'
slack datastore query '{"datastore":"tasks","expression":"id = :id","expression_values":{":id":"1"}}'
```

## Resources

- Documentation: https://docs.slack.dev/tools/slack-cli/
- Command Reference: https://docs.slack.dev/tools/slack-cli/reference/commands/slack/
- GitHub: https://github.com/slackapi/slack-cli
- Changelog: https://docs.slack.dev/changelog/
