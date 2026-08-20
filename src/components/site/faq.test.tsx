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

it('publishes the canonical trial and team limits', async () => {
  const user = userEvent.setup()
  render(<FAQ />)

  await user.click(
    screen.getByRole('button', { name: 'Як працює безкоштовний період?' }),
  )
  expect(screen.getByText(/14 днів Pro-рівня/i)).toBeInTheDocument()

  await user.click(
    screen.getByRole('button', {
      name: 'Скільки людей з команди можуть працювати одночасно?',
    }),
  )
  expect(screen.getByText(/Pro — 5 користувачів/i)).toBeInTheDocument()
  expect(screen.queryByText(/Lite — 1 користувач/i)).toBeNull()
  expect(screen.queryByText(/Сім днів|7 днів/)).toBeNull()
})
