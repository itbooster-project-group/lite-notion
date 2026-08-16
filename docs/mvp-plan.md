# План на MVP

Документ фиксирует объём MVP и порядок работ. Состав задач по этапам актуален на момент написания; текущие статусы смотрите на доске [Development](https://github.com/orgs/itbooster-project-group/projects/1).

Схематичные макеты интерфейса по каждому этапу — в отдельном документе [Схемы экранов MVP](mvp-screens.md).

## Принцип: сначала работающий срез, потом фичи

Каждый этап реализуется сквозным срезом от базы данных до интерфейса и завершается работающей функциональностью, которую можно показать. Мы не делаем «сначала весь backend, потом весь frontend»: такой порядок долго не даёт ничего проверяемого и прячет интеграционные проблемы до самого конца.

Из этого следуют два правила:

- Этап считается закрытым, когда сценарий работает целиком: данные сохраняются, API отвечает, интерфейс отображает результат.
- Расширения внутри области (дополнительные типы блоков, фильтры, роли) наслаиваются позже, после того как базовый сценарий заработал.

## Что входит в MVP

1. **Пользователи** — регистрация, вход, роли `GUEST` и `USER`.
2. **Страницы** — вложенность произвольной глубины, у страницы один владелец, шеринга нет.
3. **Блочный редактор** — типы `paragraph`, `heading`, `todo`, `bulleted_list`, `numbered_list`; вложенность, порядок, drag & drop.
4. **Задачи** — статусы `TODO`, `IN_PROGRESS`, `DONE`, срок, один владелец, необязательная привязка к странице.
5. **Гостевой доступ** — read-only просмотр страницы по публичной ссылке.

## Что не входит в MVP

Совместное редактирование в реальном времени · история версий и edit history · права уровня документа, такие как editor и viewer · блоки с картинками, таблицами и embed · канбан-доска, подзадачи, комментарии, вложения · полнотекстовый поиск, теги, избранное, корзина · уведомления и фоновые задачи.

## Этап 0. Фундамент

Инженерная основа без продуктовой функциональности.

| Работа | Задача |
| --- | --- |
| Монорепозиторий pnpm, Next.js и NestJS | [#1](https://github.com/itbooster-project-group/lite-notion/issues/1) |
| Обязательные CI-проверки для Pull Request | [#3](https://github.com/itbooster-project-group/lite-notion/issues/3) |
| Feature Sliced Design и линтер архитектуры | [#5](https://github.com/itbooster-project-group/lite-notion/issues/5) |
| Tailwind и shadcn/ui | [#4](https://github.com/itbooster-project-group/lite-notion/issues/4) |
| Настройки бэкенда: конфигурация, префикс, CORS, Swagger | [#8](https://github.com/itbooster-project-group/lite-notion/issues/8) |
| Проектирование схемы БД | [#9](https://github.com/itbooster-project-group/lite-notion/issues/9) |

**Данные:** [#23](https://github.com/itbooster-project-group/lite-notion/issues/23) подключение PostgreSQL и Prisma, реализация `schema.prisma` и миграций по согласованной [схеме БД](database-schema.md). Эта задача разблокирует данные для всех последующих этапов.

Этап #4 блокирует весь UI-бэклог: до него в `apps/web` нет ни Tailwind, ни shadcn/ui, ни Zustand, TanStack Query, React Hook Form и Zod.

## Этап 1. Пользователи

Пользователь может зарегистрироваться, войти и выйти. Появляется разделение на `GUEST` и `USER`.

| Слой | Состав |
| --- | --- |
| Данные | [#23](https://github.com/itbooster-project-group/lite-notion/issues/23) таблица `USER`, enum `user_role` |
| API | [#24](https://github.com/itbooster-project-group/lite-notion/issues/24) регистрация, вход, выход, текущий пользователь; хеширование паролей, выпуск и проверка токенов |
| Интерфейс | [#19](https://github.com/itbooster-project-group/lite-notion/issues/19) формы входа и регистрации, защита приватных маршрутов |

В #19 серверная часть явно вынесена из скоупа и покрывается #24.

## Этап 2. Страницы

Пользователь создаёт страницы, вкладывает их друг в друга и переключается между ними.

| Слой | Состав |
| --- | --- |
| Данные | [#23](https://github.com/itbooster-project-group/lite-notion/issues/23) таблица `PAGE` с self-relation `parent_id` и владельцем `owner_id` |
| API | [#25](https://github.com/itbooster-project-group/lite-notion/issues/25) CRUD страниц, выдача дерева страниц текущего пользователя |
| Интерфейс | [#10](https://github.com/itbooster-project-group/lite-notion/issues/10) каркас приложения, [#11](https://github.com/itbooster-project-group/lite-notion/issues/11) дерево страниц, [#12](https://github.com/itbooster-project-group/lite-notion/issues/12) шапка страницы и действия |

## Этап 3. Блочный редактор

Ядро продукта: страница наполняется блоками, блоки вкладываются и переупорядочиваются.

| Слой | Состав |
| --- | --- |
| Данные | [#23](https://github.com/itbooster-project-group/lite-notion/issues/23) таблица `BLOCK`, enum `block_type`, порядок через `sort_order`, содержимое в `jsonb` |
| API | [#26](https://github.com/itbooster-project-group/lite-notion/issues/26) CRUD блоков, пакетное обновление порядка и вложенности |
| Интерфейс | [#14](https://github.com/itbooster-project-group/lite-notion/issues/14) компоненты блоков, [#13](https://github.com/itbooster-project-group/lite-notion/issues/13) контейнер редактора, [#15](https://github.com/itbooster-project-group/lite-notion/issues/15) меню типов, [#16](https://github.com/itbooster-project-group/lite-notion/issues/16) drag & drop |

Внутри этапа #14 не зависит от API и может выполняться параллельно с backend-работами. #15 и #16 требуют готового контейнера из #13.

## Этап 4. Задачи

Пользователь ведёт собственные задачи со статусами и сроками.

| Слой | Состав |
| --- | --- |
| Данные | [#23](https://github.com/itbooster-project-group/lite-notion/issues/23) таблица `TASK` с владельцем `owner_id`, enum `task_status` |
| API | [#27](https://github.com/itbooster-project-group/lite-notion/issues/27) CRUD задач, фильтрация по статусу |
| Интерфейс | [#17](https://github.com/itbooster-project-group/lite-notion/issues/17) список, карточка и форма задач |

## Этап 5. Гостевой доступ

Владелец публикует страницу, гость открывает её по ссылке в режиме только для чтения.

| Слой | Состав |
| --- | --- |
| Данные | [#28](https://github.com/itbooster-project-group/lite-notion/issues/28) признак публикации и публичный идентификатор у `PAGE` |
| API | [#28](https://github.com/itbooster-project-group/lite-notion/issues/28) публикация и снятие публикации, публичное чтение страницы без авторизации |
| Интерфейс | [#18](https://github.com/itbooster-project-group/lite-notion/issues/18) read-only просмотр страницы, управление публикацией в шапке страницы |

**Требуется доработка схемы.** В текущей [схеме БД](database-schema.md) у `PAGE` нет полей для публикации: гостевой доступ по ссылке спроектирован не был. Поэтому #28 начинается не с реализации, а с проектирования — это единственная backend-задача MVP с таким порядком.

## Зависимости между задачами

Две задачи блокируют большую часть бэклога, и начинать стоит с них:

| Задача | Что разблокирует |
| --- | --- |
| [#4](https://github.com/itbooster-project-group/lite-notion/issues/4) Tailwind и shadcn/ui | Весь UI-бэклог: до неё в `apps/web` нет ни Tailwind, ни shadcn/ui, ни Zustand, TanStack Query, React Hook Form и Zod |
| [#23](https://github.com/itbooster-project-group/lite-notion/issues/23) PostgreSQL, Prisma и миграции | Все API-задачи: #24, #25, #26, #27 и #28 |

Дальше зависимости идут по этапам: API этапа требует данных из #23, интерфейс этапа требует своего API. Исключения, которые можно брать раньше:

- [#14](https://github.com/itbooster-project-group/lite-notion/issues/14) компоненты блоков — чистая презентация на пропсах, API не нужен.
- [#10](https://github.com/itbooster-project-group/lite-notion/issues/10) каркас приложения — layout и состояние сайдбара, API не нужен.
- [#19](https://github.com/itbooster-project-group/lite-notion/issues/19) формы входа — вёрстку и валидацию можно собрать до готовности #24.

Внутри этапа 3 порядок такой: #14 и #13 независимы друг от друга, а #15 и #16 требуют готового контейнера из #13.
