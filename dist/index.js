// src/parse.ts
import { Transform } from "stream";

// src/lexer.ts
var JsonLexer = class {
  _buf = "";
  feed(chunk) {
    this._buf += chunk;
    const tokens = [];
    let i = 0;
    while (i < this._buf.length) {
      const ch = this._buf[i];
      if (ch === " " || ch === "	" || ch === "\r" || ch === "\n") {
        i++;
        continue;
      }
      if (ch === "{") {
        tokens.push({ type: 1 /* LBrace */ });
        i++;
        continue;
      }
      if (ch === "}") {
        tokens.push({ type: 2 /* RBrace */ });
        i++;
        continue;
      }
      if (ch === "[") {
        tokens.push({ type: 3 /* LBracket */ });
        i++;
        continue;
      }
      if (ch === "]") {
        tokens.push({ type: 4 /* RBracket */ });
        i++;
        continue;
      }
      if (ch === ":") {
        tokens.push({ type: 5 /* Colon */ });
        i++;
        continue;
      }
      if (ch === ",") {
        tokens.push({ type: 6 /* Comma */ });
        i++;
        continue;
      }
      if (ch === "t") {
        if (this._buf.length - i < 4) break;
        tokens.push({ type: 9 /* True */ });
        i += 4;
        continue;
      }
      if (ch === "f") {
        if (this._buf.length - i < 5) break;
        tokens.push({ type: 10 /* False */ });
        i += 5;
        continue;
      }
      if (ch === "n") {
        if (this._buf.length - i < 4) break;
        tokens.push({ type: 11 /* Null */ });
        i += 4;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        let complete = false;
        while (j < this._buf.length) {
          if (this._buf[j] === "\\") {
            j += 2;
            continue;
          }
          if (this._buf[j] === '"') {
            complete = true;
            j++;
            break;
          }
          j++;
        }
        if (!complete) break;
        const raw = this._buf.slice(i, j);
        tokens.push({ type: 7 /* String */, value: JSON.parse(raw) });
        i = j;
        continue;
      }
      if (ch === "-" || ch >= "0" && ch <= "9") {
        let j = i + 1;
        while (j < this._buf.length) {
          const c = this._buf[j];
          if (c === "+" || c === "-" || c === "." || c === "e" || c === "E" || c >= "0" && c <= "9") {
            j++;
          } else {
            break;
          }
        }
        if (j === this._buf.length) break;
        tokens.push({ type: 8 /* Number */, value: this._buf.slice(i, j) });
        i = j;
        continue;
      }
      i++;
    }
    this._buf = this._buf.slice(i);
    return tokens;
  }
  /** Signal end of input — flush any remaining partial number. */
  flush() {
    const tokens = [];
    const s = this._buf.trim();
    if (s.length > 0 && (s[0] === "-" || s[0] >= "0" && s[0] <= "9")) {
      tokens.push({ type: 8 /* Number */, value: s });
    }
    this._buf = "";
    return tokens;
  }
};

// src/path-matcher.ts
function parsePath(path) {
  if (Array.isArray(path)) return path;
  if (path === "" || path === null || path === void 0) return [];
  return path.split(".").map((s) => {
    if (s === "*") return "*";
    if (s === "true") return true;
    const n = parseInt(s, 10);
    return Number.isNaN(n) ? s : n;
  });
}
var PathMatcher = class {
  _segments;
  constructor(path) {
    this._segments = parsePath(path);
  }
  /** Check if the current path stack matches up to depth `depth`. */
  matches(stack, depth) {
    if (depth > this._segments.length) return false;
    for (let i = 0; i < depth; i++) {
      const seg = this._segments[i];
      if (seg === true || seg === "*") continue;
      if (seg !== stack[i]) return false;
    }
    return true;
  }
  /** Returns true if the current stack matches the full path → emit value. */
  isEmit(stack) {
    if (stack.length !== this._segments.length) return false;
    return this.matches(stack, this._segments.length);
  }
  get depth() {
    return this._segments.length;
  }
};

