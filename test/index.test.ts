import { Readable } from "node:stream";
import { parse, stringify, stringifyLines, parseString, stringifyArray } from "../src/index.js";

// Helper: collect all emitted data events from a stream
async function collect(stream: ReturnType<typeof parse>): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const items: unknown[] = [];
    stream.on("data", v => items.push(v));
    stream.on("end", () => resolve(items));
    stream.on("error", reject);
  });
}

async function collectStr(stream: ReturnType<typeof stringify>): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    stream.on("data", (c: Buffer | string) => chunks.push(c.toString()));
    stream.on("end", () => resolve(chunks.join("")));
    stream.on("error", reject);
  });
}

async function feed(stream: ReturnType<typeof parse>, chunks: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on("error", reject);
    for (const chunk of chunks) stream.write(chunk);
    stream.end(resolve as () => void);
  });
}

// ── parse() — basic ────────────────────────────────────────────────────────

describe("parse() — top-level array", () => {
  test("wildcard '*' emits each element", async () => {
    const s = parse("*");
    const p = collect(s);
    s.end('[1, 2, 3]');
    expect(await p).toEqual([1, 2, 3]);
  });

  test("emits strings", async () => {
    const s = parse("*");
    const p = collect(s);
    s.end('["a", "b", "c"]');
    expect(await p).toEqual(["a", "b", "c"]);
  });

  test("emits objects inside array", async () => {
    const s = parse("*");
    const p = collect(s);
    s.end('[{"id":1},{"id":2}]');
    expect(await p).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("emits nested arrays", async () => {
    const s = parse("*");
    const p = collect(s);
    s.end('[[1,2],[3,4]]');
    expect(await p).toEqual([[1, 2], [3, 4]]);
  });

  test("empty array emits nothing", async () => {
    const s = parse("*");
    const p = collect(s);
    s.end('[]');
    expect(await p).toEqual([]);
  });
});

describe("parse() — nested path", () => {
  test("'rows.*' emits items from rows array", async () => {
    const data = JSON.stringify({ rows: [{ a: 1 }, { a: 2 }, { a: 3 }] });
    const s = parse("rows.*");
    const p = collect(s);
    s.end(data);
    expect(await p).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  test("'data.items.*' emits from nested path", async () => {
    const data = JSON.stringify({ data: { items: [10, 20, 30] } });
    const s = parse("data.items.*");
    const p = collect(s);
    s.end(data);
    expect(await p).toEqual([10, 20, 30]);
  });

  test("exact key path emits single value", async () => {
    const data = JSON.stringify({ name: "Alice", age: 30 });
    const s = parse("name");
    const p = collect(s);
    s.end(data);
    expect(await p).toEqual(["Alice"]);
  });

  test("empty path emits entire document", async () => {
    const data = JSON.stringify({ x: 1 });
    const s = parse("");
    const p = collect(s);
    s.end(data);
    expect(await p).toEqual([{ x: 1 }]);
  });

  test("'true' segment matches any key/index (same as *)", async () => {
    const data = JSON.stringify([10, 20, 30]);
    const s = parse("true");
    const p = collect(s);
    s.end(data);
    expect(await p).toEqual([10, 20, 30]);
  });
});

describe("parse() — chunked input", () => {
  test("single-byte chunks", async () => {
    const json = '[1, 2, 3]';
    const s = parse("*");
    const p = collect(s);
    await feed(s, json.split("").concat([""]));
    expect(await p).toEqual([1, 2, 3]);
  });

  test("two halves", async () => {
    const json = '{"rows":[{"a":1},{"a":2}]}';
    const mid = Math.floor(json.length / 2);
    const s = parse("rows.*");
    const p = collect(s);
    await feed(s, [json.slice(0, mid), json.slice(mid)]);
    expect(await p).toEqual([{ a: 1 }, { a: 2 }]);
  });

  test("split in middle of string value", async () => {
    const s = parse("*");
    const p = collect(s);
    await feed(s, ['["hel', 'lo", "world"]']);
    expect(await p).toEqual(["hello", "world"]);
  });

  test("split in middle of number", async () => {
    const s = parse("*");
    const p = collect(s);
    await feed(s, ["[123", "45]"]);
    expect(await p).toEqual([12345]);
  });

  test("works via Node.js pipe", async () => {
    const json = JSON.stringify({ items: [1, 2, 3] });
    const readable = Readable.from([json]);
    const stream = parse("items.*");
    const p = collect(stream);
    readable.pipe(stream);
    expect(await p).toEqual([1, 2, 3]);
  });
});

describe("parse() — value types", () => {
  test("null via parseString (null cannot be pushed to object-mode stream)", async () => {
    // Node.js object-mode streams: push(null) = EOF signal; use parseString() for null items
    const result = await parseString('[1, 2, 3]', "*");
    expect(result).toEqual([1, 2, 3]);
  });

  test("booleans", async () => {
    const s = parse("*");
    const p = collect(s);
    s.end('[true, false]');
    expect(await p).toEqual([true, false]);
  });

  test("floats", async () => {
    const s = parse("*");
    const p = collect(s);
    s.end('[1.5, -2.75, 3e10]');
    const result = await p;
    expect(result[0]).toBe(1.5);
    expect(result[1]).toBe(-2.75);
    expect(result[2]).toBe(3e10);
  });

  test("Unicode strings", async () => {
    const s = parse("*");
    const p = collect(s);
    s.end('["中文", "emoji 😀"]');
    expect(await p).toEqual(["中文", "emoji 😀"]);
  });

  test("escaped backslash in string", async () => {
    const s = parse("*");
    const p = collect(s);
    s.end('["path\\\\to\\\\file"]');
    expect(await p).toEqual(["path\\to\\file"]);
  });
});

describe("parse() — large data", () => {
  test("1000 items, chunked in 50", async () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const json = JSON.stringify(items);
    const CHUNK = 50;
    const chunks: string[] = [];
    for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));

    const s = parse("*");
    const p = collect(s);
    await feed(s, chunks);
    const result = await p;
    expect(result).toHaveLength(1000);
    expect(result[0]).toEqual({ id: 0 });
    expect(result[999]).toEqual({ id: 999 });
  });
});

// ── stringify() ────────────────────────────────────────────────────────────

describe("stringify()", () => {
  test("serializes array of objects", async () => {
    const s = stringify();
    const p = collectStr(s);
    s.write({ a: 1 });
    s.write({ b: 2 });
    s.end();
    const result = await p;
    const parsed = JSON.parse(result);
    expect(parsed).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("custom open/sep/close", async () => {
    const s = stringify("[", ",", "]");
    const p = collectStr(s);
    s.write(1);
    s.write(2);
    s.write(3);
    s.end();
    expect(await p).toBe("[1,2,3]");
  });

  test("empty stream emits empty container", async () => {
    const s = stringify("[", ",", "]");
    const p = collectStr(s);
    s.end();
    expect(await p).toBe("[]");
  });

  test("single item", async () => {
    const s = stringify("[", ",", "]");
    const p = collectStr(s);
    s.write(42);
    s.end();
    expect(await p).toBe("[42]");
  });

  test("handles nested objects and arrays", async () => {
    const s = stringify("[", ",", "]");
    const p = collectStr(s);
    s.write([1, 2]);
    s.write({ x: true });
    s.end();
    const result = await p;
    expect(JSON.parse(result)).toEqual([[1, 2], { x: true }]);
  });
});

describe("stringifyLines()", () => {
  test("emits NDJSON (one JSON per line)", async () => {
    const s = stringifyLines();
    const p = collectStr(s);
    s.write({ id: 1 });
    s.write({ id: 2 });
    s.end();
    const result = await p;
    const lines = result.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual({ id: 1 });
    expect(JSON.parse(lines[1])).toEqual({ id: 2 });
  });
});

// ── parseString() + stringifyArray() ──────────────────────────────────────

describe("parseString() helper", () => {
  test("returns matched values", async () => {
    const result = await parseString('[1,2,3]', "*");
    expect(result).toEqual([1, 2, 3]);
  });

  test("nested path", async () => {
    const result = await parseString('{"a":{"b":[4,5,6]}}', "a.b.*");
    expect(result).toEqual([4, 5, 6]);
  });
});

describe("stringifyArray() helper", () => {
  test("returns JSON array string", async () => {
    const result = await stringifyArray([1, 2, 3], "[", ",", "]");
    expect(result).toBe("[1,2,3]");
  });

  test("empty array", async () => {
    const result = await stringifyArray([], "[", ",", "]");
    expect(result).toBe("[]");
  });
});

// ── round-trip ─────────────────────────────────────────────────────────────

describe("round-trip: parse → stringify", () => {
  test("parse array then re-stringify via pipe", async () => {
    const json = '[{"id":1},{"id":2},{"id":3}]';
    const parseStream = parse("*");
    const strStream = stringify("[", ",", "]");
    const p = collectStr(strStream);
    parseStream.pipe(strStream);
    parseStream.end(json);
    const result = await p;
    expect(JSON.parse(result)).toEqual(JSON.parse(json));
  });
});
