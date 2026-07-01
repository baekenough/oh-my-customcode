# grill-with-docs

`grill-with-docs` is a multi-platform skill (works in Claude Code) for stress-testing a plan against the language, boundaries, and decisions already present in a codebase.

It asks one focused question at a time, checks the repository when the answer should be discoverable from code or docs, and captures settled domain language in `CONTEXT.md`. It can also suggest ADRs when a decision is hard to reverse, surprising without context, and shaped by a real trade-off.

This version is packaged as a standalone skill. It includes its own context and ADR formats, so it does not rely on other skills being installed.

## Credits

Inspired by Matt Pocock's [`grill-with-docs`](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) skill, packaged from [w00ing/skills](https://github.com/w00ing/skills/tree/main/grill-with-docs).
