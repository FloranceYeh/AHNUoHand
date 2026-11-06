export function BrandIcon({ className }: { className?: string }) {
  return (
    <span
      className={`brand-icon${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    />
  );
}
