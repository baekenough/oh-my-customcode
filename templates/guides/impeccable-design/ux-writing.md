# UX Writing

> Reference: Impeccable Design Language — https://github.com/pbakaus/impeccable (Apache 2.0)

---

## Button Labels

Buttons are the most frequent point of user action. Vague labels like "OK", "Submit", or "Yes" force users to look back at context to understand what will happen. Specific labels eliminate that cognitive step.

### Pattern: verb + object

```
Save changes        (not "Submit" or "OK")
Delete project      (not "Confirm" or "Yes")
Upload photo        (not "Continue")
Send message        (not "Done")
Add team member     (not "OK")
Export as CSV       (not "Export")
```

### Destructive actions

Destructive buttons should use "Delete" rather than softer words that understate irreversibility:

```
Delete account      (not "Remove account" or "Close account")
Delete 3 files      (not "Remove" — include quantity when available)
Permanently delete  (when deletion is irreversible with no recycle bin)
```

### Include quantities when available

When the button's action affects a known number of items, include that count. It confirms what the user is about to do and prevents accidental bulk operations:

```
Delete 3 selected   (not "Delete")
Export 42 records   (not "Export")
Move 7 files        (not "Move")
```

### Confirmation button matching

In confirmation dialogs, the confirm button label should match the action label. If the dialog asks "Are you sure you want to delete this project?", the confirm button reads "Delete project" — not "Yes" or "Confirm".

---

## Error Messages

Error messages are the point at which users most need clarity and empathy. A bad error message stops the user completely; a good one helps them recover immediately.

### Structure: what + why + how

Every error should answer three questions:

1. **What** failed: be specific about what went wrong
2. **Why** it failed: provide the cause (when known)
3. **How** to fix it: give a concrete next step

### Error templates

**Format error** (invalid input):
```
"[Field] must be [format]. Example: [example]"
→ "Phone number must be 10 digits. Example: 555-123-4567"
```

**Missing required data:**
```
"[Field] is required to [action]"
→ "Email address is required to create an account"
```

**Access denied:**
```
"You don't have permission to [action]. [Next step or contact]"
→ "You don't have permission to delete this project. Ask an admin for access."
```

**Network error:**
```
"[Action] failed — check your internet connection and try again"
→ "Message not sent — check your internet connection and try again"
```

**Server error:**
```
"Something went wrong on our end. We've been notified and are looking into it. [Retry action]"
```

### Never blame the user

Users are not at fault for errors — the system either failed or the interface didn't set expectations clearly. Frame every error as guidance, not accusation:

```
WRONG:  "You entered an invalid email address"
CORRECT: "That email address format isn't recognized. Check for typos."

WRONG:  "You must complete all required fields"
CORRECT: "A few required fields need to be filled in before you can continue."

WRONG:  "Invalid password"
CORRECT: "Password must be at least 8 characters and include a number."
```

---

## Empty States

Empty states are a common missed opportunity. When a list, dashboard, or section has no content, the interface is in a teaching moment: the user is ready to start, but hasn't yet. A good empty state guides them.

### Three-part formula

1. **Acknowledge**: recognize that nothing is here yet
2. **Benefit**: explain what this section will do for them once populated
3. **Next step**: provide a single, clear action to start

### Examples

**Empty projects list:**
```
No projects yet
Once you create a project, it will appear here with your team's work and activity.
[Create your first project]
```

**Empty search results:**
```
No results for "payment gateway"
Try different keywords, or check if the search term is spelled correctly.
[Clear search]
```

**Empty notifications:**
```
You're all caught up
New notifications about your projects and team activity will appear here.
```

**Empty recent files:**
```
No files opened recently
Files you open will appear here so you can quickly pick up where you left off.
[Browse files]
```

### Empty state is not an error

Never style empty states like error messages (red borders, warning icons). They are a normal state. Use a neutral illustration or icon, body-weight text, and a single CTA.

