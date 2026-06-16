/** Triggers a browser download for the given binary/text payload. */
export const downloadBlob = (
  data: BlobPart,
  filename: string,
  mimeType: string,
): void => {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
