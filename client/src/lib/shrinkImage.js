// Uploads go through Vercel, which rejects request bodies over 4.5 MB, so large
// photos are scaled down in the browser before they are sent.

const MAX_SIDE = 1800
const SKIP_BELOW = 700 * 1024 // small files are sent as they are

/** Total bytes one upload request may carry (headroom under Vercel's 4.5 MB). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

/** Returns a smaller JPEG version of a large JPG/PNG/WebP photo; anything else is returned unchanged. */
export async function shrinkImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= SKIP_BELOW) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff' // transparent PNG areas become white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