---

## Voice vs Tone

**Voice** is who the product is. It stays consistent across all contexts.
**Tone** is how the product feels in a specific moment. It adapts to the user's emotional state.

### Defining voice

Choose 3–5 voice attributes. Each attribute should have an example of what it means and what it does not mean:

| Attribute | Sounds like | Does not sound like |
|-----------|-------------|---------------------|
| Clear | "Your file is saved" | "The persistence operation completed successfully" |
| Direct | "Delete this project" | "Would you like to consider deleting this project?" |
| Warm | "You're all set" | "Operation complete" |
| Confident | "Your payment is processing" | "We're trying to process your payment" |

### Tone by context

| Context | Tone | Example |
|---------|------|---------|
| Success | Celebratory, brief | "Saved!" / "Project created." |
| Error | Calm, helpful | "Something went wrong — try again in a moment" |
| Warning | Matter-of-fact | "This will affect 3 other projects" |
| Onboarding | Encouraging | "You're ready to invite your team" |
| Loading | Specific, active | "Syncing your data..." (not "Loading") |
| Destructive confirmation | Serious, no humor | "This cannot be undone." |

### No humor during failures

Humor during errors — "Uh oh, spaghetti-o!" — signals the product doesn't take the user's problem seriously. Reserve playful copy for successful states and empty states.

---

## Accessibility in Writing

### Link text must be self-explanatory

Screen readers announce links out of context. "Click here" and "Learn more" are meaningless when read as a list of links.

```
WRONG:  "For help, click here"
CORRECT: "Read the setup guide"

WRONG:  "Learn more"
CORRECT: "Learn more about team permissions"

WRONG:  "See all"
CORRECT: "See all 24 notifications"
```

### Alt text for images

- Informative images: describe what the image shows and why it matters in context
- Decorative images: use `alt=""` — do not leave the attribute out, which leaves the filename
- Icons with meaning: describe the action, not the icon shape

```html
<!-- Informative: describe the content -->
<img src="chart.png" alt="Revenue grew 40% from Q1 to Q4 2024">

<!-- Decorative: empty alt, not missing alt -->
<img src="divider.png" alt="">

<!-- Icon button: describe the action -->
<button aria-label="Delete project">
  <svg aria-hidden="true">...</svg>
</button>
```

### aria-label for icon-only buttons

Icon-only buttons are inaccessible without an `aria-label`. The label describes the action, not the icon:

```html
<!-- WRONG: no accessible name -->
<button><svg><!-- trash icon --></svg></button>

<!-- CORRECT: aria-label describes the action -->
<button aria-label="Delete comment"><svg aria-hidden="true">...</svg></button>
```

---

## Internationalization Preparation

UI strings that work in English may break layouts in other languages. Design and write with expansion in mind from the start.

### Expansion rates by language

| Language | Expansion vs English | Example |
|----------|---------------------|---------|
| German | +30% | "Settings" → "Einstellungen" (+60%) |
| French | +20% | "Submit" → "Envoyer" (similar) |
| Finnish | +30–40% | Compound nouns grow dramatically |
| Chinese | -30% | Often more compact than English |
| Japanese | -10–20% | Kanji is compact |
| Arabic | +25% | Plus requires RTL layout |

### Writing for translatability

**Keep numbers and strings separate.** Translators cannot reorder words inside a concatenated string:

```
WRONG:  "You have " + count + " new messages"
        (German: "Sie haben " + count + " neue Nachrichten" — position differs)

CORRECT: Use ICU message format or template variables:
        "You have {count} new messages"
        → translator preserves {count} and repositions it naturally
```

**Write full sentences, never fragments.** Fragments are grammatically ambiguous and often untranslatable:

```
WRONG:  "Selected: " + itemName   (fragment)
CORRECT: "{itemName} is selected"  (complete sentence)
```

**Spell out abbreviations.** Abbreviations rarely translate:

