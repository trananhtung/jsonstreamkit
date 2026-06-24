/**
 * JSONStream-compatible path matching.
 *
 * A path is a dot-separated string: "rows.*", "data.items.0", etc.
 * Segments:
 *   - string  → exact key match
 *   - "*"     → match any key or index
 *   - true    → emit the entire current value and continue (JSONStream semantics: true = whole doc)
 *   - number  → match that array index
 *
 * Returns [emitValue, recurse] where:
 *   emitValue: emit the value at this depth
 *   recurse:   continue deeper into the value
 */
export type PathSegment = string | number | true;

export function parsePath(path: string | PathSegment[]): PathSegment[] {
  if (Array.isArray(path)) return path;
  if (path === "" || path === null || path === undefined) return [];
  return path.split(".").map(s => {
    if (s === "*") return "*";
    if (s === "true") return true;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? s : n;
  });
}

export class PathMatcher {
  private _segments: PathSegment[];

  constructor(path: string | PathSegment[]) {
    this._segments = parsePath(path);
  }

  /** Check if the current path stack matches up to depth `depth`. */
  matches(stack: Array<string | number>, depth: number): boolean {
    if (depth > this._segments.length) return false;
    for (let i = 0; i < depth; i++) {
      const seg = this._segments[i];
      if (seg === true || seg === "*") continue;
      if (seg !== stack[i]) return false;
    }
    return true;
  }

  /** Returns true if the current stack matches the full path → emit value. */
  isEmit(stack: Array<string | number>): boolean {
    if (stack.length !== this._segments.length) return false;
    return this.matches(stack, this._segments.length);
  }

  get depth(): number { return this._segments.length; }
}
