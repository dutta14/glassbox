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

  emptyNotesSidebar: 'No notes yet. Start with your first one.',
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
