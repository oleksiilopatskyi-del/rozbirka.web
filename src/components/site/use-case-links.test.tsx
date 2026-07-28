import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { UseCaseLinks } from './use-case-links'

describe('UseCaseLinks', () => {
  it('connects visitors to both autorozbirka use cases', () => {
    render(
      <MemoryRouter>
        <UseCaseLinks />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('link', { name: /Облік автозапчастин/ }),
    ).toHaveAttribute('href', '/oblik-avtozapchastyn')
    expect(
      screen.getByRole('link', { name: /Облік продажів автозапчастин/ }),
    ).toHaveAttribute('href', '/oblik-prodazhiv-avtozapchastyn')
  })
})
