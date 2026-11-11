// ブラウザの DuckDB (WASM) で Queria の公開データセットに SQL を実行する。
// 本体は queria.io と同じく assets.queria.io に置いたものを使い、データは data.queria.io から読む
import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";

const WASM = "https://assets.queria.io/duckdb-wasm/1.33.1-dev57.0";
const DATA = "https://data.queria.io/datasets/queria";

const boot = async (): Promise<AsyncDuckDB> => {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: `${WASM}/duckdb-mvp.wasm`, mainWorker: `${WASM}/duckdb-browser-mvp.worker.js` },
    eh: { mainModule: `${WASM}/duckdb-eh.wasm`, mainWorker: `${WASM}/duckdb-browser-eh.worker.js` },
  });
  // ワーカーは別オリジンなので、取ってきた中身から起こす
  const res = await fetch(bundle.mainWorker ?? "");
  if (!res.ok) throw new Error(`${bundle.mainWorker}: ${res.status}`);
  const scriptUrl = URL.createObjectURL(await res.blob());
  const worker = new Worker(scriptUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  try {
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    // 既定の true だと Parquet を丸ごと読むので、Range で必要な所だけ読む
    await db.open({ filesystem: { forceFullHTTPReads: false } });
    const conn = await db.connect();
    await conn.query("INSTALL ducklake; LOAD ducklake").finally(() => conn.close());
  } catch (e) {
    // 次の getDB で起こし直すので、失敗したワーカーは止める
    await db.terminate();
    throw e;
  } finally {
    URL.revokeObjectURL(scriptUrl);
  }
  return db;
};

/**
 * データセットを 1 つ ATTACH する。カタログは 1 回の GET で丸ごと取って渡す。DuckDB に Range で読ませると
 * 16KiB ずつの往復が数百本になる (e_stat のカタログは 8MiB ほど)。データの Parquet は Range で読む
 */
const attach = async (db: AsyncDuckDB, name: string): Promise<void> => {
  const url = `${DATA}/${name}/ducklake.duckdb`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  await db.registerFileBuffer(`${name}.duckdb`, new Uint8Array(await res.arrayBuffer()));
  const conn = await db.connect();
  try {
    await conn.query(
      `ATTACH 'ducklake:${name}.duckdb' AS ${name} (READ_ONLY, DATA_PATH '${DATA}/${name}/ducklake.duckdb.files/', OVERRIDE_DATA_PATH true)`,
    );
  } finally {
    await conn.close();
  }
};

/** Arrow の値を JS の値にする。リストは配列、構造体はオブジェクト、BIGINT は number */
const plain = (v: unknown): unknown => {
  if (typeof v === "bigint") return Number(v);
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(plain);
  // Arrow のリスト (Vector) は配列、構造体と行 (StructRow) はオブジェクトを返す
  if ("toJSON" in v && typeof v.toJSON === "function") return plain(v.toJSON());
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
};

/**
 * 読めるデータセットを決めて、Queria に SQL を実行する口を作る。SQL では <データセット>.<スキーマ>.<テーブル> で書く。
 * データセットは SQL に名前が出てきたときに ATTACH するので、カタログの大きいものも最初の表示を遅くしない
 */
export const createQueria = (datasets: readonly string[]) => {
  let dbPromise: Promise<AsyncDuckDB> | null = null;
  const attached = new Map<string, Promise<void>>();

  /** 最初に呼んだときに起こし、以後は同じものを返す。失敗したら次に起こし直す */
  const getDB = (): Promise<AsyncDuckDB> =>
    (dbPromise ??= boot().catch((e: unknown) => {
      dbPromise = null;
      attached.clear();
      throw e;
    }));

  /** names を ATTACH しておく。失敗したら次に使うときに取り直す */
  const preload = async (names: readonly string[]): Promise<void> => {
    const db = await getDB();
    await Promise.all(
      names.map((name) => {
        const p =
          attached.get(name) ??
          attach(db, name).catch((e: unknown) => {
            attached.delete(name);
            throw e;
          });
        attached.set(name, p);
        return p;
      }),
    );
  };

  /** SQL を実行して行をオブジェクトの配列で返す */
  const query = async <T,>(sql: string): Promise<T[]> => {
    await preload(datasets.filter((name) => new RegExp(`\\b${name}\\.`).test(sql)));
    const conn = await (await getDB()).connect();
    try {
      const started = performance.now();
      const table = await conn.query(sql);
      console.debug(`[sql] ${((performance.now() - started) / 1000).toFixed(2)}s ${sql.trim().split("\n")[0]}`);
      return table.toArray().map((row) => plain(row) as T);
    } finally {
      await conn.close();
    }
  };
  return { query, preload };
};

/** SQL の文字列リテラル */
export const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;
