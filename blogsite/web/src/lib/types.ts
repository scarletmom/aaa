// Shapes of the JSON files in blogsite/data/.

export type BodyBlock = string | { h: string } | { quote: string; by?: string };

export interface Article {
  id: string;
  title: string;
  summary: string;
  category: string;
  author: string;
  authorRole: string;
  publishedAt: string;
  featured?: boolean;
  views: number;
  image: string;
  imageCaption: string;
  imageCredit: string;
  tags: string[];
  body: BodyBlock[];
}

/** An article with its section's display name, as every page receives it. */
export interface Story extends Article {
  sectionName: string;
}

/** The fields list views (rows, cards, search) need; search entries carry flattened body text instead of `body`. */
export type StorySummary = Pick<
  Story,
  'id' | 'title' | 'summary' | 'category' | 'sectionName' | 'author' | 'authorRole' | 'publishedAt' | 'image' | 'imageCaption' | 'tags'
>;

export interface SearchEntry extends StorySummary {
  text: string;
}

/** A shortcut into the videos app, listed in the home page's sidebar. */
export interface AppLink {
  id: string;
  title: string;
  text: string;
  href: string;
  image?: string;
}

export interface Section {
  slug: string;
  name: string;
  description: string;
}

export interface LinkGateText {
  banner: string;
  bannerButton: string;
  title: string;
  intro: string;
  start: string;
  waiting: string;
  get: string;
  loading: string;
  redirecting: string;
  expired: string;
  invalid: string;
  unreachable: string;
  serverError: string;
  noLink: string;
  retry: string;
}

export interface LinkGateSettings {
  countdownSeconds?: number;
  method?: string;
  header?: string;
  scheme?: string;
  allowedOrigins?: string[];
  text?: Partial<LinkGateText>;
}

export interface SiteConfig {
  name: string;
  tagline: string;
  edition: string;
  description: string;
  apiUrl?: string;
  /** The Terabox worker: given ?url=<share link>, it returns the share's files and stream links. */
  teraboxUrl?: string;
  sections: Section[];
  topics: string[];
  trending: string[];
  labels?: Record<string, string>;
  footer: { about: string; company: string[]; help: string[] };
  linkGate?: LinkGateSettings;
}

export interface PlayerConfig {
  title: string;
}
