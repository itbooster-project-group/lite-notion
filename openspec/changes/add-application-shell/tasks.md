## 1. Зависимости и UI-основа

- [ ] 1.1 Добавить `zustand` как прямую зависимость `@lite-notion/web`, обновить `pnpm-lock.yaml` с Node.js 22.13+ и pnpm 11.21.0 и проверить установку командой `pnpm install --frozen-lockfile`.
- [ ] 1.2 Добавить или адаптировать доступный modal/dialog primitive через публичный API `shared/ui` и проверить отдельным компонентным тестом открытие, Escape, focus trap и возврат фокуса.

## 2. Модель состояния каркаса

- [ ] 2.1 Реализовать Zustand store для `desktopCollapsed` и `mobileOpen` с раздельными actions и partial persistence только desktop-предпочтения; проверить unit-тестами начальное состояние и независимость desktop/mobile transitions.
- [ ] 2.2 Добавить безопасную rehydration и fallback-обработку недоступного или повреждённого `localStorage`; проверить тестами восстановление сохранённого boolean, отсутствие persistence для `mobileOpen` и работоспособность store при storage-ошибке.

## 3. Виджет AppShell

- [ ] 3.1 Создать публичный FSD-виджет `widgets/app-shell` с типизированными слотами `user`, `actions`, `pageTree` и `children`; проверить компонентным тестом правильное размещение переданных слотов и устойчивость при отсутствии каждого опционального слота.
- [ ] 3.2 Реализовать desktop-layout и переключение развёрнутого/свёрнутого сайдбара с согласованным hydration-состоянием; проверить тестом состояния, доступные названия, `aria-expanded`, `aria-controls` и возможность обратного переключения.
- [ ] 3.3 Реализовать mobile-trigger и модальный сайдбар, не изменяющие desktop-предпочтение; проверить компонентными тестами открытие, закрытие кнопкой/Escape/подложкой, focus lifecycle и независимость persisted desktop state.
- [ ] 3.4 Добавить закрытие временного mobile-overlay после завершения продуктовой навигации и при переходе в широкий режим; проверить тестами обоих переходов без изменения `desktopCollapsed`.
- [ ] 3.5 Оформить семантическую структуру с именованным `aside` и единственным `main`, а также responsive-видимость и sidebar-токены; проверить через доступные RTL queries и контракт CSS-классов для широкого и узкого режимов.

## 4. Интеграция с App Router

- [ ] 4.1 Создать route group продуктовой части и её layout с `AppShell`, сохранив глобальный root layout серверным и ограниченным providers; проверить структурным тестом композицию route layout.
- [ ] 4.2 Перенести текущую домашнюю страницу и её smoke-тест внутрь продуктовой route group без изменения URL `/`; проверить, что smoke-тест проходит и production build сохраняет маршрут.

## 5. Итоговая проверка

- [ ] 5.1 Запустить `pnpm --filter @lite-notion/web test`, `pnpm --filter @lite-notion/web typecheck`, `pnpm steiger:web` и `pnpm lint`; устранить все ошибки в затронутой области.
- [ ] 5.2 Запустить `pnpm --filter @lite-notion/web build` и вручную проверить в браузере desktop collapse/reload, mobile overlay, клавиатурное управление и навигацию между продуктовыми маршрутами.
- [ ] 5.3 Запустить `openspec validate add-application-shell --strict` и подтвердить, что все артефакты и delta-spec проходят строгую валидацию.
