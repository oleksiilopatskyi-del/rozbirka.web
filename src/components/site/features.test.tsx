import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Features } from './features'

describe('Features carousel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('exposes previous, next, and persistent pause controls', async () => {
    const user = userEvent.setup()
    render(<Features />)
    expect(
      screen.getByRole('button', { name: 'Попередня' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Наступна' })).toBeInTheDocument()
    const pause = screen.getByRole('button', { name: 'Зупинити автопрокрутку' })
    await user.click(pause)
    expect(
      screen.getByRole('button', { name: 'Увімкнути автопрокрутку' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('starts paused when reduced motion is requested', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
    render(<Features />)
    expect(
      screen.getByRole('button', { name: 'Увімкнути автопрокрутку' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not advertise unsupported analytics capability', () => {
    render(<Features />)
    expect(screen.queryByText('Аналітика')).not.toBeInTheDocument()
    expect(screen.queryByText(/Динаміка продажів/)).not.toBeInTheDocument()
  })

  it('pauses autoplay while a carousel control is focused', () => {
    vi.useFakeTimers()
    const { container } = render(<Features />)
    const scroller = container.querySelector<HTMLUListElement>(
      '#features ul.overflow-x-auto',
    )!
    const scroll = vi.fn()
    scroller.scrollBy = scroll
    scroller.scrollTo = scroll

    const next = screen.getByRole('button', { name: 'Наступна' })
    fireEvent.focusIn(next)
    act(() => {
      vi.advanceTimersByTime(3500)
    })

    expect(scroll).not.toHaveBeenCalled()

    fireEvent.focusOut(next, { relatedTarget: document.body })
    act(() => {
      vi.advanceTimersByTime(3500)
    })
    expect(scroll).toHaveBeenCalledOnce()
  })

  it('stays interaction-paused when user pause is toggled off on a focused control', () => {
    vi.useFakeTimers()
    const { container } = render(<Features />)
    const scroller = container.querySelector<HTMLUListElement>(
      '#features ul.overflow-x-auto',
    )!
    const scroll = vi.fn()
    scroller.scrollBy = scroll
    scroller.scrollTo = scroll
    const pause = screen.getByRole('button', {
      name: 'Зупинити автопрокрутку',
    })

    fireEvent.focusIn(pause)
    fireEvent.click(pause)
    fireEvent.click(
      screen.getByRole('button', { name: 'Увімкнути автопрокрутку' }),
    )
    act(() => {
      vi.advanceTimersByTime(3500)
    })

    expect(scroll).not.toHaveBeenCalled()
  })

  it('pauses autoplay while a control is hovered and resumes after leaving', () => {
    vi.useFakeTimers()
    const { container } = render(<Features />)
    const scroller = container.querySelector<HTMLUListElement>(
      '#features ul.overflow-x-auto',
    )!
    const scroll = vi.fn()
    scroller.scrollBy = scroll
    scroller.scrollTo = scroll
    const next = screen.getByRole('button', { name: 'Наступна' })

    fireEvent.mouseOver(next)
    act(() => {
      vi.advanceTimersByTime(3500)
    })
    expect(scroll).not.toHaveBeenCalled()

    fireEvent.mouseOut(next, { relatedTarget: document.body })
    act(() => {
      vi.advanceTimersByTime(3500)
    })
    expect(scroll).toHaveBeenCalledOnce()
  })

  it('stays interaction-paused when user pause is toggled off on a hovered control', () => {
    vi.useFakeTimers()
    const { container } = render(<Features />)
    const scroller = container.querySelector<HTMLUListElement>(
      '#features ul.overflow-x-auto',
    )!
    const scroll = vi.fn()
    scroller.scrollBy = scroll
    scroller.scrollTo = scroll
    const pause = screen.getByRole('button', {
      name: 'Зупинити автопрокрутку',
    })

    fireEvent.mouseOver(pause)
    fireEvent.click(pause)
    fireEvent.click(
      screen.getByRole('button', { name: 'Увімкнути автопрокрутку' }),
    )
    act(() => {
      vi.advanceTimersByTime(3500)
    })

    expect(scroll).not.toHaveBeenCalled()
  })
})
