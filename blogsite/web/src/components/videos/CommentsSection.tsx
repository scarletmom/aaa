'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import {
  type Comment,
  COMMENT_MAX_LENGTH,
  deleteComment,
  loadComments,
  loadLikes,
  postComment,
  toggleLike,
} from '@/lib/comments';
import { formatDateTime, timeAgo } from '@/lib/format';
import { type Session, useSession } from '@/lib/session';
import { ThumbUpIcon } from '../ui/Icons';
import { blockTitle } from './styles';
import { ChannelAvatar } from './VideoCard';

type Sort = 'top' | 'newest';

const LONG_COMMENT = 320;
// The counter appears once a comment gets close to the limit.
const COUNTER_FROM = COMMENT_MAX_LENGTH - 200;

const byNewest = (a: Comment, b: Comment) => b.postedAt.localeCompare(a.postedAt);
const byTop = (a: Comment, b: Comment) => b.likes - a.likes || byNewest(a, b);

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.');

/** Comments under a video. Key it by video id. */
export default function CommentsSection({ videoId, seeds }: { videoId: string; seeds: Comment[] }) {
  const session = useSession();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [liked, setLiked] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<Sort>('top');
  // Your own new comments stay on top until you leave, whichever order is chosen.
  const [justPosted, setJustPosted] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    loadComments(videoId, seeds).then((list) => current && setComments(list), (e) => current && setError(errorMessage(e)));
    return () => { current = false; };
  }, [videoId, seeds]);

  useEffect(() => {
    if (!session) return;
    let current = true;
    loadLikes(session).then((set) => current && setLiked(set));
    return () => { current = false; };
  }, [session]);

  const post = async (text: string) => {
    if (!session) return;
    const comment = await postComment(videoId, session, text);
    setComments((list) => [comment, ...(list ?? [])]);
    setJustPosted((ids) => [comment.id, ...ids]);
  };

  const remove = async (id: string) => {
    if (!session) return;
    try {
      await deleteComment(videoId, session, id);
      setComments((list) => (list ?? []).filter((c) => c.id !== id));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const like = async (id: string) => {
    if (!session) return;
    try {
      const now = await toggleLike(session, id);
      setLiked((set) => {
        const next = new Set(set);
        if (now) next.add(id);
        else next.delete(id);
        return next;
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const pinned = (comments ?? []).filter((c) => justPosted.includes(c.id));
  const rest = (comments ?? []).filter((c) => !justPosted.includes(c.id)).sort(sort === 'top' ? byTop : byNewest);
  const count = comments?.length ?? 0;

  return (
    <section aria-labelledby="comments-title" className="mt-8">
      <div className={cn(blockTitle, 'flex flex-wrap items-center justify-between gap-2')}>
        <h2 id="comments-title">{comments ? `${count.toLocaleString('en-GB')} ${count === 1 ? 'comment' : 'comments'}` : 'Comments'}</h2>
        {count > 1 && (
          <div role="group" aria-label="Sort comments" className="flex gap-1 text-[12.5px] font-semibold tracking-normal normal-case">
            {(['top', 'newest'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={sort === value}
                onClick={() => setSort(value)}
                className="rounded-full px-3 py-1 text-muted transition-colors hover:text-fg aria-pressed:bg-fg aria-pressed:text-bg"
              >
                {value === 'top' ? 'Top' : 'Newest'}
              </button>
            ))}
          </div>
        )}
      </div>

      {session ? <CommentForm session={session} onPost={post} /> : <p className="text-[14px] text-muted">Sign in to join the conversation.</p>}

      {error && <p role="alert" className="mt-3 text-[13.5px] text-accent">{error}</p>}

      {comments === null ? (
        <p className="mt-6 text-[14px] text-muted">Loading comments…</p>
      ) : count === 0 ? (
        <p className="mt-6 text-[14px] text-muted">No comments yet. Start the conversation.</p>
      ) : (
        <ol className="mt-6 grid gap-5">
          {[...pinned, ...rest].map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              mine={Boolean(session && comment.authorId === session.id)}
              liked={liked.has(comment.id)}
              onLike={() => like(comment.id)}
              onDelete={() => remove(comment.id)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function CommentForm({ session, onPost }: { session: Session; onPost: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  // Grows with the text instead of scrolling inside a small box.
  const fit = () => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  };

  const reset = () => {
    setText('');
    setOpen(false);
    setError('');
    requestAnimationFrame(fit);
  };

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onPost(text);
      reset();
      fieldRef.current?.blur();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <ChannelAvatar name={session.name} className="size-10" />
      <div className="min-w-0 flex-1">
        <label htmlFor="comment-text" className="sr-only">Add a comment</label>
        <textarea
          id="comment-text"
          ref={fieldRef}
          rows={1}
          value={text}
          maxLength={COMMENT_MAX_LENGTH}
          placeholder="Add a comment…"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value);
            fit();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
          className="block max-h-72 w-full resize-none border-0 border-b border-line bg-transparent px-0 py-2 text-[15px] leading-normal outline-none placeholder:text-muted focus:border-fg"
        />
        {error && <p role="alert" className="mt-2 text-[13px] text-accent">{error}</p>}
        {open && (
          <div className="mt-2 flex items-center justify-end gap-2">
            {text.length >= COUNTER_FROM && (
              <span className="mr-auto text-[12.5px] text-muted tabular-nums">{text.length} / {COMMENT_MAX_LENGTH}</span>
            )}
            <button type="button" onClick={reset} className="rounded-full px-4 py-1.5 text-[14px] font-semibold hover:bg-surface-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!text.trim() || busy}
              className="rounded-full bg-fg px-4 py-1.5 text-[14px] font-semibold text-bg hover:bg-fg-2 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted"
            >
              {busy ? 'Posting…' : 'Comment'}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}

interface CommentItemProps {
  comment: Comment;
  mine: boolean;
  liked: boolean;
  onLike: () => void;
  onDelete: () => void;
}

function CommentItem({ comment, mine, liked, onLike, onDelete }: CommentItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const long = comment.text.length > LONG_COMMENT || comment.text.split('\n').length > 4;
  const likes = comment.likes + (liked ? 1 : 0);

  return (
    <li className="flex gap-3">
      <ChannelAvatar name={comment.author} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-[13px]">
          <span className="font-semibold">{comment.author}</span>
          {mine && <span className="rounded-full bg-surface-2 px-2 text-[11.5px] font-semibold text-fg-2">You</span>}
          <time dateTime={comment.postedAt} title={formatDateTime(comment.postedAt)} className="text-muted">
            {timeAgo(comment.postedAt)}
          </time>
        </p>
        <p className={cn('mt-1 text-[15px] leading-[1.5] [overflow-wrap:anywhere] whitespace-pre-line', long && !expanded && 'line-clamp-4')}>
          {comment.text}
        </p>
        {long && (
          <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="mt-1 text-[13px] font-semibold text-muted hover:text-fg">
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}

        <div className="mt-1 -ml-2 flex items-center gap-1 text-[13px] text-muted">
          <button
            type="button"
            onClick={onLike}
            aria-pressed={liked}
            aria-label={liked ? 'Remove like' : 'Like'}
            className={cn('grid size-8 place-items-center rounded-full hover:bg-surface-2 hover:text-fg', liked && 'text-accent hover:text-accent')}
          >
            <ThumbUpIcon size={17} className={cn(liked && '[&_path]:fill-current')} />
          </button>
          {likes > 0 && <span className="min-w-4 tabular-nums">{likes.toLocaleString('en-GB')}</span>}

          {mine && !confirming && (
            <button type="button" onClick={() => setConfirming(true)} className="ml-2 rounded-full px-3 py-1 font-semibold hover:bg-surface-2 hover:text-fg">
              Delete
            </button>
          )}
          {mine && confirming && (
            <span className="ml-2 flex items-center gap-1">
              <span className="text-fg-2">Delete this comment?</span>
              <button type="button" onClick={onDelete} className="rounded-full px-3 py-1 font-semibold text-accent hover:bg-surface-2">Delete</button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-full px-3 py-1 font-semibold hover:bg-surface-2 hover:text-fg">Keep</button>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
