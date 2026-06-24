import { Transform, type TransformCallback } from "node:stream";
import { JsonLexer, TK } from "./lexer.js";
import type { PathSegment } from "./path-matcher.js";
import { PathMatcher } from "./path-matcher.js";

type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };

interface Frame {
  type: "object" | "array";
  key: string | undefined;   // for objects: current key (set after ':')
  value: JSONValue;
  arrayIndex: number;
}

/**
 * Transform stream that parses JSON and emits matched values as objects.
 * Compatible with the JSONStream.parse() API.
 *
 * Note: null cannot be emitted as an individual stream value (it signals EOF
 * in Node.js object-mode streams). Use parseString() if you need null items.
 */
export class JsonParseStream extends Transform {
  private _lexer = new JsonLexer();
  private _stack: Frame[] = [];
  // path from root to the CURRENT CONTAINER (mirrors _stack by position)
  private _keyPath: Array<string | number> = [];
  private _matcher: PathMatcher;
  private _pendingKey: string | undefined;

  constructor(path: string | PathSegment[]) {
    super({ objectMode: true });
    this._matcher = new PathMatcher(path);
  }

  _transform(chunk: Buffer | string, _encoding: string, callback: TransformCallback): void {
    try {
      const tokens = this._lexer.feed(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      for (const tok of tokens) this._process(tok.type, tok.value);
      callback();
    } catch (e) {
      callback(e as Error);
    }
  }

  _flush(callback: TransformCallback): void {
    try {
      const tokens = this._lexer.flush();
      for (const tok of tokens) this._process(tok.type, tok.value);
      callback();
    } catch (e) {
      callback(e as Error);
    }
  }

  private _process(type: TK, value?: string): void {
    switch (type) {
      case TK.LBrace:    this._openContainer("object"); break;
      case TK.LBracket:  this._openContainer("array");  break;
      case TK.RBrace:
      case TK.RBracket:  this._closeContainer();          break;
      case TK.Colon:
        // Assign the pending string as the current object key
        if (this._stack.length > 0 && this._stack[this._stack.length - 1].type === "object") {
          this._stack[this._stack.length - 1].key = this._pendingKey!;
          this._pendingKey = undefined;
        }
        break;
      case TK.Comma:
        // Advance array index counter
        if (this._stack.length > 0 && this._stack[this._stack.length - 1].type === "array") {
          this._stack[this._stack.length - 1].arrayIndex++;
        }
        break;
      case TK.String: {
        // In an object context, the first string before ':' is a key
        const frame = this._stack.length > 0 ? this._stack[this._stack.length - 1] : null;
        if (frame && frame.type === "object" && frame.key === undefined && this._pendingKey === undefined) {
          this._pendingKey = value!;
        } else {
          this._emitScalar(value!);
        }
        break;
      }
      case TK.Number: this._emitScalar(parseFloat(value!)); break;
      case TK.True:   this._emitScalar(true);   break;
      case TK.False:  this._emitScalar(false);  break;
      case TK.Null:   this._emitScalar(null);   break;
    }
  }

  private _currentKey(): string | number {
    if (this._stack.length === 0) return "__root__";
    const frame = this._stack[this._stack.length - 1];
    if (frame.type === "array") return frame.arrayIndex;
    return frame.key ?? "__key__";
  }

  private _openContainer(type: "object" | "array"): void {
    // The key/index of this new container within its parent
    const ownKey = this._currentKey();
    this._keyPath.push(ownKey);

    this._stack.push({
      type,
      key: undefined,
      value: type === "object" ? {} : [],
      arrayIndex: 0,
    });
  }

  private _closeContainer(): void {
    const frame = this._stack.pop()!;
    // Capture the path to this container BEFORE popping (includes its own key)
    const pathAtClose = [...this._keyPath];
    this._keyPath.pop();

    const completed = frame.value;
    this._maybeEmit(completed, pathAtClose);
    this._assignToParent(completed);
  }

  private _emitScalar(val: JSONValue): void {
    // Build the full path including this value's position
    const ownKey = this._currentKey();
    const fullPath = [...this._keyPath, ownKey];
    this._maybeEmit(val, fullPath);
    this._assignToParent(val);
  }

  private _assignToParent(val: JSONValue): void {
    if (this._stack.length === 0) return; // root value
    const frame = this._stack[this._stack.length - 1];
    if (frame.type === "object") {
      (frame.value as Record<string, JSONValue>)[frame.key as string] = val;
      frame.key = undefined;
    } else {
      (frame.value as JSONValue[]).push(val);
    }
  }

  private _maybeEmit(val: JSONValue, keyPath: Array<string | number>): void {
    // Strip the __root__ sentinel
    const path = keyPath[0] === "__root__" ? keyPath.slice(1) : keyPath;
    if (this._matcher.isEmit(path)) {
      // null cannot be pushed to object-mode streams (signals EOF); skip
      if (val !== null) this.push(val);
    }
  }
}

/**
 * Create a Transform stream that parses incoming JSON chunks and emits
 * matched values as JavaScript objects.
 *
 * @param path Dot-separated path string ("*", "rows.*", "data.items") or
 *             array of path segments. Use an empty string to emit the whole document.
 */
export function parse(path: string | PathSegment[] = "*"): JsonParseStream {
  return new JsonParseStream(path);
}
