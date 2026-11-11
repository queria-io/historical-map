// 背景に選べる年代。国土地理院の年代別空中写真 (https://maps.gsi.go.jp/development/ichiran.html) と、
// 重ねる市区町村の境界の基準日 (codh の city.boundary、タイルのレイヤー名 city_YYYYMMDD)。
// 地理院タイルはリアルタイムに読み込み、出典を表示すれば申請は要らない
import { photoUrl } from "./kit/photoTiles";

export type Era = {
  id: string;
  label: string;
  tiles: string;
  boundaryDate: string;
  /** 統計を見る年。写真の年代の真ん中 (境界の基準日は codh の境界がある日なので、写真の年代とずれることがある) */
  year: number;
};

const gsi = (id: string, ext: string) =>
  `https://cyberjapandata.gsi.go.jp/xyz/${id}/{z}/{x}/{y}.${ext}`;
/** 写真は photo:// で読み、写真の無い所を透明にして有無を数える (kit/photoTiles.ts) */
const photo = (id: string, ext: string) => photoUrl(gsi(id, ext));

export const ERAS: readonly Era[] = [
  { id: "1945", label: "1945〜1950年", tiles: photo("ort_USA10", "png"), boundaryDate: "1950-10-01", year: 1948 },
  { id: "1961", label: "1961〜1969年", tiles: photo("ort_old10", "png"), boundaryDate: "1965-10-01", year: 1965 },
  { id: "1974", label: "1974〜1978年", tiles: photo("gazo1", "jpg"), boundaryDate: "1975-10-01", year: 1976 },
  { id: "1979", label: "1979〜1983年", tiles: photo("gazo2", "jpg"), boundaryDate: "1980-10-01", year: 1981 },
  { id: "1984", label: "1984〜1986年", tiles: photo("gazo3", "jpg"), boundaryDate: "1985-10-01", year: 1985 },
  { id: "1987", label: "1987〜1990年", tiles: photo("gazo4", "jpg"), boundaryDate: "1985-10-01", year: 1989 },
];

/** 写真のズームの範囲 (地理院タイル一覧) */
export const PHOTO_MINZOOM = 10;
export const PHOTO_MAXZOOM = 17;

export const PALE_TILES = gsi("pale", "png");

export const boundaryLayer = (era: Era) => `city_${era.boundaryDate.replaceAll("-", "")}`;

/** 右の地図 (今の地図) に選べる地理院タイル */
export const CURRENT_MAPS = [
  { id: "pale", label: "淡色地図", tiles: PALE_TILES, maxzoom: 18 },
  { id: "std", label: "標準地図", tiles: gsi("std", "png"), maxzoom: 18 },
  { id: "photo", label: "最新の写真", tiles: gsi("seamlessphoto", "jpg"), maxzoom: 18 },
] as const;
