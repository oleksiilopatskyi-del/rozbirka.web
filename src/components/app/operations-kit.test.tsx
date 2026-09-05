import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { Button } from './button'
import { Field } from './field'
import { FileField, UploadList } from './file-field'
import { FormDialog, Sheet } from './form-dialog'
import { TextInput } from './input'
import { Meter } from './meter'
import { RecordIdentity } from './identity'
import { Gallery, PhotoGrid, RecordCard } from './photo'
import { PillGroup } from './pill-group'
import { SectionPanel } from './section-panel'
import { SpecGrid, SpecNote } from './spec-grid'
import { Segmented } from './segmented'
import { StepPanel, Stepper, type Step } from './stepper'
import { ToastProvider } from './toast'
import { useOperation } from './use-operation'
import { useSteps } from './use-steps'
import { Amount, DateValue, Fact, FactList, Quantity } from './value'

it('keeps the label the accessible name when a field is required', () => {
  render(
    <Field label="Назва" required>
      <TextInput />
    </Field>,
  )

  // The asterisk lives outside the label, so label text and accessible name
  // stay the same string — queries by either keep working.
  expect(screen.getByLabelText('Назва')).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Назва' })).toBeInTheDocument()
})

it('extends the accessible name without repeating it on screen', () => {
  render(
    <Field label="Кількість" srLabel="Бампер передній">
      <TextInput />
    </Field>,
  )

  expect(
    screen.getByRole('textbox', { name: 'Кількість Бампер передній' }),
  ).toBeInTheDocument()
})

it('formats money, quantities and time for reading in a column', () => {
  render(
    <FactList>
      <Fact label="Ціна">
        <Amount currency="UAH" value={8400} />
      </Fact>
      <Fact label="Кількість">
        <Quantity unit="шт" value={3} />
      </Fact>
      <Fact label="Створено">
        <DateValue value="2026-08-28T13:45:00Z" />
      </Fact>
      <Fact label="Порожнє">
        <Amount currency="UAH" value={null} />
      </Fact>
    </FactList>,
  )

  expect(screen.getByText(/8\s?400\s₴/)).toBeInTheDocument()
  expect(screen.getByText('3 шт')).toBeInTheDocument()
  expect(screen.getByText('—')).toBeInTheDocument()
  const time = screen.getByText(/28\.08\.2026/)
  expect(time.tagName).toBe('TIME')
  expect(time).toHaveAttribute('datetime', '2026-08-28T13:45:00Z')
})

it('gives a section its heading, its aside and its own actions', () => {
  render(
    <SectionPanel
      aside="4 позиції"
      footer={<Button variant="primary">Зберегти позиції</Button>}
      title="Позиції"
    >
      <p>тіло</p>
    </SectionPanel>,
  )

  const section = screen.getByRole('region', { name: 'Позиції' })
  expect(within(section).getByText('4 позиції')).toBeVisible()
  expect(
    within(section).getByRole('button', { name: 'Зберегти позиції' }),
  ).toBeVisible()
})

it('exposes an exclusive choice as a named radio group', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(
    <Segmented
      label="Тип операції"
      name="direction"
      onChange={onChange}
      options={[
        { value: 'in', label: 'Надходження' },
        { value: 'out', label: 'Витрата' },
      ]}
      value="in"
    />,
  )

  expect(screen.getByRole('radio', { name: 'Надходження' })).toBeChecked()
  await user.click(screen.getByRole('radio', { name: 'Витрата' }))
  expect(onChange).toHaveBeenCalledWith('out')
})

const photos = [
  { id: '1', url: '/one.jpg', alt: 'Бампер спереду' },
  { id: '2', url: '/two.jpg' },
]

