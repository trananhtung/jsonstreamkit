export const enum TK {
  LBrace = 1, RBrace, LBracket, RBracket,
  Colon, Comma,
  String, Number, True, False, Null,
  EOF, Partial
}

export interface Token {
  type: TK;
  value?: string;  // for TK.String, TK.Number — the parsed value
  raw?: string;    // partial raw bytes when type === TK.Partial
}

/**
 * Incremental JSON lexer — tokenizes a chunked byte stream.
 * Feed() returns complete tokens; leftover bytes are kept in the internal buffer.
 */
export class JsonLexer {
  private _buf = "";

  feed(chunk: string): Token[] {
    this._buf += chunk;
    const tokens: Token[] = [];
    let i = 0;

    while (i < this._buf.length) {
      const ch = this._buf[i];

      // skip whitespace
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") { i++; continue; }

      if (ch === "{") { tokens.push({ type: TK.LBrace }); i++; continue; }
      if (ch === "}") { tokens.push({ type: TK.RBrace }); i++; continue; }
      if (ch === "[") { tokens.push({ type: TK.LBracket }); i++; continue; }
      if (ch === "]") { tokens.push({ type: TK.RBracket }); i++; continue; }
      if (ch === ":") { tokens.push({ type: TK.Colon }); i++; continue; }
      if (ch === ",") { tokens.push({ type: TK.Comma }); i++; continue; }

      if (ch === "t") {
        if (this._buf.length - i < 4) break; // need more data
        tokens.push({ type: TK.True }); i += 4; continue;
      }
      if (ch === "f") {
        if (this._buf.length - i < 5) break;
        tokens.push({ type: TK.False }); i += 5; continue;
      }
      if (ch === "n") {
        if (this._buf.length - i < 4) break;
        tokens.push({ type: TK.Null }); i += 4; continue;
      }

      if (ch === '"') {
        // scan for closing quote, handling backslash escapes
        let j = i + 1;
        let complete = false;
        while (j < this._buf.length) {
          if (this._buf[j] === "\\") { j += 2; continue; }
          if (this._buf[j] === '"') { complete = true; j++; break; }
          j++;
        }
        if (!complete) break; // wait for more data
        // Use JSON.parse to handle all escape sequences properly
        const raw = this._buf.slice(i, j);
        tokens.push({ type: TK.String, value: JSON.parse(raw) as string });
        i = j;
        continue;
      }

      if (ch === "-" || (ch >= "0" && ch <= "9")) {
        // scan to end of number (conservative: stop at any non-number char)
        let j = i + 1;
        while (j < this._buf.length) {
          const c = this._buf[j];
          if (c === "+" || c === "-" || c === "." || c === "e" || c === "E" || (c >= "0" && c <= "9")) {
            j++;
          } else {
            break;
          }
        }
        // A number may be incomplete at end of buffer
        if (j === this._buf.length) break; // need more data
        tokens.push({ type: TK.Number, value: this._buf.slice(i, j) });
        i = j;
        continue;
      }

      // unknown character — skip (robustness)
      i++;
    }

    this._buf = this._buf.slice(i);
    return tokens;
  }

  /** Signal end of input — flush any remaining partial number. */
  flush(): Token[] {
    const tokens: Token[] = [];
    const s = this._buf.trim();
    if (s.length > 0 && (s[0] === "-" || (s[0] >= "0" && s[0] <= "9"))) {
      tokens.push({ type: TK.Number, value: s });
    }
    this._buf = "";
    return tokens;
  }
}
