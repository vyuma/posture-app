import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

/** Renders a LaTeX string with KaTeX (inline by default). Input is always a constant or a number we format ourselves. */
export function Tex({ children, block = false, className }: { children: string; block?: boolean; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: block, throwOnError: false, strict: false, output: "html" }),
    [children, block],
  );
  return <span className={className ? `ml-tex ${className}` : "ml-tex"} dangerouslySetInnerHTML={{ __html: html }} />;
}
