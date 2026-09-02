import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { Button } from './button'
import { ConfirmDialog } from './confirm-dialog'
import { DataTable } from './data-table'
import { Field } from './field'
import { TextInput } from './input'
import { Pagination } from './pagination'
import { EmptyState } from './state-screen'
import { ToastProvider } from './toast'
import { useToast } from './toast-context'

it('names a field control by its label and describes it with the hint', () => {
  render(
    <Field hint="Як на накладній" label="Назва" required>
      <TextInput />
    </Field>,
  )

  const input = screen.getByRole('textbox', { name: 'Назва' })
  expect(input).toHaveAccessibleDescription('Як на накладній')
  expect(input).not.toHaveAttribute('aria-invalid')
})

it('replaces the hint with the error and marks the control invalid', () => {
  render(
    <Field
      error="Вкажіть щонайменше 1"
      hint="Як на накладній"
      label="Кількість"
    >
      <TextInput />
    </Field>,
  )

  const input = screen.getByRole('textbox', { name: 'Кількість' })
  expect(input).toHaveAccessibleDescription('Вкажіть щонайменше 1')
  expect(input).toHaveAttribute('aria-invalid', 'true')
})

it('defaults buttons to type="button" and forwards rendering to a child link', () => {
  render(
    <>
      <Button>Зберегти</Button>
      <Button asChild>
        <a href="/app/koval/parts">Деталі</a>
      </Button>
    </>,
  )

  expect(screen.getByRole('button', { name: 'Зберегти' })).toHaveAttribute(
    'type',
    'button',
  )
  expect(screen.getByRole('link', { name: 'Деталі' })).toHaveAttribute(
    'href',
    '/app/koval/parts',
  )
})

interface Part {
  id: string
  name: string
  price: number
}

const partColumns = [
  {
    key: 'name',
    label: 'Деталь',
    variant: 'primary' as const,
    cell: (part: Part) => part.name,
  },
  {
    key: 'price',
    label: 'Ціна',
    align: 'end' as const,
    cell: (part: Part) => `${String(part.price)} ₴`,
  },
]

it('keeps table semantics and labels every cell for the stacked layout', () => {
  render(
    <DataTable
      caption="Список деталей"
      columns={partColumns}
      rowKey={(part) => part.id}
      rows={[{ id: '1', name: 'Бампер передній', price: 8400 }]}
    />,
  )

  expect(screen.getByRole('table', { name: 'Список деталей' })).toBeVisible()
  expect(
    screen.getByRole('columnheader', { name: 'Деталь' }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('cell', { name: 'Бампер передній' }),
  ).not.toHaveAttribute('data-label')
  expect(screen.getByRole('cell', { name: '8400 ₴' })).toHaveAttribute(
    'data-label',
    'Ціна',
  )
})

it('shows the empty state instead of the body but keeps the footer', () => {
  render(
    <DataTable
      caption="Список деталей"
      columns={partColumns}
      empty={<EmptyState title="Тут поки порожньо" />}
      footer={<p>Сторінка 2 з 3</p>}
      rowKey={(part) => part.id}
      rows={[]}
    />,
  )

  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  expect(screen.getByText('Тут поки порожньо')).toBeVisible()
  expect(screen.getByText('Сторінка 2 з 3')).toBeVisible()
})

it('reports the visible range and blocks the edges of pagination', async () => {
  const onPage = vi.fn()
  const user = userEvent.setup()
  render(
    <Pagination
      onPage={onPage}
      page={1}
      pageSize={30}
      total={1248}
      totalPages={42}
    />,
  )

  expect(screen.getByText('1–30 з 1248')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Попередня сторінка' }),
  ).toBeDisabled()

  await user.click(screen.getByRole('button', { name: 'Наступна сторінка' }))
  expect(onPage).toHaveBeenCalledWith(2)
})

function ToastProbe() {
  const toast = useToast()
  return (
    <Button
      onClick={() => {
        toast.show({ message: 'Деталь збережено', tone: 'ok' })
      }}
    >
      Зберегти
    </Button>
  )
}

it('announces a toast and dismisses it on request', async () => {
  const user = userEvent.setup()
  render(
    <ToastProvider>
      <ToastProbe />
    </ToastProvider>,
  )

  await user.click(screen.getByRole('button', { name: 'Зберегти' }))
  expect(screen.getByRole('status')).toHaveTextContent('Деталь збережено')

  await user.click(screen.getByRole('button', { name: 'Закрити сповіщення' }))
  expect(screen.queryByText('Деталь збережено')).not.toBeInTheDocument()
})

function ConfirmProbe({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Видалити</Button>
      <ConfirmDialog
        confirmLabel="Видалити деталь"
        consequence="Історія продажів і резерви зникнуть назавжди."
        onConfirm={onConfirm}
        onOpenChange={setOpen}
        open={open}
        title="Видалити деталь?"
      />
    </>
  )
}

it('confirms a destructive action through its consequence', async () => {
  const onConfirm = vi.fn()
  const user = userEvent.setup()
  render(<ConfirmProbe onConfirm={onConfirm} />)

  await user.click(screen.getByRole('button', { name: 'Видалити' }))
  expect(
    screen.getByRole('dialog', { name: 'Видалити деталь?' }),
  ).toHaveAccessibleDescription('Історія продажів і резерви зникнуть назавжди.')
  // A destructive question opens on the way out of it.
  expect(screen.getByRole('button', { name: 'Скасувати' })).toHaveFocus()

  await user.click(screen.getByRole('button', { name: 'Видалити деталь' }))
  expect(onConfirm).toHaveBeenCalledOnce()
})
