// 地名の検索欄。入力が止まってから search を呼び、候補を並べる
import { useEffect, useState } from "react";

export type Hit = { label: string; note: string };

type Props<H extends Hit> = {
  search: (q: string) => Promise<H[]>;
  onPick: (hit: H) => void;
  placeholder?: string;
};

type List<H> = { q: string; status: "loading" | "done" | "error"; hits: H[] };

export const PlaceSearch = <H extends Hit>({ search, onPick, placeholder }: Props<H>) => {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<List<H> | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term || !open) return;
    let alive = true;
    const timer = setTimeout(() => {
      setList({ q: term, status: "loading", hits: [] });
      search(term).then(
        (hits) => alive && setList({ q: term, status: "done", hits }),
        () => alive && setList({ q: term, status: "error", hits: [] }),
      );
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, open, search]);

  // 今の入力に対する結果だけを選べる
  const hits = list?.q === q.trim() ? list.hits : [];
  const pick = (h: H) => {
    setOpen(false);
    setQ(h.label);
    onPick(h);
  };
  const message =
    list?.q !== q.trim() || list.status === "loading"
      ? "検索しています…"
      : list.status === "error"
        ? "検索できませんでした"
        : "見つかりませんでした";

  return (
    <div className="search">
      <input
        type="search"
        value={q}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) pick(hits[0]);
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && q.trim() && (
        <ul className="hits">
          {hits.length ? (
            hits.map((h, i) => (
              <li key={i} onClick={() => pick(h)}>
                {h.label}
                <small>{h.note}</small>
              </li>
            ))
          ) : (
            <li className="empty">{message}</li>
          )}
        </ul>
      )}
    </div>
  );
};
