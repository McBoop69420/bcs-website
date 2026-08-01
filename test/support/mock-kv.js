export class MockKV {
  constructor({
    enforceMetadataLimit = false,
    rejectRepeatedWrites = false,
    pageSize = 1000,
  } = {}) {
    this.calls = { get: [], list: [], put: [] };
    this.entries = new Map();
    this.enforceMetadataLimit = enforceMetadataLimit;
    this.rejectRepeatedWrites = rejectRepeatedWrites;
    this.pageSize = pageSize;
    this.writeCounts = new Map();
  }

  seed(name, value, { metadata } = {}) {
    this.entries.set(name, { value, metadata });
  }

  entry(name) {
    return this.entries.get(name);
  }

  async get(name) {
    this.calls.get.push(name);
    return this.entries.get(name)?.value ?? null;
  }

  async put(name, value, options = {}) {
    this.calls.put.push({ name, value, options });

    const previousWrites = this.writeCounts.get(name) || 0;
    if (this.rejectRepeatedWrites && previousWrites > 0) {
      throw new Error(`KV PUT failed: repeated write to ${name}`);
    }
    this.writeCounts.set(name, previousWrites + 1);

    if (this.enforceMetadataLimit && options.metadata !== undefined) {
      const serialized = JSON.stringify(options.metadata);
      if (Buffer.byteLength(serialized, "utf8") > 1024) {
        throw new Error("KV PUT failed: metadata exceeds 1024 bytes");
      }
    }

    this.entries.set(name, { value, metadata: options.metadata });
  }

  async list(options = {}) {
    this.calls.list.push(options);

    const prefix = options.prefix || "";
    const offset = options.cursor ? Number(options.cursor) : 0;
    const limit = Math.min(options.limit || 1000, this.pageSize);
    const matching = [...this.entries.entries()]
      .filter(([name]) => name.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b));
    const page = matching.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const listComplete = nextOffset >= matching.length;

    return {
      keys: page.map(([name, entry]) => {
        const key = { name };
        if (entry.metadata !== undefined) key.metadata = entry.metadata;
        return key;
      }),
      list_complete: listComplete,
      ...(listComplete ? {} : { cursor: String(nextOffset) }),
    };
  }
}
