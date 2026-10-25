import { useNavigate, useSearch } from '@tanstack/react-router'

import { ScheduleCancelledToggle } from './ScheduleCancelledToggle'

/** `/schedule` の search params の cancelled を読み書きする。 */
export const ScheduleCancelledToggleContainer = () => {
  const { cancelled } = useSearch({ from: '/schedule' })
  const navigate = useNavigate({ from: '/schedule' })
  return (
    <ScheduleCancelledToggle
      checked={cancelled}
      onChange={(checked) => navigate({ search: (prev) => ({ ...prev, cancelled: checked }) })}
    />
  )
}
