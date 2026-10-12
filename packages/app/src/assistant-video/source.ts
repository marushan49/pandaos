const videoTypes: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function videoMimeType(source: string): string | null {
  const value = source.trim();
  if (/^data:video\/(mp4|webm|quicktime);base64,/i.test(value)) {
    return value.slice(5, value.indexOf(";")).toLowerCase();
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^(https?:|file:|[a-z]:[\\/])/i.test(value)) {
    return null;
  }
  const extension = /\.([a-z\d]+)$/i.exec(value.split(/[?#]/)[0] || "")?.[1]?.toLowerCase();
  return extension ? videoTypes[extension] || null : null;
}
