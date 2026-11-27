import path from 'node:path';

/** Whether `file` is `folder`, or inside it. Both are absolute. */
export function isWithin(file: string, folder: string): boolean {
  const relative = path.relative(folder, file);
  return relative === '' || (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative));
}
