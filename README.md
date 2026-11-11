# 過去の地図と統計（historical-map.queria.io）

国土地理院の年代別空中写真（1945〜1990 年）に当時の市町村の境界を重ね、クリックした市町村の統計を表示する地図です。左に当時の写真、右に今の地理院地図を並べ、2 つの地図の位置を連動させます。右の地図には今の市区町村の境界と当時の境界を重ね、合併などで境界がどう変わったかを見比べられます（1 画面にも切り替えられます）。データは Queria の公開データセットから作ります。

- 背景: [地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)の年代別空中写真と、今の地図（標準地図・淡色地図・最新の写真）。ブラウザからリアルタイムに読み込みます
- 今の境界: Queria の境界タイル（`nlftp` の行政区域、assets.queria.io/boundaries/）
- 当時の境界: `codh` データセットの `city.boundary` を PMTiles にしたもの（dataset-codh の `scripts/build-tiles.sh`、assets.queria.io に置く）
- 統計: `codh` と `e_stat` から `scripts/build_data.py` が都道府県ごとの JSON（`public/data/`）を作ります

| 表示する統計 | 元のテーブル | 期間 | 区域 |
| --- | --- | --- | --- |
| 人口・年齢 3 区分・世帯数 | `e_stat.ssds.a_municipal_population`、`e_stat.census.census_municipality_2025` | 1980〜2025 年 | 今の市区町村（組み替え済み） |
| 人口・出生・死亡・転入・転出 | `e_stat.resident_registry.population`（日本人住民） | 1995 年〜 | その年の市町村 |

当時の市町村と今の市区町村は、`codh.city.current_overlap` の面積の割合（10% 以上）で対応させます。

## 開発

```bash
pnpm install
pnpm build:data        # public/data/*.json を作る（uv が要ります）
pnpm dev               # ?era=1961&screens=2&now=std で年代・画面数・右の地図を指定できます
pnpm run deploy        # 手元からビルドして Cloudflare Workers にデプロイする
```

main にマージすると、Cloudflare の Workers Builds が `pnpm run build` と `npx wrangler deploy` を実行して historical-map.queria.io にデプロイします。

境界タイルの URL は `.env` の `VITE_BOUNDARY_TILES` です。

## 出典

- 国土地理院（地理院タイル）
- 「国土数値情報（行政区域データ）」（国土交通省）を加工
- 『歴史的行政区域データセットβ版』（CODH作成） doi:10.20676/00000447 を加工
- 政府統計の総合窓口（e-Stat）の統計を加工
