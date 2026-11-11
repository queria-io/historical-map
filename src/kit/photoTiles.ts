// 地理院の年代別写真のタイルを photo://<https の URL> で読む。
// - JPEG (gazo1〜4) は写真の無い所が黒く塗られているので、その黒を透明にする
// - 写真の無いタイルは 404 になるので、エラーにせず透明なタイルを返し、有無をタイルの URL ごとに覚える
import maplibregl from "maplibre-gl";

/** JPEG のにじみがあるので、ほぼ黒まで透明にする */
const BLACK = 12;

/** PNG に書き直さず ImageBitmap のまま渡す (MapLibre は addProtocol の ImageBitmap をそのまま使う) */
const clearBlack = async (bytes: Blob): Promise<ImageBitmap> => {
  const bitmap = await createImageBitmap(bytes);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return bitmap;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] < BLACK && px[i + 1] < BLACK && px[i + 2] < BLACK) px[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.transferToImageBitmap();
};

/** 写真の無いタイルの代わりの、透明な 1 ピクセル */
const blank = () => {
  const canvas = new OffscreenCanvas(1, 1);
  canvas.getContext("2d");
  return canvas.transferToImageBitmap();
};

/** 読んだタイルに写真があったか (photo:// の URL ごと)。MapLibre がキャッシュから描くタイルも判定できるように覚えておく */
const found = new Map<string, boolean>();

maplibregl.addProtocol("photo", async (params, abort) => {
  const url = params.url.replace("photo://", "https://");
  const res = await fetch(url, { signal: abort.signal });
  if (res.status === 404) {
    found.set(params.url, false);
    return { data: blank() };
  }
  if (!res.ok) throw new Error(`${res.status}`);
  found.set(params.url, true);
  const body = await res.blob();
  return { data: url.endsWith(".jpg") ? await clearBlack(body) : await createImageBitmap(body) };
});

/** https の URL を photo:// で読む形にする */
export const photoUrl = (url: string) => url.replace("https://", "photo://");

/**
 * 地図に今出ている範囲の写真のタイル (template は photo:// の URL) に写真があるか。1 枚でもあれば true、
 * 読んだタイルが全部 404 なら false、写真を出さないズームや未読なら undefined。
 * 256px のラスタータイルは、地図のズーム + 1 を四捨五入した段で読まれる
 */
export const photoCoverage = (map: maplibregl.Map, template: string, minzoom: number, maxzoom: number) => {
  const z = Math.min(Math.round(map.getZoom() + 1), maxzoom);
  if (z < minzoom) return undefined;
  const n = 2 ** z;
  const clamp = (v: number) => Math.min(Math.max(Math.floor(v), 0), n - 1);
  const tx = (lng: number) => clamp(((lng + 180) / 360) * n);
  const ty = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return clamp(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const b = map.getBounds();
  let missing = false;
  for (let x = tx(b.getWest()); x <= tx(b.getEast()); x++) {
    for (let y = ty(b.getNorth()); y <= ty(b.getSouth()); y++) {
      const f = found.get(template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
      if (f) return true;
      if (f === false) missing = true;
    }
  }
  return missing ? false : undefined;
};
