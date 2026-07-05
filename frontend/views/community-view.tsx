'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Heart, MessageCircle, Pin, Send, Trash2, ChevronDown,
  CornerDownRight, Loader2, RefreshCw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { formatDateRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth'
import {
  getPosts, createPost, deletePost,
  addComment, deleteComment, toggleLike,
  type CommunityPost, type CommunityComment, type PostCategory,
} from '@/services/community'

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES: { id: PostCategory; label: string; color: string }[] = [
  { id: 'all',          label: 'All',          color: '' },
  { id: 'General',      label: 'General',      color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  { id: 'Kenya Stocks',   label: 'Kenya Stocks',   color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  { id: 'Global Stocks',label: 'Global',       color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  { id: 'MMF',          label: 'MMF',          color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  { id: 'Question',     label: 'Question',     color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  { id: 'Win',          label: 'Win 🎉',        color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
]

function categoryColor(cat: string) {
  if (cat === 'NSE Stocks') {
    return CATEGORIES.find((c) => c.id === 'Kenya Stocks')?.color ?? ''
  }
  return CATEGORIES.find((c) => c.id === cat)?.color ?? ''
}

// ─── Avatar helper ────────────────────────────────────────────────────────────

function MemberAvatar({ initials, size = 'md' }: { initials: string; size?: 'sm' | 'md' }) {
  return (
    <Avatar className={size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'}>
      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}

// ─── Comment item ──────────────────────────────────────────────────────────────

interface CommentItemProps {
  comment: CommunityComment
  isAuthenticated: boolean
  onLike: (id: string) => void
  onDelete: (id: string) => void
  onReply: (id: string) => void
  replyingTo: string | null
}

function CommentItem({ comment, isAuthenticated, onLike, onDelete, onReply, replyingTo }: CommentItemProps) {
  const isReplying = replyingTo === comment.id

  return (
    <div className={cn('flex gap-3', comment.parentCommentId && 'ml-8 mt-1')}>
      {comment.parentCommentId && (
        <CornerDownRight className="mt-2 h-3 w-3 shrink-0 text-muted-foreground" />
      )}
      <MemberAvatar initials={comment.authorInitials} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{comment.authorName}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatDateRelative(comment.commentedAt)}
            </span>
          </div>
          <p className="mt-1 text-sm whitespace-pre-wrap">{comment.content}</p>
        </div>
        <div className="mt-1 flex items-center gap-3 px-1">
          <button
            onClick={() => isAuthenticated && onLike(comment.id)}
            className={cn(
              'flex items-center gap-1 text-xs transition-colors',
              comment.isLiked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500',
              !isAuthenticated && 'cursor-default',
            )}
          >
            <Heart className={cn('h-3 w-3', comment.isLiked && 'fill-current')} />
            {comment.likesCount > 0 && <span>{comment.likesCount}</span>}
          </button>
          {isAuthenticated && (
            <button
              onClick={() => onReply(comment.id)}
              className={cn(
                'text-xs transition-colors',
                isReplying ? 'text-primary font-medium' : 'text-muted-foreground hover:text-primary',
              )}
            >
              {isReplying ? 'Cancel' : 'Reply'}
            </button>
          )}
          {comment.isOwn && (
            <button
              onClick={() => onDelete(comment.id)}
              className="ml-auto text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Post card ─────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: CommunityPost
  isAuthenticated: boolean
  onLike: (id: string) => void
  onDelete: (id: string) => void
  onOpenComments: (id: string) => void
  onCommentCountChange: (postId: string, delta: number) => void
  expanded: boolean
}

function PostCard({ post, isAuthenticated, onLike, onDelete, onOpenComments, onCommentCountChange, expanded }: PostCardProps) {
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (expanded && comments.length === 0) {
      setLoadingComments(true)
      import('@/services/community').then(({ getPost }) =>
        getPost(post.id).then((detail) => {
          if (detail) setComments(detail.comments)
        }).finally(() => setLoadingComments(false))
      )
    }
  }, [expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddComment = async () => {
    if (!commentText.trim()) return
    setIsSubmitting(true)
    try {
      const newComment = await addComment(post.id, commentText.trim(), replyingTo ?? undefined)
      setComments((prev) => [...prev, newComment])
      setCommentText('')
      setReplyingTo(null)
      onCommentCountChange(post.id, +1)
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLikeComment = async (commentId: string) => {
    try {
      const result = await toggleLike(undefined, commentId)
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, isLiked: result.liked, likesCount: result.count }
            : c
        )
      )
    } catch { /* ignore */ }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return
    try {
      await deleteComment(commentId)
      setComments((prev) => prev.filter((c) => c.id !== commentId))
      onCommentCountChange(post.id, -1)
    } catch { /* ignore */ }
  }

  return (
    <Card className={cn(
      'transition-shadow hover:shadow-md',
      post.isPinned && 'border-primary/30 bg-primary/5',
    )}>
      <CardContent className="p-4 sm:p-5">
        {/* Author row */}
        <div className="flex items-start gap-3">
          <MemberAvatar initials={post.authorInitials} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{post.authorName}</span>
              {post.isPinned && (
                <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  <Pin className="h-3 w-3" /> Pinned
                </span>
              )}
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', categoryColor(post.category))}>
                {post.category}
              </span>
              <span className="ml-auto text-xs text-muted-foreground shrink-0">
                {formatDateRelative(post.publishedAt)}
              </span>
            </div>

            {/* Content */}
            <p className="mt-2 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {post.content}
            </p>

            {/* Tags */}
            {post.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {post.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs font-normal">
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="mt-3 flex items-center gap-4">
              <button
                onClick={() => isAuthenticated && onLike(post.id)}
                className={cn(
                  'flex items-center gap-1.5 text-sm transition-colors',
                  post.isLiked ? 'text-red-500' : 'text-muted-foreground hover:text-red-500',
                  !isAuthenticated && 'cursor-default',
                )}
              >
                <Heart className={cn('h-4 w-4', post.isLiked && 'fill-current')} />
                <span>{post.likesCount}</span>
              </button>

              <button
                onClick={() => onOpenComments(post.id)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                <span>{post.commentsCount}</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
              </button>

              {post.isOwn && (
                <button
                  onClick={() => onDelete(post.id)}
                  className="ml-auto text-sm text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Comments section */}
        {expanded && (
          <div className="mt-4 space-y-3 border-t pt-4">
            {loadingComments ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <Skeleton className="h-14 flex-1 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : comments.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-2">
                No comments yet. Be the first!
              </p>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    isAuthenticated={isAuthenticated}
                    onLike={handleLikeComment}
                    onDelete={handleDeleteComment}
                    onReply={(id) => setReplyingTo(replyingTo === id ? null : id)}
                    replyingTo={replyingTo}
                  />
                ))}
              </div>
            )}

            {/* Comment input */}
            {isAuthenticated && (
              <div className="flex gap-2 mt-2">
                {replyingTo && (
                  <div className="w-8 shrink-0" />
                )}
                <Textarea
                  placeholder={replyingTo ? 'Write a reply…' : 'Write a comment…'}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="min-h-[60px] resize-none text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment()
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || isSubmitting}
                  className="shrink-0 self-end"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main view ─────────────────────────────────────────────────────────────────

export function CommunityView() {
  const { isAuthenticated } = useAuth()

  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [activeCategory, setActiveCategory] = useState<PostCategory>('all')
  const [expandedPost, setExpandedPost] = useState<string | null>(null)

  // New post form
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState('General')
  const [newTags, setNewTags] = useState('')
  const [isPosting, setIsPosting] = useState(false)
  const [postError, setPostError] = useState('')

  const PAGE_SIZE = 15

  const load = useCallback(async (cat: PostCategory, reset = true) => {
    if (reset) setIsLoading(true)
    else setIsLoadingMore(true)

    const offset = reset ? 0 : posts.length
    try {
      const fetched = await getPosts(cat === 'all' ? undefined : cat, PAGE_SIZE, offset)
      if (reset) {
        setPosts(fetched)
      } else {
        setPosts((prev) => [...prev, ...fetched])
      }
      setHasMore(fetched.length === PAGE_SIZE)
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [posts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load(activeCategory, true)
  }, [activeCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePost = async () => {
    if (!newContent.trim()) return
    setPostError('')
    setIsPosting(true)
    try {
      const created = await createPost(newContent.trim(), newCategory, newTags.trim())
      setPosts((prev) => [created, ...prev])
      setNewContent('')
      setNewTags('')
      setNewCategory('General')
    } catch (err) {
      setPostError(err instanceof Error ? err.message : 'Failed to post.')
    } finally {
      setIsPosting(false)
    }
  }

  const handleLikePost = async (postId: string) => {
    if (!isAuthenticated) return
    try {
      const result = await toggleLike(postId)
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isLiked: result.liked, likesCount: result.count } : p
        )
      )
    } catch { /* ignore */ }
  }

  const handleDeletePost = async (postId: string) => {
    if (!confirm('Delete this post and all its comments?')) return
    try {
      await deletePost(postId)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
    } catch { /* ignore */ }
  }

  const handleToggleComments = (postId: string) => {
    setExpandedPost((prev) => (prev === postId ? null : postId))
  }

  const handleCommentCountChange = (postId: string, delta: number) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, commentsCount: Math.max(0, p.commentsCount + delta) }
          : p
      )
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Community</h1>
          <p className="text-muted-foreground">Connect with fellow Kenyan investors</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => load(activeCategory, true)}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* New post */}
      {isAuthenticated ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Textarea
              placeholder="Share your investment thoughts, questions, or wins…"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="min-h-[80px] resize-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="text"
                placeholder="Tags (comma-separated)"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                className="h-8 flex-1 min-w-24 rounded-md border bg-background px-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Button
                size="sm"
                onClick={handlePost}
                disabled={!newContent.trim() || isPosting}
                className="gap-2"
              >
                {isPosting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Send className="h-4 w-4" />}
                Post
              </Button>
            </div>
            {postError && (
              <p className="text-xs text-destructive">{postError}</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-4 text-center text-sm text-muted-foreground">
            <a href="#" className="text-primary underline underline-offset-2">Sign in</a> to post and join the discussion.
          </CardContent>
        </Card>
      )}

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.id}
            variant={activeCategory === cat.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory(cat.id)}
            className="shrink-0 h-8 text-xs"
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Community guidelines */}
      <p className="rounded-lg border border-border/50 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <strong className="text-foreground">Guidelines:</strong> Be respectful, share constructive insights. This is not financial advice — always do your own research.
      </p>

      {/* Feed */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-3">
                <div className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="py-16 text-center">
          <MessageCircle className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">No posts yet</p>
          <p className="text-sm text-muted-foreground">Be the first to start a discussion!</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isAuthenticated={isAuthenticated}
                onLike={handleLikePost}
                onDelete={handleDeletePost}
                onOpenComments={handleToggleComments}
                onCommentCountChange={handleCommentCountChange}
                expanded={expandedPost === post.id}
              />
            ))}
          </div>

          {hasMore && (
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => load(activeCategory, false)}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading…</>
                ) : 'Load More'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
