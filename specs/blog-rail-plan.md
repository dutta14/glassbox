# Blog rail: where the app departs from the mock, and what is left

`blog-rail-spec.md` is the behaviour; `blog-rail-mock.html` is the picture. This
records where the shipped app (issues #13 to #21) differs from the mock or the
spec, and what follows.

## Departures from the mock

- **Tagline.** "Notes, mostly unfinished." is fixed copy. The spec allows the
  owner to change it; there is no field for it yet.
- **Collections tab.** A flat list of collections, one row each, as specced.
  The mock's nested year grouping under a collection is not built.
- **Edit.** The mock edits a post by clicking its body. The app has an "Edit"
  link under each post (and on each chapter), so that reading never starts an
  edit by accident and a selection can be made without one.
- **Edit route.** Editing is `#/note/:id?edit=1`, so it survives a reload and
  Back leaves it. The mock has no route.
- **Edit does not focus the body (#20).** Choosing Edit opens the editor with
  the note shown as prose and the field waiting underneath; the first click in
  the prose, or Enter from the title, puts focus in the body. The e2e specs
  start writing that way (`startWriting`), so they expect focus only after that
  click. Focusing the body on arrival would raise the on-screen keyboard on
  phones before the reader has asked to write. Keep, unless both are revisited.
- **Windowing.** The feed loads in pages and mounts every post it has loaded.
  There is no windowing past about 60 posts. Fine for the library sizes the app
  has seen; a virtual list is the next step if it is not.
- **Search Esc scope.** Esc closes search when focus is in the search field.
  With focus elsewhere (search has no scrim and no trap) it does what it does
  there: closes a menu or dialog, leaves the editor, closes the small-screen
  drawer. Search stays open.
- **Chapter bodies.** The collection page still renders chapters with
  BookStage's own chapter markup, not NoteArticle. They match visually (same
  measure, same type) but are two components.
- **Collection page title.** It is a single-line input, so a very long name
  truncates in the field instead of wrapping. The collection line on a post, the
  rail row, and the chapter footer all wrap.
- **Small screens.** Under 900px the rail is a drawer (304px, or the viewport
  minus 48px) over a `--color-scrim`. Tab wraps inside it, Esc and the scrim
  close it, choosing a row closes it, and focus returns to the menu button.
  Esc does not close the drawer while a menu or dialog is open; that Esc closes
  the menu first. The mock has the drawer without the focus wrap.
- **Scrim token.** `--color-scrim` is new (light and dark), not a hard-coded
  rgba, so the dark drawer sits over a darker wash.
- **Collapsed bar.** With the rail collapsed, the collection page's running bar
  is 80px tall and indented 68px so the fixed menu button does not straddle its
  rule. The mock has no collection page in that state.
- **Sample notes.** Removed after the rail shipped: a fresh app is empty, and
  there is no banner.
- **Headings.** On the collection page the contents heading, story titles and
  chapter titles are h2, under the page's title field, so the outline has no
  skipped level.

## Checks

- **Dark mode.** Every rail, feed, editor and collection surface reads its
  colour from tokens. The only literal colours left are in `tokens.css`.
- **axe.** There is no accessibility test in e2e and no `@axe-core/playwright`
  dependency. `axe-core` (a transitive dependency of the Storybook a11y addon)
  was run by hand with the wcag2a, wcag2aa, wcag21aa and best-practice tags on
  the feed with the rail, search results, search with no results, a collection
  page, an empty collection, the empty library and its Collections tab, the
  editor and the small-screen drawer, in light and dark. The only finding was
  heading order on the collection page, fixed as above. Making this permanent
  needs `@axe-core/playwright` as a dev dependency.

## Visual baselines

Only darwin baselines are regenerated in this branch (`npm run test:e2e:update`).
The linux ones are produced by `.github/workflows/visual-baselines.yml`, never by
hand.

- The rail's linux baselines were deleted in #14 and have not been regenerated.
- The editor's linux baselines predate #14 and are stale.

Before CI's visual run can pass on linux, run the workflow on this branch:
`gh workflow run visual-baselines.yml --ref feat/blog-rail`, then pull the commit
it makes.

## Follow-ups

- Run the visual-baselines workflow (above).
- Add `@axe-core/playwright` and an e2e spec over the rail, feed and collection
  page, light and dark.
- Let the owner edit the tagline.
- Window the feed past about 60 posts.
- Rebuild collection chapters on NoteArticle so there is one post component.
- Let the collection page title wrap (textarea or auto-size) instead of truncating.
- The Ask button ("?") floats over body text on phones. It predates the rail;
  give the feed bottom padding or move the button.
