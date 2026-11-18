// Mode catalogue. `input` tells the session which answer surface to open.
export const MODES = {
  find: {
    id: 'find', name: 'Find it', input: 'country', rounds: 10,
    blurb: 'A country name. Find it on the globe.',
  },
  flags: {
    id: 'flags', name: 'Flag hunt', input: 'country', rounds: 10, needs: ['flag'],
    blurb: 'A flag. Put your finger on its country.',
  },
  capitals: {
    id: 'capitals', name: 'Capital pin', input: 'point', rounds: 10, needs: ['capitalLatLng', 'capital'],
    blurb: 'A capital city. Drop a pin as close as you can.',
  },
  capitalquiz: {
    id: 'capitalquiz', name: 'Capital quiz', input: 'choice-capital', rounds: 10, needs: ['capital'],
    blurb: 'A country and four capitals. Pick the right one.',
  },
  name: {
    id: 'name', name: 'Name it', input: 'choice-name', rounds: 10,
    blurb: 'The globe marks a country. Say which one.',
  },
  flagmatch: {
    id: 'flagmatch', name: 'Flag match', input: 'choice-flag', rounds: 10, needs: ['flag'],
    blurb: 'The globe marks a country. Pick its flag.',
  },
  flagquiz: {
    id: 'flagquiz', name: 'Flag quiz', input: 'flag-name', rounds: 10, needs: ['flag'],
    blurb: 'A flag and four names. Pick the right one.',
  },
  lookalikes: {
    id: 'lookalikes', name: 'Lookalike flags', input: 'flag-name', rounds: 10, needs: ['flag'],
    blurb: 'Every wrong answer is a flag that looks almost the same.',
  },
  flagblitz: {
    id: 'flagblitz', name: 'Flag blitz', input: 'blitz', seconds: 60, needs: ['flag'],
    blurb: 'Sixty seconds. As many flags as you can name.',
  },
  higherlower: {
    id: 'higherlower', name: 'Higher or lower', input: 'hl', endless: true,
    blurb: 'Two countries, one number. One wrong guess ends it.',
  },
  streak: {
    id: 'streak', name: 'Streak', input: 'mixed', endless: true,
    blurb: 'Mixed rounds, rising multiplier, one life.',
  },
  daily: {
    id: 'daily', name: 'Daily expedition', input: 'mixed', rounds: 5,
    blurb: 'Five rounds, the same for everyone today.',
  },
  // Scripted sessions: the rounds are handed to the game, not drawn from a pool.
  lesson: { id: 'lesson', name: 'Lesson', input: 'mixed', rounds: 10, blurb: 'Study a few neighbours, then find and name them.' },
  review: { id: 'review', name: 'Review', input: 'mixed', rounds: 10, blurb: 'The countries you missed, spaced out so they stick.' },
};

// Home index. Rows with `chooser` open a preset sheet instead of starting straight away.
export const INDEX = [
  { id: 'find' },
  { id: 'name' },
  { id: 'capsets', name: 'Capitals', blurb: 'Pick the capital from four, or drop a pin on it.', chooser: 'capitals' },
  { id: 'flagsets', name: 'Flags', blurb: 'Flag quiz, lookalikes, a 60-second blitz, or find the flag on the globe.', chooser: 'flags' },
  { id: 'hlsets', name: 'Higher or lower', blurb: 'Population, area, GDP, life expectancy, density or neighbours.', chooser: 'higherlower' },
  { id: 'streak' },
];

export const FLAG_PRESETS = ['flagquiz', 'lookalikes', 'flagblitz', 'flags', 'flagmatch'];
export const CAPITAL_PRESETS = ['capitalquiz', 'capitals'];

// Fixed-round modes whose rounds can be replayed from a link: the same countries, the same options.
export const CHALLENGE_MODES = ['find', 'name', 'capitals', 'capitalquiz', 'flags', 'flagmatch', 'flagquiz'];

// Higher or lower measures. `neighbours` compares only countries that share a border.
export const HL_PRESETS = {
  mixed: { name: 'Mixed', blurb: 'A different measure every round.' },
  population: { name: 'Population', blurb: 'Who has more people?' },
  area: { name: 'Area', blurb: 'Which is bigger on the ground?' },
  gdp: { name: 'Economy', blurb: 'Which has the larger GDP, in US dollars?' },
  lifeExpectancy: { name: 'Life expectancy', blurb: 'Where do people live longer?' },
  density: { name: 'Density', blurb: 'Where are people packed in tighter?' },
  neighbours: { name: 'Neighbours', blurb: 'Only countries that share a border, mixed measures.' },
};

export const recordKey = (mode, region, difficulty, preset) => {
  if (mode === 'daily') return 'daily';
  if (mode === 'higherlower') return `higherlower:${preset || 'mixed'}`;
  if (mode === 'streak') return 'streak';
  if (mode === 'flagblitz') return `flagblitz:${region}`;
  if (mode === 'lookalikes') return 'lookalikes';
  return `${mode}:${region}:${difficulty}`;
};