it('opens a photo full size and says which one of how many', async () => {
  const user = userEvent.setup()
  render(<PhotoGrid label="Фото деталі" photos={photos} />)

  expect(screen.getByRole('list', { name: 'Фото деталі' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Бампер спереду' }))

  const dialog = screen.getByRole('dialog', { name: 'Фото деталі' })
  expect(within(dialog).getByRole('img')).toHaveAttribute('src', '/one.jpg')
  expect(within(dialog).getByText(/1 з 2/)).toBeVisible()
})

it('pages the viewer with on-screen controls, not only the keyboard', async () => {
  const user = userEvent.setup()
  render(<Gallery label="Фото деталі" photos={photos} />)

  await user.click(
    screen.getByRole('button', {
      name: 'Бампер спереду — відкрити на весь екран',
    }),
  )
  const viewer = screen.getByRole('dialog', { name: 'Фото деталі' })
  expect(within(viewer).getByText(/1 з 2/)).toBeVisible()

  // A viewer that only answers to arrow keys is unusable on a phone.
  await user.click(
    within(viewer).getByRole('button', { name: 'Наступне фото' }),
  )
  expect(within(viewer).getByText(/2 з 2/)).toBeVisible()

  // Past the last photo it wraps rather than dead-ending.
  await user.click(
    within(viewer).getByRole('button', { name: 'Наступне фото' }),
  )
  expect(within(viewer).getByText(/1 з 2/)).toBeVisible()
})

it('lets a thumbnail change the large frame before anything is opened', async () => {
  const user = userEvent.setup()
  render(<Gallery label="Фото деталі" photos={photos} />)

  expect(screen.getByText('01 / 02')).toBeVisible()
  // Picking a thumbnail is a look, not a commitment: the frame follows, and
  // the viewer stays shut until the frame itself is clicked.
  await user.click(
    screen.getByRole('button', { name: 'Показати Фото деталі 2' }),
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByText('02 / 02')).toBeVisible()

  await user.click(
    screen.getByRole('button', {
      name: 'Фото деталі 2 — відкрити на весь екран',
    }),
  )
  const viewer = screen.getByRole('dialog', { name: 'Фото деталі' })
  expect(within(viewer).getByText(/2 з 2/)).toBeVisible()
})

it('says a gallery is empty in the caller\u2019s own words', () => {
  render(
    <Gallery
      emptyLabel="Фото цього авто ще немає."
      label="Фото деталі"
      photos={[]}
    />,
  )

  expect(screen.getByText('Фото цього авто ще немає.')).toBeVisible()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('says a record has no photos instead of rendering an empty strip', () => {
  render(<PhotoGrid label="Фото деталі" photos={[]} />)

  expect(screen.getByText('Фото ще не додано')).toBeVisible()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})

it('lays specs out as cells and keeps a note beside the value it explains', () => {
  render(
    <SpecGrid
      specs={[
        { label: 'OEM', value: '—' },
        { label: 'Стан', value: 'Вживана' },
        {
          label: 'Сумісність',
          value: 'Ford Focus',
          note: <SpecNote>Сумісність недоступна для редагування</SpecNote>,
          wide: true,
        },
      ]}
    />,
  )

  const compat = screen.getByText('Сумісність')
  expect(compat.parentElement).toHaveTextContent('Ford Focus')
  expect(compat.parentElement).toHaveTextContent(
    'Сумісність недоступна для редагування',
  )
  expect(screen.getAllByRole('term')).toHaveLength(3)
})

it('keeps a pill group one tab stop and announces the current choice', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(
    <PillGroup
      label="Статус"
      onChange={onChange}
      options={[
        { value: '', label: 'Усі' },
        { value: 'active', label: 'Активні' },
      ]}
      value="active"
    />,
  )

  const group = screen.getByRole('radiogroup', { name: 'Статус' })
  expect(within(group).getByRole('radio', { name: 'Активні' })).toBeChecked()
  await user.click(within(group).getByRole('radio', { name: 'Усі' }))
  expect(onChange).toHaveBeenCalledWith('')
})

it('renders a record card with its identity, meta and status', () => {
  render(
    <RecordCard
      href="/app/koval/parts/1"
      meta="OEM 51117184706"
      photo={{ url: '/part.jpg' }}
      status={<span>Доступно</span>}
      title="Бампер передній"
    />,
  )

  const card = screen.getByRole('link', { name: /Бампер передній/ })
  expect(card).toHaveAttribute('href', '/app/koval/parts/1')
  expect(within(card).getByText('OEM 51117184706')).toBeVisible()
  expect(within(card).getByText('Доступно')).toBeVisible()
})

const steps: Step[] = [
  { key: 'source', title: 'Джерело' },
  { key: 'about', title: 'Опис' },
  { key: 'photos', title: 'Фото' },
]

function CreateFlow({ blocked = false }: { blocked?: boolean }) {
  const model = blocked
    ? steps.map((step, index) =>
        index === 0 ? { ...step, error: 'Оберіть авто' } : step,
      )
    : steps
  const wizard = useSteps(model)

  return (
    <>
      <Stepper current={wizard.index} onSelect={wizard.goTo} steps={model} />
      <StepPanel step={wizard.step}>
        <p>Крок: {wizard.step.title}</p>
      </StepPanel>
      <Button disabled={!wizard.canAdvance} onClick={wizard.next}>
        Далі
      </Button>
      <Button disabled={wizard.isFirst} onClick={wizard.back}>
        Назад
      </Button>
    </>
  )
}

it('walks a creation flow forward and back without losing the way', async () => {
  const user = userEvent.setup()
  render(<CreateFlow />)

  expect(screen.getByText('Крок: Джерело')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Далі' }))
  expect(screen.getByText('Крок: Опис')).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Назад' }))
  expect(screen.getByText('Крок: Джерело')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Крок 1 з 3: Джерело' }),
  ).toHaveAttribute('aria-current', 'step')
})

it('refuses to advance past a step that is still missing something', async () => {
  const user = userEvent.setup()
  render(<CreateFlow blocked />)

  expect(screen.getByRole('button', { name: 'Далі' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Крок 1 з 3: Джерело' }))
  expect(screen.getByText('Крок: Джерело')).toBeVisible()
})

function DeleteProbe({ fail = false }: { fail?: boolean }) {
  const remove = useOperation(
    () =>
      fail ? Promise.reject(new Error('Деталь у резерві')) : Promise.resolve(1),
    {
      successMessage: 'Деталь видалено',
      errorMessage: (error) =>
        `${error instanceof Error ? error.message : 'Помилка'}. Зніміть резерв і повторіть.`,
    },
  )

  return (
    <>
      <Button {...remove.triggerProps} onClick={remove.run} variant="danger">
        Видалити
      </Button>
      {remove.error === null ? null : <p role="alert">{remove.error}</p>}
    </>
  )
}

it('confirms a finished operation instead of finishing silently', async () => {
  const user = userEvent.setup()
  render(
    <ToastProvider>
      <DeleteProbe />
    </ToastProvider>,
  )

  await user.click(screen.getByRole('button', { name: 'Видалити' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Деталь видалено'),
  )
})

it('keeps a failed operation on screen with the way out of it', async () => {
  const user = userEvent.setup()
  render(
    <ToastProvider>
      <DeleteProbe fail />
    </ToastProvider>,
  )

  await user.click(screen.getByRole('button', { name: 'Видалити' }))
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Деталь у резерві. Зніміть резерв і повторіть.',
    ),
  )
})

function DialogProbe() {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState('')

  return (
    <>
      <Button onClick={() => setOpen(true)}>Нова роль</Button>
      <FormDialog
        onOpenChange={setOpen}
        onSubmit={(event) => {
          event.preventDefault()
          setSaved('Менеджер')
          setOpen(false)
        }}
        open={open}
        submitLabel="Створити роль"
        title="Нова роль"
      >
        <Field label="Назва ролі">
          <TextInput />
        </Field>
      </FormDialog>
      <p>{saved}</p>
    </>
  )
}

it('runs a form inside a dialog and closes it on success', async () => {
  const user = userEvent.setup()
  render(<DialogProbe />)

  await user.click(screen.getByRole('button', { name: 'Нова роль' }))
  const dialog = screen.getByRole('dialog', { name: 'Нова роль' })
  expect(
    within(dialog).getByRole('textbox', { name: 'Назва ролі' }),
  ).toBeVisible()

  await user.click(
    within(dialog).getByRole('button', { name: 'Створити роль' }),
  )
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  expect(screen.getByText('Менеджер')).toBeVisible()
})

it('holds a dialog open while its request is still running', async () => {
  const user = userEvent.setup()
  render(
    <FormDialog
      onOpenChange={vi.fn()}
      onSubmit={vi.fn()}
      open
      pending
      submitLabel="Зберегти"
      title="Права"
    >
      <p>тіло</p>
    </FormDialog>,
  )

  const dialog = screen.getByRole('dialog', { name: 'Права' })
  expect(
    within(dialog).getByRole('button', { name: 'Зберегти' }),
  ).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(screen.getByRole('dialog', { name: 'Права' })).toBeVisible()
})

it('offers filters in a sheet on a narrow screen', () => {
  render(
    <Sheet onOpenChange={vi.fn()} open title="Фільтри">
      <Field label="Марка">
        <TextInput />
      </Field>
    </Sheet>,
  )

  const sheet = screen.getByRole('dialog', { name: 'Фільтри' })
  expect(within(sheet).getByRole('textbox', { name: 'Марка' })).toBeVisible()
})

it('lists uploads with their state and a way to retry or drop each', async () => {
  const user = userEvent.setup()
  const onRetry = vi.fn()
  const onRemove = vi.fn()
  render(
    <>
      <Field hint="До 10 файлів" label="Додати фото">
        <FileField />
      </Field>
      <UploadList
        items={[
          { id: '1', name: 'front.jpg', size: 2048, status: 'uploaded' },
          {
            id: '2',
            name: 'back.jpg',
            status: 'failed',
            error: 'Файл завеликий',
          },
        ]}
        label="Вибрані фото"
        onRemove={onRemove}
        onRetry={onRetry}
      />
    </>,
  )

  expect(screen.getByLabelText('Додати фото')).toHaveAttribute('type', 'file')
  expect(screen.getByText('2 КБ')).toBeVisible()
  expect(screen.getByText('Файл завеликий')).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Повторити back.jpg' }))
  expect(onRetry).toHaveBeenCalledOnce()
  await user.click(screen.getByRole('button', { name: 'Прибрати front.jpg' }))
  expect(onRemove).toHaveBeenCalledOnce()
})

it('offers a toggle-button group where every option stays Tab-reachable', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(
    <Segmented
      as="toggle"
      label="Період"
      name="period"
      onChange={onChange}
      options={[
        { value: 'day', label: 'День' },
        { value: 'week', label: 'Тиждень' },
      ]}
      value="day"
    />,
  )

  const day = screen.getByRole('button', { name: 'День' })
  const week = screen.getByRole('button', { name: 'Тиждень' })
  expect(day).toHaveAttribute('aria-pressed', 'true')

  await user.tab()
  expect(day).toHaveFocus()
  await user.tab()
  expect(week).toHaveFocus()

  await user.click(week)
  expect(onChange).toHaveBeenCalledWith('week')
})

it('runs an operation without a toast provider and reports success in place', async () => {
  const user = userEvent.setup()

  function Probe() {
    const save = useOperation(() => Promise.resolve('saved'))
    return (
      <>
        <Button {...save.triggerProps} onClick={save.run}>
          Зберегти
        </Button>
        {save.succeeded ? <p role="status">Збережено</p> : null}
      </>
    )
  }

  render(<Probe />)
  await user.click(screen.getByRole('button', { name: 'Зберегти' }))
  await waitFor(() =>
    expect(screen.getByRole('status')).toHaveTextContent('Збережено'),
  )
})

it('reads a figure against the limit that gives it meaning', () => {
  render(
    <>
      <Meter
        label="Повернено від вкладеного"
        max={12000}
        value={5000}
        valueLabel="5 000 ₴"
      />
      <Meter
        label="Повернено від вкладеного в A-104"
        max={10000}
        tone="ok"
        value={15300}
        valueLabel="15 300 ₴"
      />
      <Meter
        emptyLabel="немає продажів"
        label="Повернено від вкладеного в A-200"
        max={null}
        value={null}
        valueLabel="—"
      />
    </>,
  )

  expect(
    screen.getByRole('progressbar', { name: 'Повернено від вкладеного' }),
  ).toHaveAttribute('aria-valuenow', '42')

  // Past the limit the track rescales, so the limit keeps a readable position
  // and the excess is drawn to scale rather than collapsing into a full bar.
  const over = screen.getByRole('progressbar', {
    name: 'Повернено від вкладеного в A-104',
  })
  expect(over).toHaveAttribute('aria-valuenow', '153')
  const [upToLimit, , beyond] = [...(over.firstElementChild?.children ?? [])]
  expect(upToLimit).toHaveStyle({ width: `${String((100 / 153) * 100)}%` })
  expect(beyond).toHaveStyle({ width: `${String((53 / 153) * 100)}%` })

  // Nothing to measure yet says so instead of drawing an empty bar.
  expect(screen.getByText('немає продажів')).toBeVisible()
  expect(screen.getAllByRole('progressbar')).toHaveLength(2)
})

it('introduces a record by its own name with the specification under it', () => {
  render(
    <RecordIdentity
      photoUrl={null}
      subtitle="Tesla Model Y (2023)"
      title="A-104"
    />,
  )

  expect(screen.getByText('A-104')).toBeVisible()
  expect(screen.getByText('Tesla Model Y (2023)')).toBeVisible()
})