```
WRONG:  "3 msg" / "2 proj" / "5 min ago"
CORRECT: "3 messages" / "2 projects" / "5 minutes ago"
```

**Avoid idioms and metaphors.** "Get the ball rolling", "in the pipeline", "hit the ground running" have no equivalent in most languages.

### Layout for expansion

Design containers for +30–40% text expansion. Buttons, labels, and navigation items should be tested with longer German or Finnish strings before launch.

---

## Terminology Consistency

Using different words for the same concept confuses users and undermines trust. Choose one term and apply it everywhere — in UI labels, error messages, documentation, and support.

### Core terminology decisions

| Preferred | Never use (for same concept) |
|-----------|------------------------------|
| Delete | Remove, Trash, Discard (pick one; "Delete" is explicit) |
| Settings | Preferences, Options, Configuration |
| Sign in | Log in, Login (pick one; either is fine, be consistent) |
| Sign out | Log out, Logout |
| Plan | Subscription, Tier (unless "Plan" is an industry term in your domain) |
| Team | Workspace, Organization (unless they are distinct concepts) |

### Enforce terminology in reviews

Terminology drift happens gradually. Add a terminology check to design and content reviews. Common drift patterns:
- A new designer uses "Remove" where the system says "Delete"
- Documentation uses "Log in" while the UI says "Sign in"
- Error messages use a different word than the button that triggered them

---

## Loading States

Generic loading copy ("Loading...") is a missed opportunity to maintain the user's sense of progress and context.

### Specific loading descriptions

```
WRONG:  "Loading..."
CORRECT: "Loading your projects..."

WRONG:  "Please wait"
CORRECT: "Syncing changes..."

WRONG:  "Processing..."
CORRECT: "Processing payment..."
         "Generating your report..."
         "Analyzing 3,240 records..."
```

### Multi-step loading

For operations with multiple stages, show the current step:

```
Step 1 of 3: Validating your data...
Step 2 of 3: Uploading files...
Step 3 of 3: Finalizing your project...
```

---

## Prefer Undo Over Confirmation Dialogs

Confirmation dialogs interrupt workflow and create decision fatigue. For most reversible actions, "Undo" is a better pattern:

| Pattern | User experience |
|---------|----------------|
| Confirm dialog | Interrupts flow, requires a decision, adds friction |
| Undo toast | Non-blocking, action is immediate, recovery is available for 5–10 seconds |

### When confirmation dialogs are appropriate

Use confirmation dialogs only for:
- Permanently irreversible actions (no recycle bin, no undo)
- Actions affecting many items (batch delete 500 records)
- Actions with significant financial or security consequences

### Undo toast pattern

```
[Project "Q4 Campaign" deleted]  [Undo]  ×

// Disappears after 5 seconds
// Undo restores the project
// × dismisses immediately and commits deletion
```

---

## Placeholders Show Format, Not Labels

Placeholders disappear when users start typing, making them unsuitable as labels. Once the user is mid-input, they cannot look back at a placeholder to remember what field it was.

### Placeholders show example values

```
WRONG:  placeholder="Email address"  (this is what the label is for)
CORRECT: placeholder="name@company.com"

WRONG:  placeholder="Enter your name"
CORRECT: placeholder="Alex Chen"

WRONG:  placeholder="Date"
CORRECT: placeholder="MM/DD/YYYY"

WRONG:  placeholder="Message"
CORRECT: placeholder="What would you like to say?"
```

### Always use visible labels

Every input must have a visible `<label>` element. Placeholder-as-label is an accessibility failure (no label when filled, WCAG 1.3.1) and a usability failure (users cannot review what they entered without clearing the field).

```html
<!-- CORRECT: label + format hint placeholder -->
<label for="email">Email address</label>
<input id="email" type="email" placeholder="name@company.com">

<!-- WRONG: placeholder as label -->
<input type="email" placeholder="Email address">
```