// src/parse.ts
var JsonParseStream = class extends Transform {
  _lexer = new JsonLexer();
  _stack = [];
  // path from root to the CURRENT CONTAINER (mirrors _stack by position)
  _keyPath = [];
  _matcher;
  _pendingKey;
  constructor(path) {
    super({ objectMode: true });
    this._matcher = new PathMatcher(path);
  }
  _transform(chunk, _encoding, callback) {
    try {
      const tokens = this._lexer.feed(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      for (const tok of tokens) this._process(tok.type, tok.value);
      callback();
    } catch (e) {
      callback(e);
    }
  }
  _flush(callback) {
    try {
      const tokens = this._lexer.flush();
      for (const tok of tokens) this._process(tok.type, tok.value);
      callback();
    } catch (e) {
      callback(e);
    }
  }
  _process(type, value) {
    switch (type) {
      case 1 /* LBrace */:
        this._openContainer("object");
        break;
      case 3 /* LBracket */:
        this._openContainer("array");
        break;
      case 2 /* RBrace */:
      case 4 /* RBracket */:
        this._closeContainer();
        break;
      case 5 /* Colon */:
        if (this._stack.length > 0 && this._stack[this._stack.length - 1].type === "object") {
          this._stack[this._stack.length - 1].key = this._pendingKey;
          this._pendingKey = void 0;
        }
        break;
      case 6 /* Comma */:
        if (this._stack.length > 0 && this._stack[this._stack.length - 1].type === "array") {
          this._stack[this._stack.length - 1].arrayIndex++;
        }
        break;
      case 7 /* String */: {
        const frame = this._stack.length > 0 ? this._stack[this._stack.length - 1] : null;
        if (frame && frame.type === "object" && frame.key === void 0 && this._pendingKey === void 0) {
          this._pendingKey = value;
        } else {
          this._emitScalar(value);
        }
        break;
      }
      case 8 /* Number */:
        this._emitScalar(parseFloat(value));
        break;
      case 9 /* True */:
        this._emitScalar(true);
        break;
      case 10 /* False */:
        this._emitScalar(false);
        break;
      case 11 /* Null */:
        this._emitScalar(null);
        break;
    }
  }
  _currentKey() {
    if (this._stack.length === 0) return "__root__";
    const frame = this._stack[this._stack.length - 1];
    if (frame.type === "array") return frame.arrayIndex;
    return frame.key ?? "__key__";
  }
  _openContainer(type) {
    const ownKey = this._currentKey();
    this._keyPath.push(ownKey);
    this._stack.push({
      type,
      key: void 0,
      value: type === "object" ? {} : [],
      arrayIndex: 0
    });
  }
  _closeContainer() {
    const frame = this._stack.pop();
    const pathAtClose = [...this._keyPath];
    this._keyPath.pop();
    const completed = frame.value;
    this._maybeEmit(completed, pathAtClose);
    this._assignToParent(completed);
  }
  _emitScalar(val) {
    const ownKey = this._currentKey();
    const fullPath = [...this._keyPath, ownKey];
    this._maybeEmit(val, fullPath);
    this._assignToParent(val);
  }
  _assignToParent(val) {
    if (this._stack.length === 0) return;
    const frame = this._stack[this._stack.length - 1];
    if (frame.type === "object") {
      frame.value[frame.key] = val;
      frame.key = void 0;
    } else {
      frame.value.push(val);
    }
  }
  _maybeEmit(val, keyPath) {
    const path = keyPath[0] === "__root__" ? keyPath.slice(1) : keyPath;
    if (this._matcher.isEmit(path)) {
      if (val !== null) this.push(val);
    }
  }
};
function parse(path = "*") {
  return new JsonParseStream(path);
}

// src/stringify.ts
import { Transform as Transform2 } from "stream";
var JsonStringifyStream = class extends Transform2 {
  _open;
  _sep;
  _close;
  _first = true;
  constructor(open = "[\n", sep = "\n,\n", close = "\n]\n") {
    super({ writableObjectMode: true });
    this._open = open;
    this._sep = sep;
    this._close = close;
  }
  _transform(chunk, _encoding, callback) {
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
      callback(e);
    }
  }
  _flush(callback) {
    if (this._first) {
      this.push(this._open.trimEnd() + this._close.trimStart());
    } else {
      this.push(this._close);
    }
    callback();
  }
};
function stringify(open = "[\n", sep = "\n,\n", close = "\n]\n") {
  return new JsonStringifyStream(open, sep, close);
}
function stringifyLines() {
  return new JsonStringifyStream("", "\n", "\n");
}

// src/helpers.ts
import { Readable } from "stream";
async function parseString(json, path = "*") {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = parse(path);
    stream.on("data", (v) => results.push(v));
    stream.on("end", () => resolve(results));
    stream.on("error", reject);
    stream.end(json);
  });
}
async function stringifyArray(values, open = "[\n", sep = "\n,\n", close = "\n]\n") {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const stream = stringify(open, sep, close);
    stream.on("data", (c) => chunks.push(typeof c === "string" ? c : c.toString("utf8")));
    stream.on("end", () => resolve(chunks.join("")));
    stream.on("error", reject);
    Readable.from(values).pipe(stream);
  });
}
export {
  parse,
  parseString,
  stringify,
  stringifyArray,
  stringifyLines
};
//# sourceMappingURL=index.js.map