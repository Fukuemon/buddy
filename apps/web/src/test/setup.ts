import '@testing-library/jest-dom/vitest'
import { setProjectAnnotations } from '@storybook/react-vite'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vite-plus/test'

import preview from '../../.storybook/preview'

setProjectAnnotations(preview)

afterEach(() => {
  cleanup()
})
