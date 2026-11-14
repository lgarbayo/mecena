/**
 * Mecena's mark: a sheet with a cut corner whose bottom edge is an "m". The paperwork and the creation are one shape.
 * One path in a 64-unit box, ink in currentColor so it follows the text colour; the same path is src/app/icon.svg and
 * the app icon. Next to the "Mecena" wordmark it is decorative (aria-hidden): the link keeps "Mecena" as its name.
 */
export const LOGO_PATH = "M8 12a8 8 0 0 1 8-8h24l16 16v40h-8V28a6 6 0 0 0-12 0v32h-8V28a6 6 0 0 0-12 0v32H8z";

export function LogoMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="currentColor" aria-hidden focusable="false" className={className} data-testid="logo-mark">
      <path d={LOGO_PATH} />
    </svg>
  );
}
