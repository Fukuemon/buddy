import type { Meta, StoryObj } from '@storybook/react-vite'

import { AuthErrorMessage } from './AuthErrorMessage'

const meta = {
  title: '画面/Common/AuthErrorMessage',
  component: AuthErrorMessage,
  args: { reason: 'failed', loginHref: '/auth/login' },
} satisfies Meta<typeof AuthErrorMessage>

export default meta
type Story = StoryObj<typeof meta>

export const Failed: Story = {}

export const Forbidden: Story = { args: { reason: 'forbidden' } }

export const TooManyAttempts: Story = { args: { reason: 'too_many_attempts' } }

export const Denied: Story = { args: { reason: 'denied' } }

export const AccountMismatch: Story = { args: { reason: 'account_mismatch' } }

export const Interrupted: Story = { args: { reason: 'interrupted' } }
