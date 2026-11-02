import type { SVGProps } from 'react'

/** 下向きの山形の印。選択の欄を開けることを示す。飾りなので支援技術から隠す。色は文字の色（currentColor）に従う。 */
export const ChevronDownIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg aria-hidden fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path
      d="M6 9L12 15L18 9"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)
