const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/u;
const CONTAINER_PATTERN = /^ {0,3}(:{3,})([^\n]*)$/u;

export interface FenceState {
  marker: string;
  size: number;
}

export interface ContainerOpenInfo {
  info: string;
  type: string;
  title?: string;
  size: number;
}

export function stripLineEnding(line: string): string {
  return line.endsWith('\n') ? line.slice(0, -1) : line;
}

export function getFenceStart(line: string): FenceState | null {
  const match = stripLineEnding(line).match(FENCE_PATTERN);
  const fence = match?.[1];
  if (!fence) {
    return null;
  }

  return {
    marker: fence[0] ?? '`',
    size: fence.length,
  };
}

export function isFenceEnd(line: string, state: FenceState): boolean {
  const trimmed = stripLineEnding(line);
  const pattern = new RegExp(`^ {0,3}${state.marker}{${state.size},}\\s*$`, 'u');
  return pattern.test(trimmed);
}

export function getContainerOpen(line: string): ContainerOpenInfo | null {
  const match = stripLineEnding(line).match(CONTAINER_PATTERN);
  const marker = match?.[1];
  const rawInfo = match?.[2]?.trim();

  if (!marker || !rawInfo) {
    return null;
  }

  const [type, ...titleParts] = rawInfo.split(/\s+/u);
  if (!type) {
    return null;
  }

  const title = titleParts.join(' ').trim() || undefined;
  return {
    info: rawInfo,
    type,
    title,
    size: marker.length,
  };
}

export function isContainerClose(line: string, size: number): boolean {
  const pattern = new RegExp(`^ {0,3}:{${size},}\\s*$`, 'u');
  return pattern.test(stripLineEnding(line));
}
