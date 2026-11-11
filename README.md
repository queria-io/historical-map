# まちの昔と今（historical-map.queria.io）

国土地理院の年代別空中写真（1945〜1990 年）に当時の市町村の境界を重ね、クリックした市町村の統計を表示する地図です。左に当時の写真、右に今の地理院地図を並べ、2 つの地図の位置を連動させます。右の地図には今の市区町村の境界と当時の境界を重ね、合併などで境界がどう変わったかを見比べられます（1 画面にも切り替えられます）。データは Queria の公開データセットから作ります。

- 背景: [地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)の年代別空中写真と、今の地図（標準地図・淡色地図・最新の写真）。ブラウザからリアルタイムに読み込みます
- 今の境界: Queria の境界タイル（`nlftp` の行政区域、assets.queria.io/boundaries/）
- 当時の境界: `codh` データセットの `city.boundary` を PMTiles にしたもの（dataset-codh の `scripts/build-tiles.sh`、assets.queria.io に置く）
- 統計: クリックした市町村の値を、ブラウザの DuckDB（WASM）で Queria の公開データセットに SQL を実行して取得します
- 地名の検索: 当時の市町村名は `codh.city.municipality`、今の住所は Queria のジオコーダー（geocoder.queria.io の `/v1/forward`）で引きます

| 表示する値 | 元のテーブル |
| --- | --- |
| 当時の市町村の名前・期間・面積、今の市区町村との重なり | `codh.city.municipality`、`codh.city.current_overlap` |
| 移り変わり（合併・編入・改称・分割） | `codh.city.succession` |
| 今の市区町村の人口・世帯数・面積・人口密度 | `e_stat.census.census_municipality_2025` |
| 当時の区域の人口・世帯数（1995 年から、その年の市町村コード） | `e_stat.resident_registry.population`（日本人住民） |
| 今の市区町村の人口の推移と年齢 3 区分の割合（今の区域に組み替えた値） | `e_stat.ssds.a_municipal_population` |
| 今の市区町村の住宅地の地価の中央値（1995 年から） | `reinfolib.main.mart_land_prices`（地価公示・地価調査） |

## 構成

React と MapLibre で書いています。ほかの地図のアプリでも使える部品は `src/kit/` に分けています。

- `kit/db.ts`: ブラウザの DuckDB（WASM）で Queria のデータセットに SQL を実行する。SQL に名前が出てきたデータセットだけを ATTACH する
- `kit/MapView.tsx`: MapLibre の地図。スタイルを渡し直すと差分だけを当てる
- `kit/sync.ts`・`kit/bounds.ts`: 2 つの地図の連動と十字、地物に寄せる処理
- `kit/photoTiles.ts`: 地理院の年代別写真の黒い所を透明にし、写真の有無を知らせる
- `kit/PlaceSearch.tsx`・`kit/geocoder.ts`・`kit/ShareButtons.tsx`・`kit/PoweredBy.tsx`・`kit/charts.tsx`: 検索欄、ジオコーダー、共有ボタン、Powered by、グラフ

## 開発

```bash
pnpm install
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
- 地価公示・都道府県地価調査（国土交通省 不動産情報ライブラリ）を加工
