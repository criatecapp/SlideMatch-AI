// Fake mínimo do subconjunto da API do Admin SDK que os services usam —
// permite testar services reais (sem mockar cada service individualmente)
// contra um Firestore em memória. `vi.mock("../firestore", ...)` aponta
// `getDb()` pra uma instância disto em cada arquivo de teste.

class FakeTimestamp {
  constructor(private readonly date: Date) {}
  toDate() {
    return this.date;
  }
}

export const FAKE_SERVER_TIMESTAMP = new FakeTimestamp(new Date());

interface FakeDoc {
  id: string;
  data: Record<string, any>;
}

class FakeDocRef {
  constructor(private readonly store: Map<string, FakeDoc>, public readonly id: string) {}

  async set(data: Record<string, any>, options?: { merge?: boolean }) {
    const existing = this.store.get(this.id);
    const resolved = resolveTimestamps(data);
    const merged = options?.merge && existing ? { ...existing.data, ...resolved } : resolved;
    this.store.set(this.id, { id: this.id, data: merged });
  }

  async get() {
    const doc = this.store.get(this.id);
    return {
      exists: Boolean(doc),
      id: this.id,
      data: () => (doc ? { ...doc.data } : undefined),
    };
  }

  async delete() {
    this.store.delete(this.id);
  }
}

function resolveTimestamps(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = v === FAKE_SERVER_TIMESTAMP ? new FakeTimestamp(new Date()) : v;
  }
  return out;
}

interface Query {
  wheres: [string, string, any][];
  orderField?: string;
  orderDir?: "asc" | "desc";
  limitN?: number;
}

class FakeCollection {
  private store = new Map<string, FakeDoc>();
  private autoIdCounter = 0;

  doc(id?: string): FakeDocRef {
    const docId = id ?? `auto_${++this.autoIdCounter}_${Math.random().toString(36).slice(2, 8)}`;
    return new FakeDocRef(this.store, docId);
  }

  where(field: string, _op: "==", value: any) {
    return new FakeQuery(this.store, { wheres: [[field, "==", value]] });
  }

  orderBy(field: string, dir: "asc" | "desc" = "asc") {
    return new FakeQuery(this.store, { wheres: [], orderField: field, orderDir: dir });
  }

  limit(n: number) {
    return new FakeQuery(this.store, { wheres: [], limitN: n });
  }

  async get() {
    return new FakeQuery(this.store, { wheres: [] }).get();
  }

  // usado pelos testes pra popular/inspecionar diretamente
  _raw() {
    return this.store;
  }
}

class FakeQuery {
  constructor(private readonly store: Map<string, FakeDoc>, private readonly query: Query) {}

  where(field: string, _op: "==", value: any) {
    return new FakeQuery(this.store, { ...this.query, wheres: [...this.query.wheres, [field, "==", value]] });
  }

  orderBy(field: string, dir: "asc" | "desc" = "asc") {
    return new FakeQuery(this.store, { ...this.query, orderField: field, orderDir: dir });
  }

  limit(n: number) {
    return new FakeQuery(this.store, { ...this.query, limitN: n });
  }

  async get() {
    let docs = [...this.store.values()];
    for (const [field, , value] of this.query.wheres) {
      docs = docs.filter((d) => d.data[field] === value);
    }
    if (this.query.orderField) {
      const field = this.query.orderField;
      const dir = this.query.orderDir ?? "asc";
      docs.sort((a, b) => {
        const av = fieldSortValue(a.data[field]);
        const bv = fieldSortValue(b.data[field]);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return dir === "asc" ? cmp : -cmp;
      });
    }
    if (this.query.limitN !== undefined) docs = docs.slice(0, this.query.limitN);
    return {
      empty: docs.length === 0,
      size: docs.length,
      docs: docs.map((d) => ({ id: d.id, data: () => ({ ...d.data }) })),
    };
  }
}

function fieldSortValue(v: any): number | string {
  if (v instanceof FakeTimestamp) return v.toDate().getTime();
  return v ?? "";
}

class FakeBatch {
  private ops: (() => Promise<void>)[] = [];
  constructor(private readonly firestore: FakeFirestore) {}

  set(ref: FakeDocRef, data: Record<string, any>, options?: { merge?: boolean }) {
    this.ops.push(() => ref.set(data, options));
  }

  delete(ref: FakeDocRef) {
    this.ops.push(() => ref.delete());
  }

  async commit() {
    for (const op of this.ops) await op();
  }
}

// Fake mínimo de transação — o event loop do teste é single-thread, então
// não existe interleaving real entre o get() e o set() dentro do mesmo
// runTransaction; isso já é suficiente pra exercitar a lógica do rate
// limiter (P1#2), só não simula corrida entre requests concorrentes de
// verdade (o Admin SDK real faz isso).
class FakeTransaction {
  async get(ref: FakeDocRef) {
    return ref.get();
  }
  set(ref: FakeDocRef, data: Record<string, any>, options?: { merge?: boolean }) {
    return ref.set(data, options);
  }
}

export class FakeFirestore {
  private collections = new Map<string, FakeCollection>();

  collection(name: string): FakeCollection {
    if (!this.collections.has(name)) this.collections.set(name, new FakeCollection());
    return this.collections.get(name)!;
  }

  batch() {
    return new FakeBatch(this);
  }

  async runTransaction<T>(fn: (tx: FakeTransaction) => Promise<T>): Promise<T> {
    return fn(new FakeTransaction());
  }

  clear() {
    this.collections.clear();
  }
}
