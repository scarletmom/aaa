import type { Session } from './session';

export const COMMENT_MAX_LENGTH = 2000;

export interface Comment {
  id: string;
  author: string;
  /** The poster's account id; seeded comments have none. */
  authorId?: string;
  text: string;
  postedAt: string;
  likes: number;
}

/** Comments that come with the site (src/data/comments.json), by video id. */
export type SeedComments = Record<string, Comment[]>;

// No backend yet: comments and likes posted here are kept in this browser, like the mock accounts in auth.ts.
// Swap these functions for API calls once there is one; the signatures are already async.
const POSTED_KEY = 'quillwood-comments';
const LIKES_KEY = 'quillwood-comment-likes';

function read<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return value && typeof value === 'object' ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('Your browser didn’t let us save that. Check that site storage is allowed.');
  }
}

const postedByVideo = () => read<Record<string, Comment[]>>(POSTED_KEY, {});
const likesByUser = () => read<Record<string, string[]>>(LIKES_KEY, {});

/** Keeps line breaks but drops runs of blank lines and trailing spaces. */
export const tidyCommentText = (text: string) => text.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

export async function loadComments(videoId: string, seeds: Comment[]): Promise<Comment[]> {
  return [...(postedByVideo()[videoId] ?? []), ...seeds];
}

export async function postComment(videoId: string, session: Session, text: string): Promise<Comment> {
  const body = tidyCommentText(text);
  if (!body) throw new Error('Write something first.');
  if (body.length > COMMENT_MAX_LENGTH) throw new Error(`Comments can be up to ${COMMENT_MAX_LENGTH} characters.`);
  const comment: Comment = {
    id: crypto.randomUUID(),
    author: session.name,
    authorId: session.id,
    text: body,
    postedAt: new Date().toISOString(),
    likes: 0,
  };
  const all = postedByVideo();
  write(POSTED_KEY, { ...all, [videoId]: [comment, ...(all[videoId] ?? [])] });
  return comment;
}

export async function deleteComment(videoId: string, session: Session, commentId: string): Promise<void> {
  const all = postedByVideo();
  const kept = (all[videoId] ?? []).filter((c) => !(c.id === commentId && c.authorId === session.id));
  write(POSTED_KEY, { ...all, [videoId]: kept });
}

export async function loadLikes(session: Session): Promise<Set<string>> {
  return new Set(likesByUser()[session.id] ?? []);
}

/** Gives `toId` the comments and likes this browser kept under `fromId`, after the server changed an account's id. */
export function moveOwnComments(fromId: string, toId: string) {
  if (!fromId || !toId || fromId === toId) return;
  try {
    const posted = postedByVideo();
    const moved = Object.fromEntries(Object.entries(posted).map(([videoId, comments]) =>
      [videoId, comments.map((comment) => (comment.authorId === fromId ? { ...comment, authorId: toId } : comment))]));
    write(POSTED_KEY, moved);
    const { [fromId]: liked = [], ...likes } = likesByUser();
    if (liked.length) write(LIKES_KEY, { ...likes, [toId]: [...new Set([...(likes[toId] ?? []), ...liked])] });
  } catch { /* storage unavailable: nothing kept to move */ }
}

/** Likes or unlikes a comment for this account; resolves to whether it is now liked. */
export async function toggleLike(session: Session, commentId: string): Promise<boolean> {
  const all = likesByUser();
  const mine = new Set(all[session.id] ?? []);
  const liked = !mine.delete(commentId);
  if (liked) mine.add(commentId);
  write(LIKES_KEY, { ...all, [session.id]: [...mine] });
  return liked;
}
