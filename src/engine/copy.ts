/** Every fixed string the assistant can say. If it is not here, it came from a note. */
export const COPY = {
  greeting: 'Hi. Ask me something about your notes.',

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
  untitledChat: 'Untitled chat',
  emptyChatsSidebar: 'Ask a question to start a chat.',

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

  storageUnavailable:
    'Your browser is not saving data. Notes and chat will disappear when you close this tab.',

  sampleBanner: 'These are sample notes so you can try the chat. Delete them anytime.',
  noteDeleted: 'This note was deleted.',

  placeholderTitle: 'Title',
  placeholderBody: 'Write your note. Use #tags to group related notes.',
  placeholderChat: 'Ask about your notes',
  placeholderChatEmpty: 'Add a note first',

  tooltipConfidence: 'How closely the passage matched your question. 1.00 is a perfect match.',
  tooltipIntent: 'The kind of question I thought you were asking.',
  tooltipTerms: 'Your question after removing common words and reducing to word stems.',
} as const;
