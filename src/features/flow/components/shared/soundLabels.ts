export function buildFrame53SoundLabel(path: string) {
  const fileName = path.split("/").pop() ?? path;
  return fileName.replace(/\.mp3$|\.wav$/i, "");
}
