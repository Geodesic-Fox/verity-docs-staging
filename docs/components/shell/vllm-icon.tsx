import type { SVGAttributes } from "react"

// vLLM's mark, traced from docs/assets/logos/vllm-logo-only-light.png in
// vllm-project/vllm (Apache-2.0), without its drop shadow.
export function VllmIcon(props: SVGAttributes<SVGSVGElement>) {
  return (
    <svg viewBox="151 140 864 894" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M159 336H502V1024Z" fill="#ebb431" />
      <path d="M689 315L1007 148L775 1026H504Z" fill="#63a1fc" />
    </svg>
  )
}
