# Glassbox Verse PM Spec

## Goal
Let a poem look like a poem. The editor's prose layout is built for paragraphs that
wrap, and it actively fights verse: it flows lines together visually, and it sets a
drop cap that swallows a short opening line. A note should be able to declare that it
is verse and be set accordingly.

## User stories
1. As someone who writes poetry, I want to start a note that is laid out as verse, so
   my line breaks are the shape of the poem rather than an accident of the window
   width.
2. As someone who mostly writes prose, I want verse to stay out of my way, so the
   default note is unchanged and the new option is one level down.
3. As someone returning to an old note, I want it to open in the format it was written
   in, so the poem does not silently reflow into a paragraph.
4. As someone who keeps notes as plain files, I want the format recorded in the file,
   so the note is still self-describing outside the app.

## Acceptance criteria

### Format as a property of the note
1. A note has a format, one of `prose` or `verse`. A note with no format recorded is
   prose.
2. The format is fixed at creation and travels with the note. Reopening a verse note
   shows verse layout without any further action.
3. The format survives a reload, a folder reconnect, and a round trip through the
   Markdown file.

### Creating a verse note
4. The rail's "New note" control offers two choices: "Note" and "Verse". "Note" is the
   default and produces exactly today's behaviour.
5. Choosing "Verse" creates an empty note whose format is `verse`, adds it to the rail,
   opens it, and focuses the title field, matching AC 1 of the main spec.
6. The primary action of the control still creates a prose note in one click. Reaching
   verse takes one extra deliberate step and never happens by accident.
7. The choices are reachable by keyboard, and the menu can be dismissed with Escape
   without creating anything.
8. The collapsed rail offers the same two choices.

### Verse layout
9. A verse note preserves every line break exactly as typed. A line longer than the
   measure wraps rather than being clipped or scrolled.
10. A verse note never renders a drop cap, at any length.
11. Verse uses more open leading than prose, so lines read as separate rather than as a
    block of text.
12. A blank line between stanzas reads as a stanza break, visibly larger than the gap
    between two lines.
13. The title, the chapter rule and the colophon are unchanged from prose. Only the
    body differs.
14. Verse layout applies to both the reading view and the field being typed into, so
    the text does not jump when the note is clicked into.

### Storage
15. A verse note records `format: "verse"` in its Markdown front matter.
16. A prose note records no `format` key, so existing files on disk are not rewritten
    or churned by this feature.
17. An unrecognised format value in a hand-edited file is treated as prose, and the
    note still loads. A bad format is never a reason to lose a note.

### Retrieval
18. Verse notes are indexed, searchable and citable exactly as prose notes are. Format
    is a presentation concern and changes no engine behaviour.
19. A passage quoted from a verse note in a chat answer keeps its line breaks.

## Content spec

### Rail
- Primary button label: `New note`
- Menu item labels: `Note`, `Verse`
- Accessible name of the disclosure: `New note options`

### Editor
- Placeholder body for a verse note: `Write your verse. Line breaks are kept as you
  type them.`
- The prose placeholder is unchanged.

## Edge cases
- Empty verse note: shows the verse placeholder, no drop cap, no layout jump.
- One-line verse note: renders as one line. Nothing dangles.
- Verse note whose body is a single very long line: wraps at the measure.
- Verse note with leading or trailing blank lines: preserved, not trimmed.
- A prose note that happens to contain hard line breaks is unaffected. It stays prose
  and keeps today's behaviour.
- Hand-edited file with `format: "verse"` and a prose-looking body: renders as verse.
  The file is the source of truth.
- Very long poem: the body still grows to fit and the section scrolls as one document.

## Out of scope
- Converting an existing note between prose and verse. Every poem a user has already
  written stays prose until this ships. Worth doing next; called out as an open
  question rather than assumed.
- Any distinguishing mark for verse notes in the rail list.
- Centring or indenting individual lines within a poem, hanging indents, and
  per-stanza numbering.
- A third format. Two is the whole set for now.
- Markdown rendering of any kind. The body is still plain text.

## Open questions
1. Should an existing note be convertible to verse after the fact? Likely yes, and it
   is the first thing a user with an existing poem will look for.
2. Should the rail mark verse notes so they are recognisable in the list without
   opening them?
3. Should the reading-time line in the colophon be suppressed for verse? "1 min read"
   is a prose idea and reads oddly under a poem.
