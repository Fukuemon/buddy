import '@testing-library/jest-dom/vitest'
import '../../.storybook/preview.css'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vite-plus/test'

afterEach(() => {
  cleanup()
})
