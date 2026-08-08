/**
 * Natural-language search.
 *
 * The job is to turn "somewhere fun for the kids this weekend" into a filter
 * object the business index can execute. Two interpreters implement the same
 * contract:
 *
 *   1. `interpretLocally` — a lexicon-driven parser. No network, no API key,
 *      instant, and good enough that the product works fully without any AI
 *      credentials at all.
 *   2. `interpretWithClaude` — used only when ANTHROPIC_API_KEY is set. Handles
 *      phrasing the lexicon misses, and falls back to (1) on any error.
 */

import { config } from './config.js';
import { CATEGORIES } from './seed-data.js';

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

/**
 * word/phrase -> partial filter. Longest phrases are matched first so that
 * "open late" wins over a bare "open".
 */
const LEXICON = [
  // --- intent: open right now -------------------------------------------
  [['open now', 'open right now', 'currently open', 'still open', 'whats open', "what's open"], { openNow: true }],
  [['open late', 'late night', 'open at night', 'after midnight', 'midnight', 'late'], { openNow: true, tags: ['late', 'open late', '24 hours'] }],
  [['24 hours', '24/7', '24 hour', 'always open', 'round the clock'], { tags: ['24 hours'] }],
  [['right now', 'at the moment', 'tonight'], { openNow: true }],

  // --- intent: quality / price ------------------------------------------
  [['best rated', 'top rated', 'highest rated', 'best reviewed'], { minRating: 4.5, sort: 'rating' }],
  [['best', 'top', 'great', 'excellent', 'amazing'], { minRating: 4.4, sort: 'rating' }],
  [['cheap', 'cheapest', 'affordable', 'budget', 'inexpensive', 'good value'], { maxPrice: 2 }],
  [['fancy', 'upscale', 'fine dining', 'high end', 'posh'], { minPrice: 3 }],

  // --- intent: proximity -------------------------------------------------
  [['near me', 'nearby', 'closest', 'close by', 'around me', 'walking distance', 'near here'], { sort: 'distance' }],

  // --- intent: freshness -------------------------------------------------
  [['whats new', "what's new", 'new today', 'latest', 'just posted', 'happening now'], { sort: 'updated' }],

  // --- categories ---------------------------------------------------------
  [['restaurant', 'restaurants', 'eat', 'food', 'dinner', 'lunch', 'meal', 'hungry', 'dine'], { category: 'restaurant' }],
  [['cafe', 'cafes', 'coffee', 'espresso', 'flat white', 'latte', 'cappuccino'], { category: 'cafe' }],
  [['bakery', 'bakeries', 'bread', 'pastry', 'pastries', 'croissant', 'sourdough', 'cinnamon'], { category: 'bakery' }],
  [['grocery', 'groceries', 'supermarket', 'produce', 'fruit', 'vegetables', 'mini mart', 'convenience'], { category: 'grocery' }],
  [['pharmacy', 'pharmacies', 'chemist', 'drugstore', 'medicine', 'prescription'], { category: 'pharmacy' }],
  [['electronics', 'phone', 'phones', 'smartphone', 'laptop', 'computer', 'gadget', 'tech'], { category: 'electronics' }],
  [['barber', 'barbers', 'haircut', 'salon', 'nails', 'manicure', 'spa', 'beauty', 'grooming'], { category: 'beauty' }],
  [['gym', 'gyms', 'fitness', 'workout', 'weights', 'training'], { category: 'fitness' }],
  [['bar', 'bars', 'pub', 'cocktail', 'cocktails', 'jazz', 'live music', 'nightlife', 'drinks'], { category: 'nightlife' }],
  [['dessert', 'desserts', 'ice cream', 'gelato', 'sweet', 'sweets'], { category: 'dessert' }],
  [['book', 'books', 'bookshop', 'bookstore', 'reading'], { category: 'books' }],
  [['kids', 'children', 'child', 'family fun', 'play', 'playground', 'toddler'], { category: 'kids' }],
  [['clinic', 'doctor', 'gp', 'dentist', 'health'], { category: 'health' }],
  [['pet', 'pets', 'dog', 'cat', 'vet', 'grooming for dogs'], { category: 'pets' }],
  [['hardware', 'tools', 'diy', 'laundry', 'dry cleaning', 'repair', 'keys'], { category: 'services' }],
  [['shop', 'shops', 'shopping', 'clothes', 'clothing', 'store', 'boutique', 'flowers', 'florist', 'glasses'], { category: 'retail' }],

  // --- dietary and feature tags -------------------------------------------
  [['vegan'], { tags: ['vegan'] }],
  [['vegetarian', 'veggie'], { tags: ['vegetarian', 'vegan'] }],
  [['gluten free', 'gluten-free'], { tags: ['gluten-free'] }],
  [['halal'], { tags: ['halal'] }],
  [['wifi', 'work from', 'laptop friendly', 'study', 'quiet'], { tags: ['wifi', 'quiet', 'laptop'] }],
  [['takeaway', 'takeout', 'delivery'], { tags: ['takeaway', 'delivery'] }],
  [['brunch', 'breakfast'], { tags: ['brunch', 'breakfast'] }],
  [['date night', 'romantic'], { tags: ['date night'] }],
  [['weekend', 'this weekend', 'saturday', 'sunday'], { tags: ['weekend', 'family', 'kids'] }],
  [['fun'], { tags: ['fun', 'kids', 'live music'] }],
  [['pizza'], { tags: ['pizza', 'italian'] }],
  [['sushi', 'japanese'], { tags: ['sushi', 'japanese'] }],
  [['chinese', 'noodles', 'szechuan'], { tags: ['chinese', 'noodles'] }],
  [['mexican', 'tacos'], { tags: ['mexican', 'tacos'] }],
  [['indian', 'curry'], { tags: ['indian', 'curry'] }],
  [['burger', 'burgers'], { tags: ['burgers'] }],
  [['lebanese', 'mezze', 'shawarma', 'hummus'], { tags: ['lebanese', 'mezze'] }],
  [['persian', 'kebab', 'iranian'], { tags: ['persian', 'kebab'] }],
];

