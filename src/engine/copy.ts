/** Every fixed string the assistant can say. If it is not here, it came from a note. */
export const COPY = {
  greeting: "Hi. Ask me something you've written about.",

  help:
    'I can find passages in your notes. Try: "what did I write about postgres", ' +
    '"how many notes do I have", "what did I write last week", or "show me #work notes". ' +
    'I only quote what you wrote. If it is not in your notes, I will say so.',

  unknown: 'I did not understand that. Try rephrasing, or type "help" to see what I can do.',

  notFound:
    'I could not find this in your notes. Try different words, or check that you wrote about this.',

  count: (n: number) => `You have ${n} notes.`,
  countOne: 'You have 1 note.',

  recentEmpty: 'You did not write any notes in that period.',
  tagEmpty: (tag: string) => `No notes tagged #${tag}.`,

  untitled: 'Untitled',
  /* A chat is titled by its first prompt, so this only appears if that prompt
     was whitespace. Distinct from a note's "Untitled" so the two lists in the
     rail never show an identical unlabelled row. */
  untitledChat: 'Untitled question',
  /* "Ask", not "New chat". A chat invites comparison with an assistant that
     writes its own sentences, which is the one thing this cannot do and the
     one comparison it always loses. Asking is what the reader is actually
     here to do, and what comes back is their own writing. The route and the
     stored keys still say chat; only the words on screen changed, because
     renaming those buys nothing and costs a migration. */
  askRow: 'Ask',
  /* The list holds past questions, each one titled by the words that opened
     it, so this names what is in it rather than the shape of the exchange. */
  questionsHeading: 'Questions',
  /* Names the main region for anyone moving by landmark. Distinct from the
     rail's "Questions", which is the list of past ones: hearing the same
     word for the list and for the thing it opens would hide the move
     between them. */
  chatRegion: 'Conversation',
  emptyChatsSidebar: 'Ask a question to start one.',

  /* The pane. Ask is no longer a place you navigate to, it is something you
     open while reading, so these name a control and a container rather than a
     destination. */

  /* On the floating button. The button shows only a question mark, so this is
     the whole of its accessible name and has to say what opens. */
  askOpen: 'Ask your notes',
  askClose: 'Close Ask',
  /* Names the pane itself for anyone moving by landmark. It is a complementary
     region beside the note, not a dialog: the note stays readable and
     interactive alongside it, and calling it a dialog would tell a screen
     reader user the rest of the page had gone away when it had not. */
  askPaneRegion: 'Ask',
  /* The drawer of past questions inside the pane. "Questions" alone is the
     rail's old word; this says where it is, because it opens over the
     conversation rather than beside it. */
  askHistoryOpen: 'Past questions',
  askHistoryClose: 'Back to the conversation',
  askHistoryRegion: 'Past questions',
  askNewQuestion: 'New question',
  /* The drag handle between the note and the pane. Named as the thing it does
     rather than what it is, since "separator" is already announced by role. */
  askResize: 'Resize the Ask pane',

  /* Shown at '/' when there is nothing to open. Ask used to fill this space,
     so the app had something to say to a new reader before they had written
     anything. Now the first move is theirs, and this says what it is. */
  emptyLibraryTitle: 'Nothing here yet',
  emptyLibraryBody: 'Write your first note and it will appear in the list.',

  /* Distinct from the other two for the same reason they are distinct from
     each other: three lists share the rail, and an unnamed row in one must
     never be mistaken for an unnamed row in another. */
  untitledBook: 'Untitled book',
  emptyBooksSidebar: 'Add a note to a book to start one.',

  emptyNotesSidebar: 'Use New note to start one.',
  /* The rail in book mode lists only notes that are in no book. Saying "Use
     New note to start one." to someone whose 566 notes are all shelved would
     be a lie, so this states the fact instead. */
  emptyNotesAllBooked: 'Every note is in a book.',

  /* One string for the button's accessible name and the menu's own heading,
     so what is heard and what is seen can never drift apart. */
  organizeMenu: 'Organize notes',
  organizeOptionList: 'In one list',
  organizeOptionBook: 'By book',

  /* One phrasing for the rail row and the landing page, so the same book is
     never "Empty" in one place and "0 chapters" in another. An empty book says
     so rather than showing a count, which reads like a counter that failed. */
  chapterCount: (n: number) =>
    n === 0 ? 'Empty' : n === 1 ? '1 chapter' : `${n} chapters`,

  booksRow: 'Books',
  booksPageTitle: 'Books',
  /* Placeholder and label share their words: a placeholder is not a label, but
     there is no reason for the two to say different things. */
  booksSearch: 'Search books',
  /* Names what was searched, so the reader knows the app heard them and the
     shelf is genuinely empty for that word. */
  booksSearchEmpty: (query: string) => `No books match "${query}".`,
  newBook: 'New book',
  /* Points at the button on this page rather than teaching the add-a-note
     gesture, which would send the reader past a control in front of them. */
  booksPageEmpty: 'No books yet. Use New book to start one.',
  emptyBookChapters: 'No chapters yet.',
  emptyNotesChat: 'Add a note to ask questions about it.',
  emptyChat: 'Ask a question about your notes.',

  /* The pitch, in the reader's own numbers. Any note app can claim to be an
     archive; one that says how many notes it holds and how far back they go
     is making a claim the reader can check against their own memory. The
     span is the part no general-purpose assistant can answer for, because it
     never read your 2010. */
  askTitle: "Ask what you've written",
  archiveLine: (count: number, firstYear: number, lastYear: number) => {
    const notes = count === 1 ? '1 note' : `${count} notes`;
    /* A library written entirely within one year would otherwise read
       "2026 to 2026", which looks like a bug rather than a fact. */
    return firstYear === lastYear
      ? `${notes}, ${firstYear}.`
      : `${notes}, ${firstYear} to ${lastYear}.`;
  },
  /* Stated as a limit, not a boast. It is the reason to trust the answer and
     the reason it will sometimes refuse, and both come from the same fact. */
  archiveContract: 'Every answer is a passage you wrote, quoted exactly.',

  storageUnavailable:
    'Your browser is not saving data. Notes and questions will disappear when you close this tab.',

  sampleBanner: 'These are sample notes so you have something to ask about. Delete them anytime.',
  noteDeleted: 'This note was deleted.',

  placeholderTitle: 'Title',
  placeholderBody: 'Write your note. Use #tags to group related notes.',
  /* Deliberately not the same words as askTitle above it. The heading states
     the promise; the field has to invite a question, and an input echoing the
     heading it sits under reads like a stutter. */
  placeholderChat: 'Ask something',
  placeholderChatEmpty: 'Add a note first',

  tooltipConfidence: 'How closely the passage matched your question. 1.00 is a perfect match.',
  tooltipIntent: 'The kind of question I thought you were asking.',
  tooltipTerms: 'Your question after removing common words and reducing to word stems.',
} as const;
