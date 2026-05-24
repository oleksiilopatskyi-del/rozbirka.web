import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

const screens: { slug: string; title: string }[] = [
  { slug: 'header', title: 'Site header' },
]

export function ScreensIndex() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Screens</h1>
        <Button asChild variant="ghost" size="sm">
          <Link to="/">← Home</Link>
        </Button>
      </header>

      {screens.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Поки немає прототипів. Додай новий екран у{' '}
          <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
            src/screens/
          </code>{' '}
          і зареєструй його тут і у роутері.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {screens.map((s) => (
            <li key={s.slug}>
              <Link
                to={`/screens/${s.slug}`}
                className="text-primary hover:underline"
              >
                {s.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
