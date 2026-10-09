/** Small JPEG preview for the gallery grid (originals stay untouched). Null if the browser can't decode it. */
export async function makeThumb(file: File, max = 640): Promise<Blob | null> {
  if (!file.type.startsWith('image/')) return null
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
  } catch {
    return null
  }
}

export const extOf = (file: File) => {
  const fromName = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
  return fromName || file.type.split('/')[1] || 'bin'
}

/** Save a blob or URL to the device. */
export function saveAs(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
