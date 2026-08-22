import { Fragment, type ReactNode } from 'react'
import { THIN_SPACE } from '@/lib/format'

/** Renders grouped numbers with a hair-thin gap instead of a full mono space. */
export function GroupedNumber({ value }: { value: string }): ReactNode {
  const parts = value.split(THIN_SPACE)
  if (parts.length === 1) return value
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && <span className="inline-block w-[0.12em]" aria-hidden />}
      {part}
    </Fragment>
  ))
}
