# Autonomous Challenge Lessons

Lessons from the 2026-05 Minecraft Cobblemon autonomous run post-mortem (#1149). Use these as guardrails for long-running challenge, QA, and tool-heavy sessions.

## First-five-minutes ground-truth check

Before producing solution artifacts, ask whether the environment already contains a reference, answer jar, fixture, golden output, or expected patch.

- Inspect supplied artifacts before inventing a mechanism.
- If a jar/binary/package is provided as the expected fix, disassemble or inspect it early.
- Verify framework version and mapping namespace before writing code. For Minecraft/Fabric-style work, decide Mojang official vs Yarn mappings from the actual target environment, not from memory.

## Tool denial and repeated failure policy

- If a tool call is denied by permissions, do not retry the exact same call. Switch to a permitted route and record the denial.
- If the same critical error appears twice, stop relaunching and re-check flag semantics, existing singleton processes, and environment state.
- For launcher-style tools, clear known singleton processes before a fresh launch when safe and appropriate.
- Treat ambiguous CLI flags as suspect until confirmed by docs or help output. Example: an `--offline` flag may force missing-library failures rather than simply avoid network calls.

## QA evidence discipline

QA reports must quote implementation identifiers verbatim:

- grep/read the target code before naming `data-testid`, selectors, function names, or config keys;
- include the exact file path and line when possible;
- do not infer selectors or identifiers from screenshots, memory, or prior drafts.

## Long autonomous run checkpoint

At each major phase boundary:

1. Re-check the ground-truth artifact or expected output.
2. Re-check version/mapping assumptions.
3. Review repeated-denial or repeated-error patterns.
4. Confirm QA evidence came from code or executed commands, not assumptions.
