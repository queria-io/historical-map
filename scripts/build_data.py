"""地図が読む統計を、Queria の公開データセットから都道府県ごとの JSON に書き出す。

- 当時の市町村 (codh.city.municipality) と、今の市区町村との重なり (codh.city.current_overlap)
- 今の市区町村の時系列 (e_stat の社会・人口統計体系と令和7年国勢調査。今の区域に組み替えた値)
- その年の市町村の時系列 (e_stat の住民基本台帳。1995 年から、その年の区域の値)

public/data/<都道府県コード>.json に書く。アプリはクリックした地物の都道府県のファイルだけを読む。

使い方: uv run --with 'duckdb>=1.4,<2' python scripts/build_data.py
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import duckdb

DATA = "https://data.queria.io/datasets/queria"
OUT = Path(__file__).resolve().parent.parent / "public" / "data"
# 境界の重なりのうち、境界沿いの数 % の重なりは落とす
MIN_SHARE = 0.1

# 社会・人口統計体系 (今の市区町村の区域に組み替え済み) から使う指標
SSDS = {
    "A1101": "population",
    "A7101": "households",
    "A1301": "age_0_14",
    "A1302": "age_15_64",
    "A1303": "age_65_over",
}


def num(v: float) -> float | int:
    return int(v) if float(v).is_integer() else v


def connect() -> duckdb.DuckDBPyConnection:
    c = duckdb.connect()
    c.sql("INSTALL ducklake; INSTALL httpfs")
    for name in ("codh", "e_stat"):
        c.sql(f"ATTACH 'ducklake:{DATA}/{name}/ducklake.duckdb' AS {name} (READ_ONLY)")
    return c


def cities(c) -> list[tuple]:
    return c.sql(f"""
      SELECT m.geoshape_city_id, m.prefecture_code, m.address, m.valid_from, m.valid_to,
        list({{'code': o.current_city_code, 'share': round(o.past_share, 3)}}
          ORDER BY o.past_share DESC) FILTER (WHERE o.current_city_code IS NOT NULL) AS current
      FROM codh.city.municipality AS m
      LEFT JOIN codh.city.current_overlap AS o
        ON o.geoshape_city_id = m.geoshape_city_id AND o.past_share >= {MIN_SHARE}
      GROUP BY ALL
    """).fetchall()


def current_series(c) -> list[tuple]:
    codes = ", ".join(f"'{k}'" for k in SSDS)
    cases = " ".join(f"WHEN '{k}' THEN '{v}'" for k, v in SSDS.items())
    return c.sql(f"""
      WITH s AS (
        SELECT area AS code, CASE cat01 {cases} END AS indicator, year, value
        FROM e_stat.ssds.a_municipal_population WHERE cat01 IN ({codes}) AND value IS NOT NULL
        UNION ALL
        SELECT area, unnest(['population', 'households']), 2025, unnest([population, households])
        FROM e_stat.census.census_municipality_2025
        WHERE area_level IN ('city', 'ward', 'town_village')
      )
      SELECT s.code, m.pref_name, concat_ws(' ', m.district_name, m.municipality_name) AS name,
        s.indicator, list([s.year, s.value] ORDER BY s.year) AS points
      FROM s JOIN e_stat.code.municipality AS m ON m.area_code = s.code
      GROUP BY ALL
    """).fetchall()


def registry_series(c) -> list[tuple]:
    # 2012 年以前は日本人住民だけなので、総計のある 2013 年以降も日本人住民にそろえる
    return c.sql("""
      WITH r AS (
        SELECT area_code AS code, year, municipality_name AS name,
          population_total AS population, households, births, deaths,
          moved_in_total AS moved_in, moved_out_total AS moved_out
        FROM e_stat.resident_registry.population
        WHERE area_level = 'municipality' AND resident_kind = 'japanese' AND area_code IS NOT NULL
      )
      UNPIVOT r ON population, households, births, deaths, moved_in, moved_out
        INTO NAME indicator VALUE value
    """).fetchall()


def main() -> None:
    c = connect()
    files: dict[str, dict] = defaultdict(lambda: {"cities": {}, "current": {}, "registry": {}})

    for gid, pref, address, valid_from, valid_to, current in cities(c):
        files[pref]["cities"][gid] = {
            "name": address,
            "from": valid_from.isoformat() if valid_from else None,
            "to": valid_to.isoformat() if valid_to else None,
            "current": current or [],
        }

    for code, pref_name, name, indicator, points in current_series(c):
        entry = files[code[:2]]["current"].setdefault(code, {"name": f"{pref_name} {name}", "series": {}})
        entry["series"][indicator] = [[int(y), num(v)] for y, v in points]

    for code, year, name, indicator, value in registry_series(c):
        if value is None:
            continue
        entry = files[code[:2]]["registry"].setdefault(code, {"names": {}, "series": {}})
        entry["names"][str(year)] = name
        entry["series"].setdefault(indicator, []).append([int(year), num(value)])

    OUT.mkdir(parents=True, exist_ok=True)
    for pref, body in sorted(files.items()):
        for entry in body["registry"].values():
            for points in entry["series"].values():
                points.sort()
        path = OUT / f"{pref}.json"
        path.write_text(json.dumps(body, ensure_ascii=False, separators=(",", ":")))
        print(f"{path.name}: {len(body['cities'])} cities, {path.stat().st_size // 1024} KiB", file=sys.stderr)


if __name__ == "__main__":
    main()
