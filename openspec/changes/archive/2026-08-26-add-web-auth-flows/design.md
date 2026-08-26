## Context

Мотивация описана в `proposal.md`, наблюдаемое поведение — в delta specs. API уже предоставляет generated operations `register`, `login`, `refreshTokens`, `logout` и `getCurrentUser`. Refresh-токен доступен только API как HttpOnly cookie с path `/api/v1/auth`; web server и middleware не могут использовать его для SSR-защиты. Текущий fetch mutator не отправляет credentials и не поддерживает Bearer token или refresh.

## Goals / Non-Goals

**Goals:**

- Создать одну frontend-границу session lifecycle и одну transport-границу access-токена.
- Сохранить TanStack Query единственным владельцем server-state профиля.
- Защитить текущие приватные client routes без ложного отображения пользовательских данных до восстановления.
- Не оставлять credentials или token responses в mutation cache либо persistent storage.

**Non-Goals:**

- SSR/middleware-аутентификация, background refresh timer и синхронизация access-токена между вкладками.
- Zustand store: текущего lifecycle state недостаточно, чтобы оправдать второй global-state runtime.
- Редактирование профиля или расширение backend-контракта.

## Decisions

### Transport владеет только access-токеном и single-flight refresh

`shared/api` получает ручной auth-session transport рядом с существующим mutator. Токен хранится в module closure и никогда не публикуется как React state. Каждая установка или очистка токена и смена transport configuration увеличивает монотонное auth generation. Refresh-flight хранит generation и identity configuration, поэтому переиспользуется только ожидающими того же поколения, а устаревшее завершение не может установить токен, вызвать callback новой configuration или очистить более новый flight.

`apiFetch` по умолчанию ставит `credentials: 'include'` и отправляет Bearer token из зафиксированного auth snapshot. При первом `401` transport сравнивает generation запроса с актуальным: запоздалый ответ старого токена сразу повторяется с новым токеном, а актуальный ответ ждёт single-flight refresh. Повтор выполняется ровно один раз; его окончательный `401` завершает сессию только при неизменившемся generation.

Generated `refreshTokens` остаётся единственным описанием refresh operation. Session provider регистрирует в transport callback, который вызывает generated function с `skipAuthRefresh`; transport поэтому не импортирует generated module обратно и не создаёт циклическую зависимость. До регистрации callback provider не монтирует API consumers.

Альтернатива — вручную вызвать `fetch('/auth/refresh')` внутри mutator — отклонена как дублирование generated transport-контракта. Timer refresh отклонён: retry по фактическому `401` проще и не создаёт запросов в idle-вкладке.

### Session provider хранит lifecycle, профиль остаётся в Query cache

FSD entity `session` предоставляет provider и hook со статусом `loading | authenticated | unauthenticated | error`, текущим `user` из generated current-user query и действиями restore/authenticate/logout cleanup. Provider оркестрирует refresh → current user, заполняет или очищает generated query key и регистрирует callback окончательного истечения сессии. Локальное поколение restore не позволяет устаревшему bootstrap менять query или UI status после clear, login либо reconfiguration.

Login и register вызываются imperative generated functions из React Hook Form submit handler. Это не оставляет password variables и token responses в TanStack mutation cache. После успеха provider сохраняет токен в transport и помещает `response.user` в current-user query.

Zustand отклонён: он дублировал бы lifecycle context и TanStack Query без отдельного сложного client state. Добавить его можно позже для состояния редактора/workspace, не меняя auth contract.

### Client route groups выполняют защиту после bootstrap

App Router получает публичную auth-группу и приватную группу. Client guards принадлежат application routing в `src/app/routing` и используют session hook: loading и error отрисовываются явно, unauthenticated вызывает `router.replace('/login?next=...')`, authenticated разрешает children. Auth guard выполняет обратный redirect на `/`.

