# Glassbox Verse PM Spec — Addendum: changing a note's format

Resolves open question 1 of `verse-pm-spec.md`, and records that ACs 4–8 of that
spec ("Creating a verse note") are still unbuilt.

## Why this exists

The original spec fixed a note's format at creation and put conversion out of scope,
noting it was "worth doing next" and "the first thing a user with an existing poem
will look for". That is precisely what happened: a poem was written in the app, given
a `#verses` tag, and did not lay out as verse.

Two separate gaps were behind that.

The first is a mistaken expectation the product invited. The 365 verses imported from
the archive carry both `format: verse` and a `verses` tag, so the tag looks like the
thing doing the work. It never was. Tags describe what a note is about; format
describes how it is shaped. A note about poetry is not a poem.

The second is the real gap: **nothing in the app can set `format` at all.** The
creation menu was specified but never built, and conversion was out of scope, so
every note written in Glassbox is permanently prose. The archive has verse only
because the import wrote it into the files directly.

## Goal

Let the shape of a note be changed after it is written, and make verse reachable when
starting a new one.

## User stories

1. As someone who has just written a poem in a prose note, I want to turn it into
   verse without retyping it, so the note I already wrote is the note I keep.
2. As someone who tagged a poem `#verses` expecting it to look like one, I want the
   real control to be somewhere I will find it, so I stop guessing at the tag.
3. As someone who set verse by mistake, I want to set it back, so the decision is not
   a trapdoor.
4. As someone who writes mostly prose, I want the control to stay quiet, so it does
   not compete with the writing.

## Acceptance criteria

Numbering continues from `verse-pm-spec.md`, which ends at 19.

### The format switch

20. A note's overflow menu in the rail carries a format action, above Delete.
21. The action names what it will do rather than what the note currently is:
    `Turn into verse` on a prose note, `Turn into prose` on a verse note. A menu is a
    list of things you can do, and the note's own layout already shows which format it
    is in, so a two-option control would be restating what is visible.
22. Choosing it re-lays the note immediately, with no confirmation step.
23. Changing format never alters a single character of the body. It is presentation
    only, and switching back gives exactly the note you started with.
24. The change persists: it survives a reload, a folder reconnect, and a round trip
    through the Markdown file.
25. Switching a note to verse writes `format: "verse"` to its front matter. Switching
    a note to prose **removes the key** rather than writing `format: "prose"`, so a
    note that ends up prose is byte-identical to one that was always prose. This
    preserves AC 16: prose notes do not carry the key.
26. The action works on any note in the rail, including one that is not currently
    open, and does not open it as a side effect.
27. The menu is shared with conversation rows, which have no format. The action
    appears on note rows only, and never on a chat.
28. The action is reachable by keyboard in menu order, and choosing it closes the menu
    and returns focus to the trigger it came from, exactly as Delete does.

### Creating a verse note

ACs 4–8 of the original spec stand unchanged and are still outstanding. Restated
here because they are part of the same piece of work:

29. The rail's "New note" control offers "Note" and "Verse"; "Note" remains the
    one-click default and verse takes one deliberate extra step.
30. ~~The collapsed rail offers the same two choices.~~ **Dropped.** The
    collapsed rail is a 56px strip holding a single 18px glyph. A caret there
    would be a corner target barely larger than the icon it hangs off, and
    splitting the control would crowd the one state whose whole purpose is to
    be out of the way. The strip keeps its plus, which still makes a prose
    note in one click. Verse stays two steps away in that state, through the
    row's own menu, which is acceptable because a poem can be started as a
    note and turned.
31. The menu is keyboard reachable and dismissible with Escape without creating
    anything.

### What the tag does not do

32. The `verses` tag has no effect on layout, in either direction. Adding it to a
    prose note leaves it prose; removing it from a verse note leaves it verse.
    A note about poetry is not a poem, and a mis-tag must never rearrange writing.

## Content spec

- Menu item on a prose note: `Turn into verse`
- Menu item on a verse note: `Turn into prose`

"Turn into" rather than "Convert to": conversion sounds like a process that might
take a while or might not come back. This is instant and reversible, and the wording
should not make a reader hesitate over it.

## Edge cases

- **An empty note** switched to verse shows the verse placeholder, not the prose one.
- **A prose note with a drop cap** loses the drop cap on switching to verse, since
  verse never takes one (AC 10).
- **A long prose paragraph** switched to verse keeps its single line and wraps at the
  measure. It looks wrong, which is correct: the body is unchanged and the user can
  switch back.
- **A verse note switched to prose** may render a drop cap, by the normal prose rule.
- **Switching format on the note currently open** re-lays it underneath the reader
  without stealing focus and without discarding an in-flight edit.
- **Switching format on a note that is not open** changes that note and leaves the
  reader where they are. The rail does not jump to it.
- **Switching twice quickly** settles on the last choice, with no torn state on disk.
- **A hand-edited file with an unrecognised format** still opens as prose (AC 17), and
  the control shows Prose. Choosing Verse repairs the file.

## Out of scope

- Any distinguishing mark for verse notes in the rail list. Still open question 2.
- Bulk conversion of many notes at once.
- A third format. Sketch notes render an image and a caption, but they are prose notes
  that happen to contain an image, and making that a format is a separate decision.
- Inferring format from the shape of the body. Guessing at this would be wrong often
  enough to be worse than asking, and the user can see the answer in one click.

## Open questions carried forward

2. Should the rail mark verse notes so they are recognisable without opening them?
3. Should the reading-time line be suppressed for verse? "1 min read" is a prose idea
   and reads oddly under a poem.
