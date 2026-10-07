const STYLE_ID = "paseo-web-motion-styles";

export function installWebMotionStyles(): () => void {
  if (document.getElementById(STYLE_ID)) return () => {};

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
`;
  document.head.append(style);

  return () => style.remove();
}