Разрешённые адреса возврата перечислены явно: `/` и `/profile`; остальные значения ведут на `/`. Login и register сохраняют допустимый `next` в ссылке на противоположную форму, но не переносят неизвестные или внешние значения. Middleware не используется, потому что web origin не видит API-scoped refresh cookie, а access-токен намеренно не сохраняется между reload.

Текущая команда Steiger анализирует только `apps/web/src` и не видит imports из root `app`, поэтому для app-consumed slices сохраняются узкие исключения `fsd/insignificant-slice`. Spec-файлы исключаются из архитектурного анализа: их test-only MSW imports не являются production dependencies. Все остальные recommended FSD rules сохраняются.

Turbopack plugin runtime переключается со штатного `childProcesses` на поддерживаемый Next.js `workerThreads`: первый вариант связывает loader workers через локальные sockets и делает `pnpm build` несовместимым с sandboxed CI/agent environments. Bundler, PostCSS pipeline и production output при этом не меняются.

### Формы используют React Hook Form и Zod без transport DTO-дубликатов

Zod schemas описывают только UI validation и выводят собственные form types. Payload собирается явным выбором полей и проверяется generated `RegisterDto`/`LoginDto` через `satisfies`; `confirmPassword` не покидает форму. Верхняя граница пароля измеряется `TextEncoder` в UTF-8 байтах.

Raw API messages не показываются. UI сопоставляет известные status codes с русскими продуктовым сообщениями, а неизвестные ошибки сводит к безопасному retry message. В формах используются semantic labels, autocomplete и `aria-live`.

### Главная показывает только персонализированное приветствие

Основное содержимое `/` сохраняет `main` container и `Heading` уровня `h1` с текстом «Добро пожаловать, {name}». Brand-label, описание восстановленной сессии, CTA «Открыть профиль» и лишние вложенные layout-контейнеры удаляются; переход в профиль остаётся доступен через имя пользователя в private header. `HomePage` остаётся Client Component из-за чтения текущего пользователя через `useSession` и сохраняет безопасный fallback до появления user data.

### Профиль остаётся read-only

`/profile` читает current-user query непосредственно внутри `pages/profile` и показывает три понятных пользователю поля: `name`, `email` и `createdAt`. Отдельный `widgets/profile-view` не вводится до появления самостоятельного переиспользуемого блока. Внутренний `id` остаётся частью generated DTO, но UI его не выводит. Экран сохраняет заголовок «Профиль» и семантический список с подписями, но не использует отдельное описание, карточку, grid, рамку, фон, скругления или тень. Кнопок сохранения и локально редактируемой копии нет: без backend mutation сохранение невозможно и не должно имитироваться.

### Private header использует прямые brand и user links

`PrivateShell` не показывает отдельный navigation landmark со ссылками «Главная» и «Профиль». Текстовый логотип `Lite Notion` остаётся ссылкой на `/`, а имя текущего пользователя становится ссылкой на `/profile` рядом с logout. Username-link видим на всех viewport, имеет `max-w-24 sm:max-w-48` и `truncate`; полное имя передаётся через `title`, а при временно отсутствующем user data используется fallback «Профиль». Контейнер получает `min-w-0`, логотип — `shrink-0`, чтобы длинное имя не ломало mobile header.

Ссылка остаётся самостоятельной navigation boundary: будущая аватарка станет её визуальным содержимым, сохранив destination и доступное имя. Avatar asset, dropdown и active-route styles в этот change не входят.

### Shared typography отделяет семантику от визуального варианта

`shared/ui` предоставляет два project primitives поверх semantic HTML и существующих `cva`/`cn`. `Heading` требует явные `as="h1" | "h2" | "h3"` и `variant="hero" | "page" | "section"`, чтобы уровень документа не выводился из визуального размера. `Text` поддерживает `as="p" | "span"` с `p` по умолчанию и варианты `body | muted | small | caption | error`. Оба компонента передают стандартные DOM props и объединяют локальные layout-классы через `className`.

