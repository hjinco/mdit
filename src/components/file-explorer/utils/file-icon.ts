const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.svg',
  '.webp',
  '.bmp',
  '.ico',
] as const

export function isImageFile(extension: string): boolean {
  if (!extension) {
    return false
  }
  return IMAGE_EXTENSIONS.includes(
    extension.toLowerCase() as (typeof IMAGE_EXTENSIONS)[number]
  )
}
