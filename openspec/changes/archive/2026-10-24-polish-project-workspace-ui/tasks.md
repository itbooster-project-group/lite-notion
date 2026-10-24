## 1. Projects page

- [x] 1.1 Replace the inline project form with a focused, accessible dialog while preserving validation, pending/error feedback, API mutation, cache update, and navigation.
- [x] 1.2 Refine project cards with the existing Lucide folder icon, clear title hierarchy, thin border without persistent shadow, hover/focus states, safe long-title handling, and an adaptive grid with bounded card widths; preserve project links and action menus.
- [x] 1.3 Update existing workspace integration coverage for empty-state guidance, dialog focus and validation, Enter submission, pending duplicate-submit protection, request failure, close and reopen with stale-error reset, successful navigation, and independent card link/menu actions. Assert user-visible behavior rather than decorative CSS classes.

## 2. Sidebar header

- [x] 2.1 Align the desktop sidebar and workspace headers at a 64 px base height with centered contents and a continuous lower rule; preserve breadcrumb wrapping and keep the mobile drawer, close button, and open trigger unchanged.
- [x] 2.2 Update existing app shell and private shell tests for header content, collapsed/reopened controls, and unchanged mobile drawer behavior; visually verify one-line alignment and that long breadcrumbs wrap without clipping.

## 3. Verification

- [x] 3.1 Run the relevant workspace, app shell, and private shell tests, web typecheck, repository lint, and `openspec validate polish-project-workspace-ui --strict`.
