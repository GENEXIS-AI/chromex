type FileLikeTransfer = Pick<DataTransfer, "files" | "items" | "types">;

export function hasComposerDropPayload(dataTransfer: Pick<DataTransfer, "files" | "types"> | null): boolean {
  if (!dataTransfer) {
    return false;
  }
  if (dataTransfer.files.length > 0) {
    return true;
  }
  const types = Array.from(dataTransfer.types ?? []);
  return types.some(
    (type) => type === "Files" || type === "text/html" || type === "text/uri-list" || type === "text/plain",
  );
}

export function getDroppedFiles(dataTransfer: Pick<FileLikeTransfer, "files" | "items"> | null): File[] {
  if (!dataTransfer) {
    return [];
  }
  const files = Array.from(dataTransfer.files ?? []);
  if (files.length > 0) {
    return files;
  }
  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}
