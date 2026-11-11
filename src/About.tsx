// このサイトについて。今昔マップに着想を得た経緯と、Queria のデータを組み合わせていること
import { useEffect, useRef } from "react";

export const About = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <dialog className="about" ref={dialog} onClose={onClose}>
      <h2>このサイトについて</h2>
      <p>
        このサイトは、谷謙二氏の
        <a href="https://ktgis.net/kjmapw/" target="_blank" rel="noopener">「今昔マップ on the web」</a>
        に着想を得て作りました。今昔マップでは、昔の地形図と今の地図を並べて、町の移り変わりを見比べられます。
      </p>
      <p>
        地図で見える変化を、数字でも確認できるようにしたいと考えました。
        <a href="https://queria.io/" target="_blank" rel="noopener">Queria</a>
        には、当時の市町村の境界（CODH の歴史的行政区域データセット）と、国勢調査などの統計（e-Stat）、地価公示（国土交通省）が SQL
        で読める形で載っています。これらを組み合わせると、当時の町が今のどの市区町村に入ったか、そこに今どれだけの人が住んでいるかを数字で確認できます。
      </p>
      <p>
        市町村をクリックすると、ブラウザから Queria のデータセットに SQL を実行して、その場で表とグラフを作ります。空中写真と地図は国土地理院の地理院タイルを使っています。
      </p>
      <form method="dialog">
        <button>閉じる</button>
      </form>
    </dialog>
  );
};
