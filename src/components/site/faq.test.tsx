import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import { FAQ } from './faq'

it('removes closed answers from the accessibility tree', async () => {
  const user = userEvent.setup()
  render(<FAQ />)
  const first = screen.getByRole('button', {
    name: 'Чи бачу я прибуток окремо по кожному авто?',
  })
  expect(
    screen.getByRole('region', {
      name: 'Чи бачу я прибуток окремо по кожному авто?',
    }),
  ).toBeInTheDocument()

  await user.click(first)

  expect(
    screen.queryByRole('region', {
      name: 'Чи бачу я прибуток окремо по кожному авто?',
    }),
  ).toBeNull()
})
