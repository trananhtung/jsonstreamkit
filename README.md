# jsonstreamkit

Zero-dependency TypeScript streaming JSON parser and stringifier. Parse multi-gigabyte JSON files without loading them into memory.

Drop-in replacement for the abandoned [`JSONStream`](https://www.npmjs.com/package/JSONStream) npm package (12.6M/week, archived 2018). Zero runtime dependencies, full TypeScript types, ESM + CJS.

[![npm](https://img.shields.io/npm/v/jsonstreamkit)](https://www.npmjs.com/package/jsonstreamkit)
[![license](https://img.shields.io/npm/l/jsonstreamkit)](LICENSE)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

## Install

```bash
npm install jsonstreamkit
```

## Quick start

```typescript
import { createReadStream } from "node:fs";
import { parse } from "jsonstreamkit";

// Parse a large JSON array and process each element without loading the whole file
createReadStream("huge-data.json")
  .pipe(parse("rows.*"))
  .on("data", (row) => {
    console.log(row); // each row object, emitted as it arrives
  });
```

## API

### `parse(path?)`

Creates a `Transform` stream that:
1. Receives JSON as `Buffer`/`string` chunks
2. Emits matched values as JavaScript objects (no serialization overhead)

```typescript
import { parse } from "jsonstreamkit";

// Match all elements of a top-level array
const stream = parse("*");

// Match nested array elements
const stream = parse("data.rows.*");

// Match a specific field
const stream = parse("metadata.title");

// Emit the whole document (path = "")
const stream = parse("");

// Array-form path (same as "data.rows.*"):
const stream = parse(["data", "rows", "*"]);
```

**Path syntax:**

| Path | Matches |
|---|---|
| `"*"` | Each element of the root array/object |
| `"rows.*"` | Each element of `json.rows` |
| `"a.b.c"` | The value at `json.a.b.c` |
| `"items.0"` | `json.items[0]` |
| `""` | The entire document (emit once) |

### `stringify(open?, sep?, close?)`

Creates a Transform stream that serializes objects into a JSON array string.

```typescript
import { stringify } from "jsonstreamkit";

const stream = stringify();          // default: "[\n", "\n,\n", "\n]\n"
const stream = stringify("[", ",", "]");  // compact
```

### `stringifyLines()`

Emits [NDJSON / JSON Lines](https://jsonlines.org/) — one JSON object per line.

```typescript
import { stringifyLines } from "jsonstreamkit";

const stream = stringifyLines();
stream.write({ id: 1 });  // → {"id":1}
stream.write({ id: 2 });  // → {"id":2}
```

### Convenience helpers

```typescript
import { parseString, stringifyArray } from "jsonstreamkit";

// Parse a complete JSON string (non-streaming)
const results = await parseString('[1,2,3]', "*");  // [1, 2, 3]
const results = await parseString(bigJson, "rows.*"); // array of rows

// Stringify an array of values (non-streaming)
const json = await stringifyArray([1, 2, 3], "[", ",", "]"); // "[1,2,3]"
```

## Examples

### Stream-process a large JSON file

```typescript
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { parse } from "jsonstreamkit";

let count = 0;
createReadStream("data.json.gz")
  .pipe(createGunzip())
  .pipe(parse("records.*"))
  .on("data", (record: Record<string, unknown>) => {
    count++;
    // process each record without memory pressure
  })
  .on("end", () => console.log(`Processed ${count} records`));
```

### Transform and re-emit as NDJSON

```typescript
import { createReadStream, createWriteStream } from "node:fs";
import { parse, stringifyLines } from "jsonstreamkit";

createReadStream("input.json")
  .pipe(parse("items.*"))
  .pipe(stringifyLines())
  .pipe(createWriteStream("output.ndjson"));
```

### Stringify an async generator

```typescript
import { Readable } from "node:stream";
import { stringify } from "jsonstreamkit";

async function* generateRecords() {
  for await (const row of db.cursor("SELECT * FROM events")) {
    yield row;
  }
}

Readable.from(generateRecords())
  .pipe(stringify())
  .pipe(response); // pipe to HTTP response
```

### Drop-in for JSONStream

```typescript
// Before:
const JSONStream = require("JSONStream");
const parser = JSONStream.parse("rows.*");

// After:
import { parse } from "jsonstreamkit";
const parser = parse("rows.*");
```

## Known limitations

- Streaming `null` as an individual array element is not supported (Node.js object-mode streams use `push(null)` to signal end-of-stream). Use `parseString()` if your data contains top-level `null` items.

## License

MIT
