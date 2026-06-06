import { Link } from 'react-router'
import { BrandLogo } from '@/components/site/brand-logo'

export function PrivacyScreen() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <Link to="/" aria-label="Rozbirka">
            <BrandLogo />
          </Link>
          <Link
            to="/"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            На головну →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <p className="text-sm font-medium uppercase tracking-wider text-brand">
          Privacy Policy · Політика конфіденційності
        </p>
        <h1 className="mt-4 text-4xl font-light tracking-tight md:text-5xl">
          Як ми поводимось з даними
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Чинна з: 06 червня 2026 р.
        </p>

        <div className="prose-content mt-12 space-y-10 text-[15px] leading-relaxed text-foreground/85">
          <section>
            <h2 className="mb-3 text-xl font-medium text-foreground">
              1. Хто ми
            </h2>
            <p>
              Rozbirka — платформа для обліку діяльності авторозбірок:
              облік авто, складу запчастин, замовлень, кас і команди. Доступна
              як веб-застосунок на rozbirka.com та мобільний додаток для iOS.
            </p>
            <p className="mt-3">
              Контролером даних (data controller) щодо персональних даних
              користувачів виступає власник сервісу Rozbirka. Для зв'язку —{' '}
              <a
                href="mailto:support@rozbirka.com"
                className="text-brand underline-offset-2 hover:underline"
              >
                support@rozbirka.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-medium text-foreground">
              2. Які дані ми збираємо
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Дані акаунту:</strong> номер телефону (для входу через
                одноразовий код), ім'я для відображення, роль у розбірці.
              </li>
              <li>
                <strong>Бізнес-дані:</strong> інформація про авто, деталі,
                партії надходжень, замовлення, клієнтів, фінансові операції,
                фото та документи — все це створюється самим користувачем у
                межах своєї розбірки.
              </li>
              <li>
                <strong>Платіжні дані:</strong> для оплати підписки ми не
                зберігаємо номери карток. Платежі обробляє{' '}
                <strong>Monobank (Mono Acquiring)</strong> згідно з PCI DSS.
                Ми отримуємо тільки маскований номер картки (останні 4 цифри)
                та платіжний токен.
              </li>
              <li>
                <strong>Технічні дані:</strong> IP-адреса, тип пристрою, версія
                ОС, журнал входів/дій — для безпеки та усунення помилок.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-medium text-foreground">
              3. Як ми використовуємо дані
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>Надавати функціональність сервісу (вхід, облік, аналітика).</li>
              <li>Обробляти підписку та платежі (через Monobank).</li>
              <li>Сповіщати про важливі зміни в обліковому записі чи сервісі.</li>
              <li>Запобігати шахрайству, зловживанням і несанкціонованому
                доступу.</li>
              <li>Покращувати продукт на основі знеособлених метрик
                використання.</li>
            </ul>
            <p className="mt-3">
              <strong>Ми НЕ продаємо</strong> ваші дані третім сторонам і не
              використовуємо їх для рекламного таргетингу.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-medium text-foreground">
              4. З ким ми ділимось даними
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Monobank</strong> — обробка платежів за підписку.
              </li>
              <li>
                <strong>Постачальники хмарної інфраструктури</strong> (Google
                Cloud, Cloudflare) — для розміщення сервісу та зберігання
                даних на захищених серверах.
              </li>
              <li>
                <strong>SMS-провайдер</strong> — для доставки одноразових
                кодів авторизації на номер телефону.
              </li>
              <li>
                <strong>Apple / Google</strong> — для розповсюдження мобільного
                застосунку та аналітики аварій (опційно).
              </li>
              <li>
                <strong>Державні органи</strong> — лише на вимогу законодавства
                України.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-medium text-foreground">
              5. Скільки ми зберігаємо ваші дані
            </h2>
            <p>
              Дані зберігаються, поки активний ваш обліковий запис. Після
              видалення акаунту персональні дані видаляються або знеособлюються
              впродовж 30 днів, окрім випадків коли законодавство (бухгалтерія,
              податковий облік) вимагає тривалішого зберігання.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-medium text-foreground">
              6. Ваші права
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Доступ:</strong> отримати копію своїх даних.
              </li>
              <li>
                <strong>Виправлення:</strong> змінити будь-які неточні дані
                через налаштування акаунту або написавши нам.
              </li>
              <li>
                <strong>Видалення:</strong> видалити обліковий запис разом з
                усіма пов'язаними даними.
              </li>
              <li>
                <strong>Експорт:</strong> отримати ваші дані у машинно-читаному
                форматі (CSV / JSON).
              </li>
              <li>
                <strong>Скарга:</strong> звернутися до Уповноваженого Верховної
                Ради України з прав людини.
              </li>
            </ul>
            <p className="mt-3">
              Щоб скористатися будь-яким із цих прав — напишіть на{' '}
              <a
                href="mailto:support@rozbirka.com"
                className="text-brand underline-offset-2 hover:underline"
              >
                support@rozbirka.com
              </a>
              . Ми відповімо протягом 30 днів.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-medium text-foreground">
              7. Безпека
            </h2>
            <p>
              Усе передається через HTTPS (TLS 1.2+). Паролі/токени зберігаємо
              в захешованому вигляді. Регулярно оновлюємо залежності й
              моніторимо доступ. Жодна система не дає 100% гарантії, але ми
              застосовуємо галузеві стандарти захисту.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-medium text-foreground">
              8. Дані дітей
            </h2>
            <p>
              Rozbirka — інструмент для бізнесу й не призначений для осіб
              молодше 16 років. Ми свідомо не збираємо персональні дані дітей.
              Якщо ви вважаєте, що ми отримали такі дані випадково — напишіть
              нам, і ми видалимо їх.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-medium text-foreground">
              9. Зміни цієї політики
            </h2>
            <p>
              Якщо ми внесемо суттєві зміни, повідомимо вас через email або
              сповіщенням у застосунку щонайменше за 14 днів до набрання чинності.
              Поточну версію завжди можна знайти за цією адресою.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-medium text-foreground">
              10. Контакти
            </h2>
            <p>
              Питання чи запити щодо ваших даних —{' '}
              <a
                href="mailto:support@rozbirka.com"
                className="text-brand underline-offset-2 hover:underline"
              >
                support@rozbirka.com
              </a>
              .
            </p>
          </section>

          <hr className="my-12 border-border/40" />

          <section className="text-sm text-muted-foreground">
            <p className="font-medium uppercase tracking-wider text-foreground">
              English summary
            </p>
            <p className="mt-3">
              Rozbirka collects only the data needed to operate the service:
              your phone number for login, your business inventory data
              (cars, parts, orders, customers, photos) — all created by you
              within your own organization, and minimal technical logs for
              security. We use Monobank to process subscription payments and
              don't store card numbers ourselves. We never sell your data or
              use it for advertising. You can request access, correction,
              export, or deletion at any time by emailing{' '}
              <a
                href="mailto:support@rozbirka.com"
                className="text-brand underline-offset-2 hover:underline"
              >
                support@rozbirka.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/40 py-10 text-center text-sm text-muted-foreground">
        © 2026 Rozbirka ·{' '}
        <a
          href="mailto:support@rozbirka.com"
          className="hover:text-foreground"
        >
          support@rozbirka.com
        </a>
      </footer>
    </div>
  )
}
