// 地理院の年代別写真のタイルを photo://<https の URL> で読む。
// - JPEG (gazo1〜4) は写真の無い所が黒く塗られているので、その黒を透明にする
// - 写真の無いタイルは 404 になるので、エラーにせず透明なタイルを返し、有無を onPhotoTile に知らせる
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

const listeners = new Set<(found: boolean) => void>();
/** タイルを読むたびに、写真があったかを知らせる。戻り値で止める */
export const onPhotoTile = (cb: (found: boolean) => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const notify = (found: boolean) => listeners.forEach((cb) => cb(found));

maplibregl.addProtocol("photo", async (params, abort) => {
  const url = params.url.replace("photo://", "https://");
  const res = await fetch(url, { signal: abort.signal });
  if (res.status === 404) {
    notify(false);
    return { data: blank() };
  }
  if (!res.ok) throw new Error(`${res.status}`);
  notify(true);
  const body = await res.blob();
  return { data: url.endsWith(".jpg") ? await clearBlack(body) : await createImageBitmap(body) };
});

/** https の URL を photo:// で読む形にする */
export const photoUrl = (url: string) => url.replace("https://", "photo://");