Размер и line-height primitives задаются Tailwind theme tokens из `typography.css`: `heading-hero` сохраняет `2.25rem/2.5rem`, `heading-page` — `1.875rem/2.25rem`, `heading-section` — `1.25rem/1.75rem`, `copy-body` — `1rem/1.5rem`, `copy-small` — `0.875rem/1.25rem`. `Heading` использует соответствующий heading token; варианты `Text` body/muted используют `copy-body`, а small/caption/error — `copy-small`. Имена `heading-*` и `copy-*` не пересекаются с текущими color token suffixes.

`tailwind-merge` по умолчанию не распознаёт project-specific `text-heading-*` и `text-copy-*` как font-size group. Общая функция `cn` расширяет только theme group `text` этими значениями, чтобы переданный последним стандартный либо semantic `text-*` через `className` продолжал переопределять размер вместе с line-height. Публичные props primitives не меняются.

Primitives задают общую типографику heading, description, loading и error states в auth, session и private screens. Form labels, definition lists, navigation links, brand eyebrow, inline links и generated shadcn primitives остаются на стандартной Tailwind scale: их отдельная семантика не оправдывает расширение typography API или расхождение с upstream. Корневой font-size `html`/`body` не переопределяется. Новых dependencies и визуального редизайна нет.

### Root App Router остаётся framework adapter

Четыре route entrypoints `/`, `/login`, `/register` и `/profile` импортируют default page components только из public API отдельных slices `src/pages/home`, `login`, `register` и `profile`. Page slices владеют `Suspense`, `main` layout и композицией features/widgets. `HomePage` и минимальный profile UI являются Client Components из-за `useSession`; остальные page components остаются Server Components и могут вкладывать client components.

Auth/private route-group layouts аналогично делегируют композицию `AuthRoute` и `PrivateRoute`/`PrivateShell` компонентам из public API `src/app/layouts` и `src/app/routing`. Root layout остаётся в `app`: Next metadata, font loading, global CSS и обязательные `<html>/<body>` являются framework concerns.

Корневой `app` является единственным Next.js App Router. Установленный Next.js 16.3 сначала независимо выбирает root `app` и `src/pages`, а затем отклоняет их разные parent directories; root `pages/.gitkeep` служит framework compatibility marker и заставляет resolver выбрать root boundary без Pages Router entrypoints. Поэтому `src/app` и `src/pages` безопасно сохраняют канонические имена FSD layers. Steiger prefix workaround не нужен; App layer использует плоские purpose-oriented segments `bootstrap`, `layouts`, `routing`, `styles`, а page slices сохраняют `ui` segments и public `index.ts`.

### Application styles используют отдельные token-файлы

Единая точка входа глобальных стилей переносится из root `app` в `src/app/styles/globals.css`: root layout сохраняет ответственность за import, но сам stylesheet становится частью application layer. `globals.css` подключает Tailwind, shadcn и три локальных файла с разными обязанностями: `theme.css` хранит цвета, dark theme и радиусы, `spacing.css` — небольшой набор устойчивых spacing/container tokens, `typography.css` — семейства шрифтов, семантические font-size/line-height tokens shared primitives и глобальную типографическую основу. Путь в `components.json` указывает на application stylesheet.

Глобальными остаются только повторяющиеся application-layout roles: `page-inline`, `page-block`, `shell` и `auth`. Локальная геометрия поверхностей, групп полей, header actions, profile details и username width использует стандартную Tailwind scale. Неиспользуемые `control-*` и локальные semantic aliases не создают преждевременный UIKit API.

Регрессионный тест компилирует четыре сохранённых utilities через установленный Tailwind и проверяет их связь с ожидаемыми CSS variables.

Project wrappers `Button` и `Input` добавляют только общий `rounded-lg`. Они не задают глобальную высоту: `Button` полностью сохраняет shadcn `size` variants, а `Input` наследует default height project shadcn primitive. Typography tokens и расширение `tailwind-merge` для `text-*` остаются без изменений.

