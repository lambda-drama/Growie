'use client'

import { useEffect, useState } from 'react'
import { Play, Clock, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDateRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/auth-provider'
import { useAppStore } from '@/lib/store'
import { getVideos, type VideoRecord } from '@/services/videos'

type VideoCategory = 'all' | 'education' | 'analysis' | 'interview'

const categories: { id: VideoCategory; label: string }[] = [
  { id: 'all', label: 'All Videos' },
  { id: 'education', label: 'Education' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'interview', label: 'Interviews' },
]

function normalizeCategory(raw: string): Exclude<VideoCategory, 'all'> {
  const c = (raw || '').trim().toLowerCase()
  if (c.startsWith('educ')) return 'education'
  if (c.startsWith('analys')) return 'analysis'
  if (c.startsWith('interview')) return 'interview'
  return 'education'
}

function categoryLabel(raw: string): string {
  const normalized = normalizeCategory(raw)
  const hit = categories.find((c) => c.id === normalized)
  return hit?.label ?? 'Education'
}

function getYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    // https://www.youtube.com/watch?v=ID
    const v = u.searchParams.get('v')
    if (v) return `https://www.youtube.com/embed/${v}?autoplay=1`
    // https://youtu.be/ID
    if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed${u.pathname}?autoplay=1`
  } catch {
    // not a valid URL
  }
  return null
}

function VideoPlayer({ video, onClose }: { video: VideoRecord; onClose: () => void }) {
  const embedUrl = getYouTubeEmbedUrl(video.youtubeUrl)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-4xl">
        <Button
          size="icon"
          variant="secondary"
          className="absolute right-3 top-3 z-20 h-10 w-10 rounded-full border border-white/35 bg-black/70 text-white shadow-lg backdrop-blur hover:bg-black/80 hover:text-white"
          onClick={onClose}
          aria-label="Close video"
        >
          <X className="h-6 w-6" />
        </Button>

        <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : video.videoUrl ? (
            <video
              src={video.videoUrl}
              controls
              autoPlay
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-white">
              No video source available
            </div>
          )}
        </div>

        <div className="mt-3 text-white">
          <h2 className="text-lg font-semibold">{video.title}</h2>
          {video.description && (
            <p
              className="mt-1 text-sm text-white/70 line-clamp-2"
              dangerouslySetInnerHTML={{ __html: video.description }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function VideoThumbnail({ video, featured = false }: { video: VideoRecord; featured?: boolean }) {
  const hasYoutube = !!video.youtubeUrl
  const youtubeId = hasYoutube ? (() => {
    try {
      const u = new URL(video.youtubeUrl)
      return u.searchParams.get('v') ?? u.pathname.slice(1)
    } catch { return null }
  })() : null

  const thumbnailUrl = youtubeId
    ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
    : null

  return (
    <div className={cn('relative w-full overflow-hidden bg-muted', featured ? 'aspect-video' : 'aspect-video')}>
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={video.title}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-4 text-center">
          <span className={cn('text-muted-foreground', featured ? '' : 'line-clamp-2 text-sm')}>
            {video.title}
          </span>
        </div>
      )}
    </div>
  )
}

export function VideosView() {
  const { isAuthenticated } = useAuth()
  const { setAuthModal } = useAppStore()
  const [activeCategory, setActiveCategory] = useState<VideoCategory>('all')
  const [videos, setVideos] = useState<VideoRecord[]>([])
  const [playing, setPlaying] = useState<VideoRecord | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    getVideos().then(setVideos).catch(() => setVideos([]))
  }, [isAuthenticated])

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Videos</h1>
          <p className="text-muted-foreground">Educational content and market analysis</p>
        </div>
        <div className="rounded-lg border-2 border-dashed border-muted p-12 text-center">
          <h3 className="text-lg font-semibold">Sign in to view videos</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Video content is private and available only to signed-in users.
          </p>
          <Button className="mt-4" onClick={() => setAuthModal('login')}>
            Sign In
          </Button>
        </div>
      </div>
    )
  }

  const filteredVideos = activeCategory === 'all'
    ? videos
    : videos.filter((v) => normalizeCategory(v.category) === activeCategory)

  const [featured, ...rest] = filteredVideos

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {playing && (
        <VideoPlayer video={playing} onClose={() => setPlaying(null)} />
      )}

      <div>
        <h1 className="text-2xl font-bold text-foreground">Videos</h1>
        <p className="text-muted-foreground">Educational content and market analysis</p>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant={activeCategory === cat.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory(cat.id)}
            className={cn('shrink-0', activeCategory === cat.id && 'bg-primary text-primary-foreground')}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Featured Video */}
      {featured && (
        <Card className="overflow-hidden">
          <div className="relative cursor-pointer" onClick={() => setPlaying(featured)}>
            <VideoThumbnail video={featured} featured />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/40">
              <Button size="lg" className="h-16 w-16 rounded-full pointer-events-none">
                <Play className="h-8 w-8 fill-current" />
                <span className="sr-only">Play video</span>
              </Button>
            </div>
          </div>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded bg-primary/10 px-2 py-0.5 font-medium capitalize text-primary">
                {categoryLabel(featured.category)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDateRelative(featured.publishedAt)}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-bold">{featured.title}</h2>
            {featured.description && (
              <p
                className="mt-2 text-muted-foreground line-clamp-3"
                dangerouslySetInnerHTML={{ __html: featured.description }}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Video Grid */}
      {rest.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((video) => (
            <Card
              key={video.id}
              className="overflow-hidden cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => setPlaying(video)}
            >
              <div className="relative">
                <VideoThumbnail video={video} />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity hover:opacity-100">
                  <Button size="icon" className="h-12 w-12 rounded-full pointer-events-none">
                    <Play className="h-6 w-6 fill-current" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-medium capitalize">
                    {categoryLabel(video.category)}
                  </span>
                  <span>{formatDateRelative(video.publishedAt)}</span>
                </div>
                <h3 className="mt-2 line-clamp-2 font-semibold">{video.title}</h3>
                {video.description && (
                  <p
                    className="mt-1 line-clamp-2 text-sm text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: video.description }}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filteredVideos.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-muted p-12 text-center">
          <p className="text-muted-foreground">No videos found in this category.</p>
        </div>
      )}
    </div>
  )
}