// Longest phrase first, so multi-word intents beat their single-word parts.
const SORTED_LEXICON = LEXICON.flatMap(([phrases, filter]) =>
  phrases.map((phrase) => ({ phrase, filter })),
).sort((a, b) => b.phrase.length - a.phrase.length);

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'for', 'to', 'of', 'in', 'on', 'at', 'me', 'my',
  'i', 'we', 'can', 'get', 'find', 'show', 'where', 'what', 'which', 'somewhere', 'some',
  'place', 'places', 'good', 'nice', 'near', 'now', 'open', 'that', 'and', 'or', 'with',
  'looking', 'want', 'need', 'please', 'any', 'there', 'here', 'go', 'about',
]);

function mergeFilters(target, addition) {
  for (const [key, value] of Object.entries(addition)) {
    if (key === 'tags') {
      target.tags = [...new Set([...(target.tags ?? []), ...value])];
    } else if (key === 'category') {
      // First category mentioned wins — "coffee near a bakery" is a coffee search.
      target.category ??= value;
    } else if (key === 'minRating' || key === 'minPrice') {
      target[key] = Math.max(target[key] ?? 0, value);
    } else if (key === 'maxPrice') {
      target[key] = Math.min(target[key] ?? 9, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/** Deterministic, offline query interpreter. */
export function interpretLocally(query) {
  const text = ` ${String(query || '').toLowerCase().replace(/[^\w\s'/-]/g, ' ').replace(/\s+/g, ' ')} `;
  const filters = {};
  let matched = '';

  for (const { phrase, filter } of SORTED_LEXICON) {
    // A shorter phrase already covered by a longer match must not re-apply —
    // otherwise "best" would overwrite the sort that "near me" just set in
    // "best rated coffee near me".
    if (matched.includes(` ${phrase}`) || matched.includes(`${phrase} `)) continue;
    if (text.includes(` ${phrase} `) || text.includes(` ${phrase}s `)) {
      mergeFilters(filters, filter);
      matched += ` ${phrase} `;
    }
  }

  // Words the lexicon didn't claim become a free-text search, so looking up a
  // business by name ("golden wok") works.
  //
  // Only when nothing else was understood, though: in "fresh bread this
  // morning" the lexicon already resolved `bread` to bakeries, and treating the
  // remaining "fresh morning" as a required text match would rule out every
  // bakery. A recognised category is the stronger signal — trust it.
  const understood = Boolean(filters.category) || filters.tags?.length > 0;
  const leftover = text
    .trim()
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w) && !matched.includes(` ${w} `))
    .join(' ')
    .trim();

  if (!understood && leftover.length > 2) filters.q = leftover;

  return { ...filters, source: 'builtin', explanation: describe(filters) };
}

/** Short human-readable summary of what the search actually did. */
export function describe(filters) {
  const parts = [];
  if (filters.openNow) parts.push('Open right now');
  if (filters.category) {
    const cat = CATEGORIES.find((c) => c.id === filters.category);
    parts.push(cat ? cat.label : filters.category);
  }
  if (filters.tags?.length) parts.push(filters.tags.slice(0, 3).join(', '));
  if (filters.minRating) parts.push(`rated ${filters.minRating}+`);
  if (filters.maxPrice && filters.maxPrice <= 2) parts.push('good value');
  if (filters.minPrice && filters.minPrice >= 3) parts.push('upscale');
  if (filters.sort === 'distance') parts.push('closest first');
  if (filters.sort === 'rating') parts.push('best rated first');
  if (filters.sort === 'updated') parts.push('freshest updates first');
  return parts.length ? parts.join(' · ') : 'Everything nearby';
}

/* --------------------------------------------------------------------------
 * Optional Claude-powered interpreter
 * ----------------------------------------------------------------------- */

const QUERY_SCHEMA = {
  type: 'object',
  properties: {
    category: {
      type: ['string', 'null'],
      enum: [...CATEGORY_IDS, null],
      description: 'The single best-matching business category, or null if the query spans categories.',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Lowercase keywords to match against a business (cuisine, diet, amenities, mood). Empty if none apply.',
    },
    openNow: {
      type: 'boolean',
      description: 'True only when the person wants somewhere they can go to immediately.',
    },
    maxPrice: {
      type: ['integer', 'null'],
      description: 'Price ceiling on a 1 (cheap) to 4 (expensive) scale, or null.',
    },
    minRating: {
      type: ['number', 'null'],
      description: 'Minimum star rating out of 5 when the person asked for quality, else null.',
    },
    sort: {
      type: 'string',
      enum: ['relevance', 'distance', 'rating', 'updated'],
      description: 'How to order results.',
    },
    q: {
      type: ['string', 'null'],
      description: 'Free text to match against business names, for example when a specific place is named.',
    },
    explanation: {
      type: 'string',
      description: 'A short phrase shown to the customer describing what was searched for, e.g. "Open right now · Vegan".',
    },
  },
  required: ['category', 'tags', 'openNow', 'maxPrice', 'minRating', 'sort', 'q', 'explanation'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You turn a person's plain-language request into search filters for a local business directory.

Available categories: ${CATEGORY_IDS.join(', ')}.

Read the request the way a knowledgeable local would. "Somewhere fun for the kids this weekend" is the kids category, not a text search. "A pharmacy that is open late" is the pharmacy category with openNow true. Only set openNow when the person wants to go now or tonight. Only set minRating when they asked about quality. Use q for a named business, otherwise leave it null.`;

let clientPromise = null;

async function getClient() {
  if (!config.anthropicApiKey) return null;
  clientPromise ??= import('@anthropic-ai/sdk')
    .then((mod) => new mod.default({ apiKey: config.anthropicApiKey }))
    .catch(() => null);
  return clientPromise;
}

async function interpretWithClaude(query) {
  const client = await getClient();
  if (!client) return null;

  const response = await client.beta.messages.create({
    model: config.anthropicModel,
    max_tokens: 1024,
    // Low effort keeps search latency down; this is a short, well-scoped task.
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: QUERY_SCHEMA },
    },
    // Server-side fallback so a declined request is still answered.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: query }],
  });

  if (response.stop_reason === 'refusal') return null;

  const text = response.content.find((block) => block.type === 'text')?.text;
  if (!text) return null;

  const parsed = JSON.parse(text);
  return {
    category: parsed.category ?? undefined,
    tags: parsed.tags ?? [],
    openNow: !!parsed.openNow,
    maxPrice: parsed.maxPrice ?? undefined,
    minRating: parsed.minRating ?? undefined,
    sort: parsed.sort || 'relevance',
    q: parsed.q ?? undefined,
    explanation: parsed.explanation || describe(parsed),
    source: 'claude',
  };
}

/**
 * Public entry point. Always resolves — the built-in interpreter is the
 * guaranteed floor, so search never fails because of an AI outage.
 */
export async function interpretQuery(query) {
  const local = interpretLocally(query);
  if (!config.anthropicApiKey || !query?.trim()) return local;

  try {
    const smart = await interpretWithClaude(query);
    return smart ?? local;
  } catch (err) {
    console.warn('[search] Claude interpretation failed, using built-in parser:', err.message);
    return local;
  }
}

export const aiSearchEnabled = () => Boolean(config.anthropicApiKey);
