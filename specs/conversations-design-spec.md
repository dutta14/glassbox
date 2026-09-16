# Conversations design spec

## 1. Component hierarchy

```html
<aside class="notes-rail" aria-label="Notes and conversations">
  <div class="notes-rail__top-row">...</div>

  <button
    type="button"
    class="notes-rail__entry notes-rail__new-chat notes-rail__entry--active"
    aria-current="true"
  >
    <svg aria-hidden="true">...</svg>
    <span class="notes-rail__entry-label">New chat</span>
  </button>

  <button type="button" class="notes-rail__entry notes-rail__new">...</button>

  <nav
    class="notes-rail__content scroll-fades"
    aria-label="Conversations and notes"
  >
    <section class="notes-rail__section-block" aria-labelledby="conversations-heading">
      <div class="notes-rail__section notes-rail__section--sticky">
        <h2 id="conversations-heading" class="notes-rail__title">Chats</h2>
      </div>

      <div class="notes-rail__empty notes-rail__empty--chats">
        <p class="notes-rail__empty-title">No chats yet</p>
        <p class="notes-rail__empty-body">Use New chat to ask your notes.</p>
      </div>

      <ul class="notes-rail__conversation-list" aria-label="Chats">
        <li class="conversation-row">
          <button
            type="button"
            class="conversation-item conversation-item--selected"
            aria-current="true"
            data-conversation-id="..."
          >
            <svg class="conversation-item__icon" aria-hidden="true">...</svg>
            <span class="conversation-item__title">First prompt verbatim...</span>
          </button>
          <NoteRowMenu aria-label="More actions for chat: First prompt verbatim..." />
        </li>
      </ul>
    </section>

    <section class="notes-rail__section-block" aria-labelledby="notes-heading">
      <div class="notes-rail__section notes-rail__section--sticky">
        <h2 id="notes-heading" class="notes-rail__title">Notes</h2>
      </div>

      <div class="notes-rail__banner" role="note">...</div>

      <div class="notes-rail__empty">
        <p class="notes-rail__empty-title">No notes yet</p>
        <p class="notes-rail__empty-body">Use New note to write something down.</p>
      </div>

      <ul class="notes-rail__note-list" aria-label="Notes">
        <li class="note-row">...</li>
      </ul>
    </section>
  </nav>

  <footer class="notes-rail__footer">...</footer>
</aside>
```

New classes:

- `.notes-rail__content`, replaces `.notes-rail__list` as the only scrolling rail body.
- `.notes-rail__section-block`, wraps each section and its list or empty state.
- `.notes-rail__section--sticky`, makes the visible section label persist during scroll.
- `.notes-rail__conversation-list` and `.notes-rail__note-list`, unstyled lists inside the shared scroller.
- `.conversation-row`, mirrors `.note-row`.
- `.conversation-item`, mirrors `.note-item`.
- `.conversation-item--selected`, mirrors `.note-item--selected`.
- `.conversation-item__icon`, a quiet chat marker.
- `.conversation-item__title`, mirrors `.note-item__title`.

The existing `NoteRowMenu` pattern is reused for conversation delete. Its trigger label must include `chat:` before the title so screen reader users can distinguish chat menus from note menus.

## 2. Visual spec

No new token is required. Every value below exists in `tokens.css`.

### Rail structure

- `.notes-rail` keeps current width, padding, background, and border: `var(--rail-notes)`, `var(--space-5) var(--space-3) var(--space-3)`, `var(--color-surface)`, `1px solid var(--color-border)`.
- `.notes-rail__top-row`, `.notes-rail__entry`, and `.notes-rail__footer` remain fixed outside the scroll body.
- `.notes-rail__content` owns all vertical scrolling and the `scroll-fades` class.
- `.notes-rail__content`: `flex: 1`, `align-self: stretch`, `min-height: 0`, `overflow-y: auto`, `margin-inline: calc(var(--space-3) * -1)`, `padding-inline: var(--space-3)`, `padding-bottom: var(--space-2)`.
- The fade mask belongs to `.notes-rail__content`. It fades the clipped top and bottom of both sections together.
- Lists do not get independent scrollbars. The browser shows one scrollbar at the rail edge.

### Height distribution