Альтернатива с глобальными composition-классами (`auth-panel`, `form-stack`) отклонена: theme tokens сохраняют стандартный Tailwind API и не скрывают набор layout-свойств. React `Container`/`Stack` primitives также не вводятся до появления повторяющегося поведенческого или polymorphic контракта, а не только одинаковых CSS declarations.

### Generated Next declarations остаются локальными

`apps/web/next-env.d.ts` генерируется командами `next dev`, `next build` и `next typegen`, поэтому root `.gitignore` исключает его, а Git index перестаёт его отслеживать без удаления локальной working copy. Файл не редактируется и не восстанавливается вручную. `apps/web/tsconfig.json` продолжает включать `next-env.d.ts`, как требует Next.js.

Web добавляет lifecycle script `pretypecheck: next typegen`; существующий `typecheck: tsc --noEmit` не меняется. Поэтому локальный и CI typecheck сначала создают актуальный `next-env.d.ts` и `.next/types`, а последующий build может свободно обновлять ignored declarations без dirty diff. Frontend `AGENTS.md` фиксирует этот generated-file contract.

## Risks / Trade-offs

- **Защита выполняется после hydration, а не на edge/server.** → Приватные pages не содержат SSR user data и до завершения bootstrap показывают только нейтральный loading state.
- **Одновременный refresh в разных вкладках не single-flight.** → Backend grace-period допускает такую ротацию; single-flight гарантируется внутри одной вкладки.
- **Logout может получить 401 по истёкшему access-токену.** → Общий transport сначала обновляет токен и один раз повторяет logout.
- **Network failure при bootstrap не доказывает отсутствие сессии.** → Отдельное error-состояние не очищает предполагаемую session cookie и предлагает retry.
- **Новые form dependencies увеличивают bundle.** → Они используются только в client form boundaries; Zustand не добавляется.
- **Worker-thread plugin runtime является experimental Next.js option.** → Опция ограничена build tooling и может быть удалена, когда Next.js сделает её default либо перестанет использовать socket IPC.
- **Typography abstraction может вырасти раньше продуктовой дизайн-системы.** → API ограничен уже повторяющимися вариантами; labels, links и rich-text styles остаются вне scope.
- **Дополнительный page layer увеличивает число файлов для простых маршрутов.** → Каждый slice содержит только экранную композицию и public API, а `app` остаётся предсказуемой Next.js boundary.
- **Длинное имя может вытеснить logout на узком экране.** → Username-link ограничен responsive max-width и сокращается без удаления доступного перехода в профиль.
- **Семантические spacing tokens могут разрастись в синонимы одной шкалы.** → Новый token добавляется только для устойчивой application-layout роли; локальная геометрия primitives продолжает использовать default Tailwind scale.
- **Typecheck на clean checkout не имеет generated Next declarations.** → `pretypecheck` всегда запускает `next typegen` до `tsc --noEmit`; `next-env.d.ts` остаётся в `tsconfig include`.

## Migration Plan

1. Добавить dependencies и transport/session foundation с unit-тестами.
2. Подключить provider после готовности development MSW, затем route guards и экраны.
3. Создать private welcome UI и проверить все auth transitions через generated MSW handlers/overrides.
4. Ввести shared typography, затем перенести page и route-group layout композицию за FSD public APIs без изменения URL и client boundaries.
5. Упростить private header и проверить оба navigation destinations на observable UI.
6. Перевести `next-env.d.ts` в local generated output и запускать Next type generation перед typecheck.
7. Перенести global style entrypoint в `app/styles`, разделить theme/spacing/typography и оставить semantic tokens только для устойчивых application roles.
8. Rollback выполняется возвратом композиции в root `app`, исходной private navigation и единого global stylesheet, удалением новых typography/page wrappers; backend и данные не меняются.
