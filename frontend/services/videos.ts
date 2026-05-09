export interface VideoRecord {
  id: string
  title: string
  description: string
  category: string
  videoUrl: string
  youtubeUrl: string
  publishedAt: string
}

export async function getVideos(limit = 50): Promise<VideoRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  const response = await fetch(
    `/api/method/growie_app.api.videos.get_videos?${params.toString()}`,
    { credentials: 'include', headers: { Accept: 'application/json' } }
  )
  const data = await response.json()
  return Array.isArray(data?.message) ? (data.message as VideoRecord[]) : []
}