import { Readable } from "node:stream";
import { parse } from "./parse.js";
import { stringify, stringifyLines } from "./stringify.js";
import type { PathSegment } from "./path-matcher.js";

/**
 * Parse a complete JSON string and collect matching values (non-streaming, convenience).
 */
export async function parseString(
  json: string,
  path: string | PathSegment[] = "*"
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const results: unknown[] = [];
    const stream = parse(path);
    stream.on("data", v => results.push(v));
    stream.on("end", () => resolve(results));
    stream.on("error", reject);
    stream.end(json);
  });
}

/**
 * Stringify an array of values to a JSON array string (non-streaming, convenience).
 */
export async function stringifyArray(
  values: unknown[],
  open = "[\n",
  sep = "\n,\n",
  close = "\n]\n"
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const stream = stringify(open, sep, close);
    stream.on("data", (c: Buffer | string) => chunks.push(typeof c === "string" ? c : c.toString("utf8")));
    stream.on("end", () => resolve(chunks.join("")));
    stream.on("error", reject);
    Readable.from(values).pipe(stream);
  });
}

export { parse, stringify, stringifyLines };
export type { PathSegment };