- Top row, New chat, New note, and footer consume their natural height.
- `.notes-rail__content` receives all remaining height with `flex: 1`.
- Chats and Notes inside `.notes-rail__content` use natural height. There is no 50/50 split.
- If Chats is long and Notes is empty, the user scrolls through all chat rows, then sees the sticky Notes heading and the quiet Notes empty state.
- If Chats is empty and Notes is long, the user sees the Chats empty state first, then scrolls into notes.
- If both lists are empty, both empty states stack in the same scroll area.

### Section headings

- `.notes-rail__section`: keep current `width: 100%`, `padding: 0 var(--space-3)`, `margin-bottom: var(--space-2)`.
- `.notes-rail__section--sticky`: `position: sticky`, `top: 0`, `z-index: 10`, `background: var(--color-surface)`, `padding-top: var(--space-2)`, `padding-bottom: var(--space-2)`.
- `.notes-rail__title`: keep current `var(--fs-sm)`, `var(--fw-normal)`, `var(--color-text-muted)`.
- Add `border-bottom: 1px solid var(--color-border)` only while stuck if implementation can detect it. If not, no border. Do not add a permanent divider.

### Conversation row

- `.conversation-row`: `position: relative`.
- `.conversation-item`: same box as `.note-item`: `display: flex`, `align-items: center`, `gap: var(--space-2)`, `width: 100%`, `padding: var(--space-2) var(--space-3)`, `background: transparent`, `border: 0`, `border-radius: var(--radius)`, `text-align: left`.
- `.conversation-item__icon`: `flex: 0 0 auto`, `width: 16px`, `height: 16px`, `color: var(--color-text-secondary)`.
- `.conversation-item__title`: `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`, `font-size: var(--fs-sm)`, `font-weight: var(--fw-medium)`, `line-height: var(--leading-tight)`, `color: var(--color-text-muted)`.
- `.conversation-row:hover .conversation-item`, `.conversation-row:focus-within .conversation-item`: `padding-right: var(--space-8)`.
- Touch devices always reserve `padding-right: var(--space-8)`.
- The menu trigger remains absolutely positioned through `.note-row__menu` styles: `right: var(--space-1)`, `width: 24px`, `height: 24px`.
- Text and the menu never collide because the row reserves `var(--space-8)` only while the trigger is visible, and always on touch.

### Chat marker

Chat rows need an icon. Section headings are enough at rest, but the sticky header can be above or below the row during fast scroll and the rows otherwise match note rows. A 16px chat bubble icon gives a persistent, non-colour cue. It uses `var(--color-text-secondary)` at rest and `var(--color-text)` when selected. Do not add a badge, chip, or background tint.

### Empty state

- `.notes-rail__empty--chats` uses the existing empty-state treatment exactly.
- Title: `No chats yet`, `var(--fs-sm)`, `var(--fw-semibold)`, `var(--color-text)`.
- Body: `Use New chat to ask your notes.`, `var(--fs-xs)`, `var(--color-text-secondary)`, `max-width: 32ch`.
- Container: `display: flex`, `flex-direction: column`, `align-items: center`, `justify-content: center`, `gap: var(--space-2)`, `padding: var(--space-8) var(--space-4)`, `text-align: center`.
- No button. New chat already exists above the scroller.

## 3. States

### New chat entry

- Default: existing `.notes-rail__entry` styling, text `var(--color-text)`, icon `var(--color-text-secondary)`.
- Hover: `background: var(--color-surface-raised)`.
- Focus-visible: global `var(--shadow-focus)`.
- Active draft: `.notes-rail__entry--active`, `background: var(--color-surface-raised)`, `font-weight: var(--fw-semibold)`, icon `var(--color-text)`, `aria-current="true"`.
- Active saved conversation: New chat is inactive. The selected conversation row owns `aria-current`.

### Conversation row

- Default: transparent background, title `var(--color-text-muted)`, icon `var(--color-text-secondary)`.
- Hover: background `var(--color-surface-alt)`, title `var(--color-text)`. Keep icon `var(--color-text-secondary)`.
- Focus-visible on row button: global `var(--shadow-focus)`.
- Active: `.conversation-item--selected`, background `var(--color-surface-raised)`, title `var(--color-text)`, title `var(--fw-semibold)`, icon `var(--color-text)`, `aria-current="true"`.
- Active hover: stays `var(--color-surface-raised)`.
- Menu open: the row behaves like `:focus-within`: title space is reserved, trigger opacity is `1`, and the selected state remains visible if selected.

