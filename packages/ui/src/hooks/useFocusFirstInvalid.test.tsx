import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vite-plus/test'

import { FormField, formFieldControlClassName } from '../base/FormField/FormField'
import { useFocusFirstInvalid } from './useFocusFirstInvalid'

/** 名前とメールアドレスを空のまま送ると、両方に誤りを出すフォーム。 */
const TwoFieldForm = () => {
  const { ref, focusFirstInvalid } = useFocusFirstInvalid<HTMLFormElement>()
  const [isInvalid, setInvalid] = useState(false)
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        setInvalid(true)
        focusFirstInvalid()
      }}
      ref={ref}
    >
      <FormField error={isInvalid ? '名前を入れてください' : undefined} label="名前">
        {(field) => <input {...field} className={formFieldControlClassName} />}
      </FormField>
      <FormField
        error={isInvalid ? 'メールアドレスを入れてください' : undefined}
        label="メールアドレス"
      >
        {(field) => <input {...field} className={formFieldControlClassName} />}
      </FormField>
      <button type="submit">登録</button>
    </form>
  )
}

describe('useFocusFirstInvalid', () => {
  it('送った後に、最初の誤りの欄へフォーカスを移し、欄の説明で誤りの文を伝える', async () => {
    render(<TwoFieldForm />)
    await userEvent.click(screen.getByRole('button', { name: '登録' }))
    const name = screen.getByRole('textbox', { name: '名前' })
    expect(name).toHaveFocus()
    expect(name).toHaveAccessibleDescription('名前を入れてください')
  })

  it('2 つ目の誤りの欄へ Tab で移ると、その欄の誤りの文を欄の説明で伝える', async () => {
    render(<TwoFieldForm />)
    await userEvent.click(screen.getByRole('button', { name: '登録' }))
    await userEvent.tab()
    const email = screen.getByRole('textbox', { name: 'メールアドレス' })
    expect(email).toHaveFocus()
    expect(email).toHaveAccessibleDescription('メールアドレスを入れてください')
  })
})
