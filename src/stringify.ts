import { Transform, type TransformCallback } from "node:stream";

/**
 * Transform stream that serializes JavaScript objects into a JSON array string.
 * Each object written becomes one JSON element separated by `sep`.
 *
 * Compatible with JSONStream.stringify(open, sep, close).
 */
export class JsonStringifyStream extends Transform {
  private _open: string;
  private _sep: string;
  private _close: string;
  private _first = true;

  constructor(open = "[\n", sep = "\n,\n", close = "\n]\n") {
    super({ writableObjectMode: true });
    this._open = open;
    this._sep = sep;
    this._close = close;
  }

  _transform(chunk: unknown, _encoding: string, callback: TransformCallback): void {
    try {
      const json = JSON.stringify(chunk);
      if (this._first) {
        this.push(this._open + json);
        this._first = false;
      } else {
        this.push(this._sep + json);
      }
      callback();
    } catch (e) {
      callback(e as Error);
    }
  }

  _flush(callback: TransformCallback): void {
    if (this._first) {
      // Nothing was written — emit empty container
      this.push(this._open.trimEnd() + this._close.trimStart());
    } else {
      this.push(this._close);
    }
    callback();
  }
}

/**
 * Create a Transform stream that serializes objects into a JSON array string.
 *
 * @param open  Opening string (default: `"[\n"`)
 * @param sep   Separator between elements (default: `"\n,\n"`)
 * @param close Closing string (default: `"\n]\n"`)
 */
export function stringify(open = "[\n", sep = "\n,\n", close = "\n]\n"): JsonStringifyStream {
  return new JsonStringifyStream(open, sep, close);
}

/**
 * Create a Transform that emits one JSON object per line (NDJSON / JSON Lines format).
 */
export function stringifyLines(): JsonStringifyStream {
  return new JsonStringifyStream("", "\n", "\n");
}