### Conversation menu trigger and menu

- Use `.note-row__menu-trigger`, `.note-row__menu-list`, `.note-row__menu-item`, and `.note-row__menu-item--danger` unchanged.
- Default trigger: opacity `0`, pointer events disabled, color `var(--color-text-muted)`.
- Hover, focus-within, expanded, and touch: opacity `1`, pointer events enabled.
- Trigger hover: `background: var(--color-surface-raised)`, color `var(--color-text)`.
- Menu item default: text `var(--color-text)`, background transparent.
- Delete item: text `var(--color-negative)`.
- Delete item hover: `background: var(--color-negative-light)`.

### Section headings

- Default and sticky: `var(--color-text-muted)` on `var(--color-surface)`.
- No hover, active, or focus state. Headings are not interactive.

## 4. Responsive behaviour

Current rail breakpoint is `@media (max-width: 900px)`.

- Above `900px`: expanded rail is `var(--rail-notes)`. Collapsed rail is `var(--rail-collapsed)`. Chats render inside `.notes-rail__content` with notes.
- At `900px` and below: expanded rail width is `260px`. Collapsed rail becomes `width: 0`, `padding: 0`, `overflow: hidden`, `border-right: 0`.
- When collapsed, no chat rows, note rows, headings, or empty states are rendered visually. The collapsed rail should not leave focusable descendants in the tab order.
- On touch at every width, conversation and note menu triggers are visible because hover is unavailable.
- The shared scroll model does not change at the breakpoint. If the rail is expanded on a narrow viewport, `.notes-rail__content` remains the single scroll owner and keeps the fades.

## 5. Dark mode notes

Dark mode is a straight variable swap. Do not add dark-only selectors for the conversation list.

Keep the icon because colour differences compress in dark mode. The icon supplies a shape cue between chats and notes without adding another surface level.

The active state remains `var(--color-surface-raised)`. In dark mode it becomes lighter than the rail and still reads as selected.

## 6. Interaction spec

### Click and pointer

- New chat starts a draft conversation view. If already in a draft, it is a no-op and preserves composer text.
- Sending the first prompt creates a conversation record. The rail row appears under Chats and becomes active.
- Conversation row click opens that conversation.
- Note row click opens that note.
- Conversation menu trigger opens the same portalled menu pattern as notes.
- Delete opens `ConfirmDialog` with title `Delete "{conversation title}"?`, description `This cannot be undone.`, confirm label `Delete`, cancel label `Cancel`, destructive mode enabled.

### Keyboard

- Tab order in the rail: collapse button, search button, New chat, New note, shared scroll content rows and row menu triggers in DOM order, footer controls.
- Conversation row buttons use native button keyboard behaviour. `Enter` and `Space` open the conversation.
- Menu trigger uses native button behaviour. `Enter` and `Space` open the menu.
- Escape in the open row menu closes it and returns focus to the trigger.
- ConfirmDialog keeps its existing keyboard contract. Escape cancels. Tab stays inside the dialog.

### Scroll

- `.notes-rail__content` is the only rail element passed to `useScrollFades`.
- The dependency list for fades must include conversation count, note count, sample banner visibility, empty states, and collapsed state.
- Sticky headings stay inside `.notes-rail__content`, so the fade mask clips them at the top edge with the rest of the content.
- Row menus close on scroll, matching `NoteRowMenu` behaviour, because the fixed menu would otherwise drift away from its row.

### Motion

- Row background and colour transitions: `var(--duration-fast)` with `var(--ease-out)`.
- Rail width transition: existing `var(--duration-base)` with `var(--ease-out)`.
- Scroll fade transition: existing `var(--duration-base)` with `var(--ease-out)`.
- Menu trigger opacity transition: existing `var(--duration-fast)` with `var(--ease-out)`.
- Reduced motion: existing global `@media (prefers-reduced-motion: reduce)` applies. Do not add movement. State changes may snap.

