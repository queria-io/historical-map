// Queria の上に作ったアプリであることを示すリンク
import logo from "./queria-logo.svg?raw";

export const PoweredBy = () => (
  <a className="powered" href="https://queria.io/" target="_blank" rel="noopener">
    Powered by <span className="logo" role="img" aria-label="Queria" dangerouslySetInnerHTML={{ __html: logo }} />
  </a>
);
