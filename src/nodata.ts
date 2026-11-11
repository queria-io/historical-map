// 地理院の年代別写真 (gazo1〜4) は JPEG で、写真の無い所が黒く塗られている。
// nodata://<https の URL> で読むと、その黒を透明にした画像にして地図に渡す
import maplibregl from "maplibre-gl";

/** JPEG のにじみがあるので、ほぼ黒まで透明にする */
const BLACK = 12;

/** PNG に書き直さず ImageBitmap のまま渡す (MapLibre は addProtocol の ImageBitmap をそのまま使う) */
const clear = async (bytes: Blob): Promise<ImageBitmap> => {
  const bitmap = await createImageBitmap(bytes);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
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

maplibregl.addProtocol("nodata", async (params, abort) => {
  const res = await fetch(params.url.replace("nodata://", "https://"), { signal: abort.signal });
  // 写真の無いタイルは 404。エラーにせず透明なタイルを返す
  if (res.status === 404) return { data: blank() };
  if (!res.ok) throw new Error(`${res.status}`);
  return { data: await clear(await res.blob()) };
});

