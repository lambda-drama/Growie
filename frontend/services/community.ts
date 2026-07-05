// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommunityPost {
  id: string
  authorId: string
  authorName: string
  authorInitials: string
  category: string
  content: string
  tags: string[]
  isPinned: boolean
  likesCount: number
  commentsCount: number
  publishedAt: string
  isLiked: boolean
  isOwn: boolean
}

export interface CommunityComment {
  id: string
  postId: string
  authorId: string
  authorName: string
  authorInitials: string
  content: string
  parentCommentId: string | null
  likesCount: number
  commentedAt: string
  isLiked: boolean
  isOwn: boolean
}

export interface PostDetail {
  post: CommunityPost
  comments: CommunityComment[]
}

export type PostCategory = 'all' | 'General' | 'Kenya Stocks' | 'Global Stocks' | 'MMF' | 'Question' | 'Win'

export interface ToggleLikeResult {
  liked: boolean
  count: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCSRF(): string {
  return (window as unknown as Record<string, string>).csrf_token ?? ''
}

function postHeaders(): HeadersInit {
  const csrf = getCSRF()
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(csrf ? { 'X-Frappe-CSRF-Token': csrf } : {}),
  }
}

function extractError(resData: Record<string, unknown>): string {
  if (resData?.exc && typeof resData.exc === 'string') {
    const lines = resData.exc.trim().split('\n').filter(Boolean)
    return lines[lines.length - 1] ?? 'Unknown error'
  }
  return 'Request failed'
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function getPosts(
  category?: string,
  limit: number = 20,
  offset: number = 0
): Promise<CommunityPost[]> {
  const params = new URLSearchParams()
  if (category && category !== 'all') params.append('category', category)
  params.append('limit', limit.toString())
  params.append('offset', offset.toString())

  const response = await fetch(
    `/api/method/growie_app.api.community.get_posts?${params.toString()}`,
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  console.log('getPosts response:', resData)

  if (resData?.message && Array.isArray(resData.message)) {
    return resData.message as CommunityPost[]
  }
  return []
}

export async function getPost(postId: string): Promise<PostDetail | null> {
  const response = await fetch(
    `/api/method/growie_app.api.community.get_post?post_id=${encodeURIComponent(postId)}`,
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const resData = await response.json()
  console.log('getPost response:', resData)

  if (resData?.message) return resData.message as PostDetail
  return null
}

export async function createPost(
  content: string,
  category: string = 'General',
  tags: string = ''
): Promise<CommunityPost> {
  const response = await fetch(
    '/api/method/growie_app.api.community.create_post',
    {
      method: 'POST',
      credentials: 'include',
      headers: postHeaders(),
      body: JSON.stringify({ content, category, tags }),
    }
  )
  const resData = await response.json()
  console.log('createPost response:', resData)

  if (resData?.message) return resData.message as CommunityPost
  throw new Error(extractError(resData))
}

export async function deletePost(postId: string): Promise<void> {
  const response = await fetch(
    '/api/method/growie_app.api.community.delete_post',
    {
      method: 'POST',
      credentials: 'include',
      headers: postHeaders(),
      body: JSON.stringify({ post_id: postId }),
    }
  )
  const resData = await response.json()
  if (resData?.exc) throw new Error(extractError(resData))
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export async function addComment(
  postId: string,
  content: string,
  parentCommentId?: string
): Promise<CommunityComment> {
  const response = await fetch(
    '/api/method/growie_app.api.community.add_comment',
    {
      method: 'POST',
      credentials: 'include',
      headers: postHeaders(),
      body: JSON.stringify({
        post_id: postId,
        content,
        parent_comment_id: parentCommentId ?? null,
      }),
    }
  )
  const resData = await response.json()
  console.log('addComment response:', resData)

  if (resData?.message) return resData.message as CommunityComment
  throw new Error(extractError(resData))
}

export async function deleteComment(commentId: string): Promise<void> {
  const response = await fetch(
    '/api/method/growie_app.api.community.delete_comment',
    {
      method: 'POST',
      credentials: 'include',
      headers: postHeaders(),
      body: JSON.stringify({ comment_id: commentId }),
    }
  )
  const resData = await response.json()
  if (resData?.exc) throw new Error(extractError(resData))
}

// ─── Likes ────────────────────────────────────────────────────────────────────

export async function toggleLike(
  postId?: string,
  commentId?: string
): Promise<ToggleLikeResult> {
  const response = await fetch(
    '/api/method/growie_app.api.community.toggle_like',
    {
      method: 'POST',
      credentials: 'include',
      headers: postHeaders(),
      body: JSON.stringify({
        post_id: postId ?? null,
        comment_id: commentId ?? null,
      }),
    }
  )
  const resData = await response.json()
  console.log('toggleLike response:', resData)

  if (resData?.message) return resData.message as ToggleLikeResult
  throw new Error(extractError(resData))
}
