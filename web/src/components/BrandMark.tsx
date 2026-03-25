import { Link } from "react-router-dom";

export function BrandMark(props?: {
  to?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const className = ["bb-brand-mark", props?.className].filter(Boolean).join(" ");

  return (
    <Link to={props?.to ?? "/"} className={className} aria-label={props?.ariaLabel ?? "BBNote home"}>
      <span className="bb-brand-mark__pill">bb</span>
      <span className="bb-brand-mark__title">BBNote</span>
    </Link>
  );
}
