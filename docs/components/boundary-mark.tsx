export type LogoVariant =
  | "asymmetric"
  | "broken-corner"
  | "calibrated"
  | "implied"
  | "inner-threshold"
  | "nested"
  | "offset"
  | "open-seal"
  | "proof-gap"
  | "verified"
  | "proof-port"
  | "stepped"
  | "witness-edge"
  | "witnessed"

export function BoundaryMark({
  className,
  strokeWidth = 3,
  variant = "implied",
}: {
  className?: string
  strokeWidth?: number
  variant?: LogoVariant
}) {
  const baseProps = {
    stroke: "currentColor",
    strokeLinecap: "square" as const,
    strokeLinejoin: "miter" as const,
    strokeWidth,
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      role="img"
      viewBox="0 0 72 64"
    >
      {variant === "asymmetric" ? (
        <path d="M26 10H10V29 M45 54H62V37" {...baseProps} />
      ) : null}
      {variant === "broken-corner" ? (
        <>
          <path d="M24 10H10 M10 18V28" {...baseProps} />
          <path d="M48 54H62V40" {...baseProps} />
        </>
      ) : null}
      {variant === "calibrated" ? (
        <>
          <path d="M28 10H10V24 M46 54H62V36" {...baseProps} />
          <path d="M56 48H62" {...baseProps} />
        </>
      ) : null}
      {variant === "implied" ? (
        <path d="M24 10H10V24 M48 54H62V40" {...baseProps} />
      ) : null}
      {variant === "inner-threshold" ? (
        <>
          <path d="M26 10H10V28 M46 54H62V36" {...baseProps} />
          <path d="M33 32H43" {...baseProps} />
        </>
      ) : null}
      {variant === "offset" ? (
        <path d="M26 9H10V24 M45 55H63V38" {...baseProps} />
      ) : null}
      {variant === "open-seal" ? (
        <>
          <path d="M25 10H10V26 M47 54H62V38" {...baseProps} />
          <path d="M10 32V36" {...baseProps} />
        </>
      ) : null}
      {variant === "proof-gap" ? (
        <>
          <path d="M25 10H10V26 M48 54H62V40" {...baseProps} />
          <path d="M58 54H68" {...baseProps} />
        </>
      ) : null}
      {variant === "verified" ? (
        <>
          <path d="M24 10H10V24 M48 54H62V40" {...baseProps} />
          <path d="M30 32H42" {...baseProps} />
        </>
      ) : null}
      {variant === "proof-port" ? (
        <>
          <path d="M24 10H10V24 M48 54H62V40" {...baseProps} />
          <path d="M58 54H68" {...baseProps} />
        </>
      ) : null}
      {variant === "stepped" ? (
        <path d="M28 10H10V25 M44 54H62V45H56V36" {...baseProps} />
      ) : null}
      {variant === "witness-edge" ? (
        <>
          <path d="M26 10H10V28 M47 54H62V37" {...baseProps} />
          <path d="M56 58H66" {...baseProps} />
        </>
      ) : null}
      {variant === "witnessed" ? (
        <>
          <path d="M24 10H10V24 M48 54H62V40" {...baseProps} />
          <path d="M54 58H66V46" {...baseProps} />
        </>
      ) : null}
      {variant === "nested" ? (
        <>
          <path d="M24 10H10V24 M48 54H62V40" {...baseProps} />
          <path d="M34 25H26V33 M38 39H46V31" {...baseProps} />
        </>
      ) : null}
    </svg>
  )
}
