import { Transform, TransformCallback } from 'node:stream';

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
type PathSegment = string | number | true;

/**
 * Transform stream that parses JSON and emits matched values as objects.
 * Compatible with the JSONStream.parse() API.
 *
 * Note: null cannot be emitted as an individual stream value (it signals EOF
 * in Node.js object-mode streams). Use parseString() if you need null items.
 */
declare class JsonParseStream extends Transform {
    private _lexer;
    private _stack;
    private _keyPath;
    private _matcher;
    private _pendingKey;
    constructor(path: string | PathSegment[]);
    _transform(chunk: Buffer | string, _encoding: string, callback: TransformCallback): void;
    _flush(callback: TransformCallback): void;
    private _process;
    private _currentKey;
    private _openContainer;
    private _closeContainer;
    private _emitScalar;
    private _assignToParent;
    private _maybeEmit;
}
/**
 * Create a Transform stream that parses incoming JSON chunks and emits
 * matched values as JavaScript objects.
 *
 * @param path Dot-separated path string ("*", "rows.*", "data.items") or
 *             array of path segments. Use an empty string to emit the whole document.
 */
declare function parse(path?: string | PathSegment[]): JsonParseStream;

/**
 * Transform stream that serializes JavaScript objects into a JSON array string.
 * Each object written becomes one JSON element separated by `sep`.
 *
 * Compatible with JSONStream.stringify(open, sep, close).
 */
declare class JsonStringifyStream extends Transform {
    private _open;
    private _sep;
    private _close;
    private _first;
    constructor(open?: string, sep?: string, close?: string);
    _transform(chunk: unknown, _encoding: string, callback: TransformCallback): void;
    _flush(callback: TransformCallback): void;
}
/**
 * Create a Transform stream that serializes objects into a JSON array string.
 *
 * @param open  Opening string (default: `"[\n"`)
 * @param sep   Separator between elements (default: `"\n,\n"`)
 * @param close Closing string (default: `"\n]\n"`)
 */
declare function stringify(open?: string, sep?: string, close?: string): JsonStringifyStream;
/**
 * Create a Transform that emits one JSON object per line (NDJSON / JSON Lines format).
 */
declare function stringifyLines(): JsonStringifyStream;

/**
 * Parse a complete JSON string and collect matching values (non-streaming, convenience).
 */
declare function parseString(json: string, path?: string | PathSegment[]): Promise<unknown[]>;
/**
 * Stringify an array of values to a JSON array string (non-streaming, convenience).
 */
declare function stringifyArray(values: unknown[], open?: string, sep?: string, close?: string): Promise<string>;

export { type PathSegment, parse, parseString, stringify, stringifyArray, stringifyLines };