## 7. Accessibility spec

### Roles and labels

- Rail label becomes `aria-label="Notes and conversations"` because the rail now contains two content types.
- Shared scroller is `<nav aria-label="Conversations and notes">`.
- Chats section uses `<section aria-labelledby="conversations-heading">` and `<h2 id="conversations-heading">Chats</h2>`.
- Notes section keeps the existing `<h2>` level. Use `id="notes-heading"` and `aria-labelledby="notes-heading"` on the section.
- Conversation list is `<ul aria-label="Chats">`. Notes list is `<ul aria-label="Notes">`.
- Each row remains a real `<button>`, not a link, because selection changes app state.
- Selected row or active draft uses `aria-current="true"`. Only one element in the rail may have it at any time.
- Conversation menu trigger label: `More actions for chat: {title}`.
- Delete dialog title includes the title. If the title is very long, keep the accessible title verbatim and truncate only visually in the row.

### Heading hierarchy

- The rail has two `h2` headings: `Chats` and `Notes`.
- Do not create an `h1` in the rail.
- Empty-state titles remain paragraphs, matching current Notes empty state. They are status copy under the section heading, not page headings.

### Focus management after delete

Do not repeat finding B3. Focus must never fall to `<body>` after delete.

- Cancel delete: return focus to the menu trigger that opened the dialog.
- Confirm delete for inactive conversation: return focus to that conversation's menu trigger if the row still exists. If it was removed, focus the next conversation row. If no next row exists, focus the previous conversation row. If no conversations remain, focus New chat.
- Confirm delete for active conversation: select the next most-recent conversation and focus its row. If none exists, enter draft chat and focus New chat.
- If the deleted row was below the viewport and the fallback row is offscreen, call focus first and let the browser scroll it into view.
- The same rule applies to note deletes in the shared scroller. Use the existing select-neighbour shape from notes.

### Screen reader announcements

- Creating a draft by clicking New chat does not announce a new row because no row exists yet. `aria-current` on New chat is the state signal.
- After the first prompt creates a saved conversation, announce `Chat saved: {title}` in the existing polite status mechanism if one exists. If none exists, add one shared app status region. Do not put `aria-live` on the whole rail.
- After delete confirm, announce `Chat deleted.` If another chat becomes active, announce `Opened chat: {title}` after the delete message.
- Empty Chats state requires no live announcement on first render.

### Contrast ratios

All ratios use current `tokens.css` values and WCAG 2.1 relative luminance.

| Pair | Light ratio | Dark ratio | Usage |
|---|---:|---:|---|
| `var(--color-text)` on `var(--color-surface)` | 17.96:1 | 13.98:1 | Empty-state title, active labels on rail surface |
| `var(--color-text-muted)` on `var(--color-surface)` | 6.15:1 | 5.92:1 | Default conversation title, section headings |
| `var(--color-text-secondary)` on `var(--color-surface)` | 7.90:1 | 7.69:1 | Conversation icon, empty-state body |
| `var(--color-text)` on `var(--color-surface-alt)` | 16.78:1 | 12.69:1 | Hover row title |
| `var(--color-text-muted)` on `var(--color-surface-alt)` | 5.74:1 | 5.38:1 | Default text if hover colour has not transitioned yet |
| `var(--color-text-secondary)` on `var(--color-surface-alt)` | 7.37:1 | 6.98:1 | Hover row icon |
| `var(--color-text)` on `var(--color-surface-raised)` | 14.92:1 | 10.75:1 | Active row title and icon |
| `var(--color-text-muted)` on `var(--color-surface-raised)` | 5.11:1 | 4.56:1 | Transitional muted text on active surface |
| `var(--color-text-secondary)` on `var(--color-surface-raised)` | 6.56:1 | 5.91:1 | Menu trigger icon on active surface |
| `var(--accent)` on `var(--color-surface)` | 5.69:1 | 6.70:1 | Focus colour reference and any future text link in rail |
| `var(--color-negative)` on `var(--color-surface)` | 6.54:1 | 6.37:1 | Delete menu item text |

Every new normal-size text pairing is at least 4.56:1 in both themes, so it passes WCAG 2.1 AA.
