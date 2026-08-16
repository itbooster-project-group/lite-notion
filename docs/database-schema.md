# Схема базы данных

Проектная схема PostgreSQL для MVP. Источник требований — issue [#9 «Спроектировать БД»](https://github.com/itbooster-project-group/lite-notion/issues/9).

Схема ещё не реализована: `schema.prisma` и миграции появятся отдельной задачей после согласования диаграммы.

## ER-диаграмма

```mermaid
erDiagram
    USER ||--o{ PAGE : owns
    USER ||--o{ TASK : creates
    USER ||--o{ TASK_ASSIGNEE : "listed in"
    TASK ||--o{ TASK_ASSIGNEE : has
    PAGE ||--o{ BLOCK : contains
    PAGE |o--o{ TASK : groups

    USER {
        uuid id PK
        citext email UK
        text password_hash
        text name
        user_role role
        timestamptz created_at
        timestamptz updated_at
    }
    PAGE {
        uuid id PK
        text title
        uuid parent_id FK "nullable"
        uuid owner_id FK
        timestamptz created_at
        timestamptz updated_at
    }
    BLOCK {
        uuid id PK
        uuid page_id FK
        uuid parent_block_id FK "nullable"
        block_type type
        jsonb content
        int sort_order
        timestamptz created_at
        timestamptz updated_at
    }
    TASK {
        uuid id PK
        text title
        text description "nullable"
        task_status status
        timestamptz due_date "nullable"
        uuid page_id FK "nullable"
        uuid created_by FK
        timestamptz created_at
        timestamptz updated_at
    }
    TASK_ASSIGNEE {
        uuid task_id FK
        uuid user_id FK
        timestamptz assigned_at
    }
```

Кардинальность `|o` на связи `PAGE → TASK` отражает nullable внешний ключ: задача может существовать без привязки к странице.

Самоссылающиеся связи `PAGE.parent_id → PAGE` и `BLOCK.parent_block_id → BLOCK` вынесены из диаграммы выше и показаны отдельно в разделе «Вложенность» — так структура читается нагляднее.

## Вложенность

Страницы и блоки образуют деревья произвольной глубины. Страница без родителя (`parent_id = NULL`) — это верхнеуровневый документ; блок без родителя (`parent_block_id = NULL`) находится на верхнем уровне страницы. Порядок блоков в пределах одного уровня задаётся полем `sort_order`.

```mermaid
flowchart TD
    P1["PAGE «Проект»
    parent_id = NULL"]
    P2["PAGE «Требования»"]
    P3["PAGE «Дизайн»"]
    P4["PAGE «API»"]
    B1["BLOCK heading
    sort_order = 0"]
    B2["BLOCK bulleted_list
    sort_order = 1"]
    B3["BLOCK todo
    sort_order = 0"]
    B4["BLOCK todo
    sort_order = 1"]

    P1 --> P2
    P1 --> P3
    P2 --> P4
    P4 --> B1
    P4 --> B2
    B2 --> B3
    B2 --> B4

    classDef page fill:#ede9fe,stroke:#7c3aed,color:#1e1b4b
    classDef block fill:#ecfdf5,stroke:#059669,color:#052e2b
    class P1,P2,P3,P4 page
    class B1,B2,B3,B4 block
```

## Enum-типы

| Тип | Значения | Назначение |
| --- | --- | --- |
| `user_role` | `GUEST`, `USER` | Роль пользователя на уровне приложения |
| `block_type` | `paragraph`, `heading`, `todo`, `bulleted_list`, `numbered_list` | Типы контент-блоков, поддерживаемые MVP |
| `task_status` | `TODO`, `IN_PROGRESS`, `DONE` | Статус задачи |

## Сущности

### USER

Пользователь приложения. Роль определяет уровень доступа: `USER` работает со своими страницами и задачами, `GUEST` получает read-only доступ к опубликованным страницам.

| Поле | Тип | Описание |
| --- | --- | --- |
| `id` | `uuid` PK | Первичный ключ |
| `email` | `citext` UK | Уникальный адрес, регистронезависимое сравнение |
| `password_hash` | `text` | Хеш пароля |
| `name` | `text` | Отображаемое имя |
| `role` | `user_role` | `GUEST` или `USER` |

### PAGE

Страница, она же документ. Отдельной сущности `Document` нет: верхнеуровневый документ — это `PAGE` с `parent_id = NULL`, как в Notion. Вложенность произвольной глубины через self-relation.

В MVP страница принадлежит одному владельцу. Таблица коллабораторов не проектируется: совместное редактирование вне скоупа, а гостевой доступ выдаётся по публичной ссылке и не требует записей в БД.

| Поле | Тип | Описание |
| --- | --- | --- |
| `id` | `uuid` PK | Первичный ключ |
| `title` | `text` | Заголовок страницы |
| `parent_id` | `uuid` FK, nullable | Родительская страница, `NULL` для корневой |
| `owner_id` | `uuid` FK | Владелец страницы |

### BLOCK

Контент-блок внутри страницы. Вкладывается в другой блок через `parent_block_id`, порядок в пределах уровня задаётся полем `sort_order`.

Поле называется `sort_order`, а не `order`, потому что `ORDER` — зарезервированное слово в PostgreSQL.

Содержимое хранится в `jsonb`: у разных типов блоков разная форма контента, и такой подход позволяет добавлять новые типы без миграции схемы.

| Поле | Тип | Описание |
| --- | --- | --- |
| `id` | `uuid` PK | Первичный ключ |
| `page_id` | `uuid` FK | Страница, которой принадлежит блок |
| `parent_block_id` | `uuid` FK, nullable | Родительский блок, `NULL` для блока верхнего уровня |
| `type` | `block_type` | Тип блока |
| `content` | `jsonb` | Содержимое, форма зависит от типа |
| `sort_order` | `int` | Порядок среди соседних блоков |

### TASK

Задача управления проектами, независимая от страниц. Связь с `PAGE` необязательная: в MVP страницы не шерятся, поэтому исполнитель задачи не обязательно имеет доступ к странице, и жёсткая привязка создавала бы недоступный контекст.

| Поле | Тип | Описание |
| --- | --- | --- |
| `id` | `uuid` PK | Первичный ключ |
| `title` | `text` | Заголовок задачи |
| `description` | `text`, nullable | Описание |
| `status` | `task_status` | Текущий статус |
| `due_date` | `timestamptz`, nullable | Срок выполнения |
| `page_id` | `uuid` FK, nullable | Необязательная привязка к странице |
| `created_by` | `uuid` FK | Автор задачи |

### TASK_ASSIGNEE

Junction-таблица для связи many-to-many между задачами и исполнителями. У одной задачи может быть несколько исполнителей.

| Поле | Тип | Описание |
| --- | --- | --- |
| `task_id` | `uuid` FK | Задача |
| `user_id` | `uuid` FK | Исполнитель |
| `assigned_at` | `timestamptz` | Момент назначения |

## Ключевые решения

- **Единая `PAGE` вместо пары `Document` + `Page`.** Соответствует модели Notion и убирает лишний уровень абстракции: любой документ — просто страница без родителя.
- **`jsonb` для содержимого блока.** Разные типы блоков имеют разную структуру контента; добавление нового типа не потребует миграции.
- **`sort_order` вместо `order`.** `ORDER` зарезервировано в PostgreSQL.
- **Nullable `Task.page_id`.** Задача может существовать вне страницы, что снимает противоречие между несколькими исполнителями задачи и отсутствием шеринга страниц в MVP.
- **Нет таблицы коллабораторов.** В MVP у страницы один владелец; совместный доступ — отдельная будущая задача.

## Вне скоупа MVP

- `schema.prisma`, миграции и индексы
- Совместный доступ к страницам и права уровня документа
- История версий и edit history
- Аутентификация и авторизация: токены, сессии
- Модели данных для Redis, BullMQ и Socket.IO
- Полнотекстовый поиск, теги, избранное, корзина
