import type { Note } from '../types';

/**
 * Sample note ids are DELIBERATELY STABLE across calls to `sampleNotes()`.
 * Under React StrictMode the load-and-seed effect can run twice, and the
 * second pass would otherwise generate a fresh set of ids and write five
 * more copies of every sample. With stable ids the two passes overwrite
 * each other and the library ends up with exactly five samples, which is
 * the correct outcome. Do not switch these to createId().
 */
const SAMPLE_IDS = [
  'sample-postgres-tuning',
  'sample-1on1-priya',
  'sample-sourdough-loaf',
  'sample-thinking-in-systems',
  'sample-kyoto-trip',
] as const;

const iso = (daysAgo: number, hour = 10): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export const sampleNotes = (): Note[] => [
  {
    id: SAMPLE_IDS[0],
    title: 'Postgres index tuning',
    body:
      'Spent the afternoon chasing a slow dashboard query. The offender was a filter on ' +
      'created_at combined with a status column, and the planner kept choosing a sequential ' +
      'scan over our forty million row events table. A partial index on status where status ' +
      "in ('open', 'pending') cut the query from 2.1 seconds to 40 milliseconds.\n\n" +
      'The lesson I keep re-learning: composite indexes only help when the leading column is ' +
      'selective. Ordering matters. Put the high-cardinality column first, unless you always ' +
      'query with an equality on the low-cardinality one, in which case it goes first.\n\n' +
      'Also worth remembering that Postgres will not use an index if you wrap the column in a ' +
      'function. date_trunc(\'day\', created_at) defeats a plain btree on created_at. Either ' +
      'add an expression index or rewrite the predicate as a range. #postgres #performance',
    tags: ['postgres', 'performance', 'sample'],
    createdAt: iso(9),
    updatedAt: iso(9),
  },
  {
    id: SAMPLE_IDS[1],
    title: '1:1 with Priya',
    body:
      'Priya wants to move toward a staff engineer path. She has been in senior for two ' +
      'cycles and the growth has plateaued because most of her work is inside a single team. ' +
      'The gap is scope: cross-team influence, mentoring, and a project with visible business ' +
      'impact. We agreed her next quarter should include leading the search relevance rework, ' +
      'which touches three teams and has a clear metric.\n\n' +
      'She also asked about the hiring bar for L5 backfills. I told her we are going to hold ' +
      'the L5 backfill until Q4 and prioritize the two L4 requisitions instead, so the team ' +
      'has more capacity heading into the launch. She agreed with the tradeoff.\n\n' +
      'Follow-ups: share the staff engineer rubric, introduce her to Marco who did the ' +
      'search rework at his last company, and set a monthly check-in on progress. #work #1on1',
    tags: ['work', '1on1', 'sample'],
    createdAt: iso(3),
    updatedAt: iso(3),
  },
  {
    id: SAMPLE_IDS[2],
    title: 'Sourdough loaf that finally worked',
    body:
      'After six flat bricks, I finally got an open crumb. The change was the starter: I had ' +
      'been feeding it a 1:1:1 ratio and using it straight from the fridge. This time I ' +
      'pulled it out the night before, fed it 1:5:5, and only mixed the dough when the ' +
      "starter had tripled and smelled sweet, not sour. Bread's not a recipe, it's a " +
      'schedule.\n\n' +
      'Hydration was 78%, which is at the edge of what I can handle by hand. Autolyse for an ' +
      'hour, then four sets of stretch and folds thirty minutes apart. Bulk ferment on the ' +
      'counter at 24C for about five hours until the dough was jiggly and had risen roughly ' +
      '50%. Cold retard overnight.\n\n' +
      'Baked in a preheated dutch oven at 250C for 20 minutes covered, then 220C for 20 more ' +
      "uncovered. The ear was dramatic, the crust shattered, and the crumb had those big " +
      'irregular holes you see on King Arthur. Not selling it, but proud of it. #cooking #baking',
    tags: ['cooking', 'baking', 'sample'],
    createdAt: iso(6),
    updatedAt: iso(6),
  },
  {
    id: SAMPLE_IDS[3],
    title: 'Notes on Thinking in Systems',
    body:
      'Meadows keeps hammering the same point in different shapes: the structure of a system ' +
      'produces its behavior, and most of the leverage is upstream of the events we react to. ' +
      'A stock is a memory of past flows. Feedback loops explain why interventions often ' +
      'produce the opposite of what was intended.\n\n' +
      'The idea that stuck with me was that goals of a system are inferred from behavior, not ' +
      'from stated intent. If a company says it values quality but ships every Friday no ' +
      'matter what, the real goal is throughput. Watch the flows to find the goal.\n\n' +
      'She lists leverage points from weakest to strongest: parameters at the bottom, then ' +
      'buffer sizes, feedback delays, information flows, rules, self-organization, and at the ' +
      'top the paradigm the system arises from. Most managers spend their time at the ' +
      'parameter level and wonder why nothing changes. #reading #systems',
    tags: ['reading', 'systems', 'sample'],
    createdAt: iso(14),
    updatedAt: iso(14),
  },
  {
    id: SAMPLE_IDS[4],
    title: 'Kyoto trip planning',
    body:
      'Flying into Osaka on the red-eye and taking the Haruka express to Kyoto Station. Five ' +
      'nights at a small ryokan in Higashiyama, walking distance to Kiyomizu-dera. The plan ' +
      'is one temple in the morning, one neighborhood in the afternoon, and no more than that. ' +
      'Last time I tried to see everything and remembered nothing.\n\n' +
      'Morning list: Fushimi Inari before sunrise so the shrine gates are empty, Ginkaku-ji ' +
      'and the philosopher\'s path on a cloudy day, Arashiyama bamboo grove at first light, ' +
      'a slow half-day at Ryoan-ji, and one temple I have never been to, either Tofuku-ji or ' +
      'Daitoku-ji depending on the maple color.\n\n' +
      'Food: kaiseki at least once, standing sushi at Nishiki market, a proper bowl of ramen ' +
      'at Ippudo, and coffee at Weekenders. Skip the michelin chase. Also buy a small ' +
      'sketchbook and actually use it this time. #travel #kyoto',
    tags: ['travel', 'kyoto', 'sample'],
    createdAt: iso(20),
    updatedAt: iso(20),
  },
];
