// X での共有とリンクのコピー。どちらも押した時点の URL を使う
import { useState } from "react";

export const ShareButtons = ({ text, hashtag }: { text: string; hashtag: string }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const intent = () => `https://x.com/intent/post?${new URLSearchParams({ text, url: location.href, hashtags: hashtag })}`;
  return (
    <div className="share">
      <a className="x" href={intent()} onClick={(e) => (e.currentTarget.href = intent())} target="_blank" rel="noopener">
        X でシェア
      </a>
      <button
        className="copy"
        type="button"
        onClick={() =>
          navigator.clipboard.writeText(location.href).then(
            () => setCopied("コピーしました"),
            () => setCopied("コピーできませんでした"),
          )
        }
      >
        {copied ?? "リンクをコピー"}
      </button>
    </div>
  );
};
