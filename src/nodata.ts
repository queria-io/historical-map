// 地理院の年代別写真 (gazo1〜4) は JPEG で、写真の無い所が黒く塗られている。
// nodata://<https の URL> で読むと、その黒を透明にした PNG にして地図に渡す
import maplibregl from "maplibre-gl";

/** JPEG のにじみがあるので、ほぼ黒まで透明にする */
const BLACK = 12;

const clear = async (bytes: Blob): Promise<ArrayBuffer> => {
  const bitmap = await createImageBitmap(bytes);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] < BLACK && px[i + 1] < BLACK && px[i + 2] < BLACK) px[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
  return (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
};

const blank = () => {
  const canvas = new OffscreenCanvas(1, 1);
  canvas.getContext("2d");
  return canvas.convertToBlob({ type: "image/png" }).then((b) => b.arrayBuffer());
};
const empty = blank();

maplibregl.addProtocol("nodata", async (params, abort) => {
  const res = await fetch(params.url.replace("nodata://", "https://"), { signal: abort.signal });
  // 写真の無いタイルは 404。エラーにせず透明なタイルを返す
  if (res.status === 404) return { data: await empty };
  if (!res.ok) throw new Error(`${res.status}`);
  return { data: await clear(await res.blob()) };
});

