// Генерация PNG-макетов экранов MVP для docs/mvp-screens.md.
//
// Запуск из корня репозитория:
//   npm install puppeteer
//   node docs/screens/generate.js docs/screens
//
// Разрешение 1440x900 при deviceScaleFactor: 2 — стандартный ноутбучный экран.
// Путь к браузеру можно задать переменной PUPPETEER_EXECUTABLE_PATH.
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");

const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
const OUT = process.argv[2] || ".";
const W = 1440;
const H = 900;

const css = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${W}px; height: ${H}px; overflow: hidden;
    font-family: "Segoe UI", system-ui, sans-serif;
    background: #ffffff; color: #18181b; font-size: 14px;
  }
  .app { display: flex; height: 100%; }

  /* ── сайдбар ── */
  .side {
    width: 260px; flex: 0 0 260px; background: #fafafa;
    border-right: 1px solid #e4e4e7; display: flex; flex-direction: column;
  }
  .side-top {
    height: 52px; display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; border-bottom: 1px solid #e4e4e7;
  }
  .logo { font-weight: 600; font-size: 15px; }
  .tree { padding: 12px 8px; flex: 1; }
  .node {
    display: flex; align-items: center; gap: 6px; height: 30px;
    padding: 0 8px; border-radius: 6px; color: #3f3f46;
  }
  .node.active { background: #ede9fe; color: #5b21b6; font-weight: 600; }
  .node .chev { width: 12px; color: #a1a1aa; font-size: 10px; }
  .node .dots { margin-left: auto; color: #d4d4d8; }
  .d1 { padding-left: 20px; } .d2 { padding-left: 36px; }
  .add { color: #71717a; height: 30px; display: flex; align-items: center; padding: 0 16px; }
  .side-bot { border-top: 1px solid #e4e4e7; padding: 8px; }
  .side-bot .node { color: #3f3f46; }
  .user { display: flex; align-items: center; gap: 8px; padding: 8px; color: #52525b; }
  .ava { width: 24px; height: 24px; border-radius: 50%; background: #ddd6fe; }

  /* ── основная область ── */
  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .top {
    height: 52px; border-bottom: 1px solid #e4e4e7; display: flex;
    align-items: center; justify-content: space-between; padding: 0 24px;
    color: #71717a;
  }
  .content { flex: 1; padding: 40px 64px; overflow: hidden; }
  .content > * { max-width: 820px; }
  .h1 { font-size: 32px; font-weight: 700; margin-bottom: 4px; }
  .rule { height: 1px; background: #e4e4e7; margin: 20px 0 24px; }

  /* ── блоки ── */
  .blk { display: flex; align-items: flex-start; gap: 10px; padding: 5px 0; position: relative; }
  .grip { width: 14px; color: #d4d4d8; font-size: 13px; letter-spacing: -1px; padding-top: 3px; }
  .tag {
    margin-left: auto; font-size: 11px; color: #a1a1aa;
    background: #f4f4f5; border-radius: 4px; padding: 2px 8px; align-self: center;
  }
  .h2 { font-size: 22px; font-weight: 600; }
  .box { width: 15px; height: 15px; border: 1.5px solid #a1a1aa; border-radius: 3px; margin-top: 2px; }
  .box.on { background: #7c3aed; border-color: #7c3aed; position: relative; }
  .box.on::after { content: "✓"; color: #fff; font-size: 11px; position: absolute; left: 2px; top: -2px; }
  .done { color: #a1a1aa; text-decoration: line-through; }
  .caret { display: inline-block; width: 2px; height: 18px; background: #7c3aed; vertical-align: -3px; }

  /* ── меню типов ── */
  .menu {
    width: 260px; border: 1px solid #e4e4e7; border-radius: 8px; background: #fff;
    box-shadow: 0 8px 24px rgba(0,0,0,.10); padding: 6px; margin: 6px 0 0 24px;
  }
  .mi { padding: 7px 10px; border-radius: 6px; color: #3f3f46; }
  .mi.sel { background: #f4f4f5; }
  .mh { font-size: 11px; color: #a1a1aa; padding: 6px 10px 2px; text-transform: uppercase; letter-spacing: .5px; }

  /* ── задачи ── */
  .tabs { display: flex; gap: 6px; margin-bottom: 20px; }
  .tab { padding: 6px 14px; border-radius: 999px; color: #52525b; background: #f4f4f5; font-size: 13px; }
  .tab.on { background: #18181b; color: #fff; }
  .card {
    border: 1px solid #e4e4e7; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px;
  }
  .card .t { font-weight: 600; margin-bottom: 10px; }
  .meta { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #71717a; }
  .pill { border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 500; }
  .p-todo { background: #f4f4f5; color: #3f3f46; }
  .p-prog { background: #dbeafe; color: #1d4ed8; }
  .p-done { background: #dcfce7; color: #15803d; }
  .over { color: #dc2626; font-weight: 500; }
  .btn { background: #18181b; color: #fff; border-radius: 8px; padding: 8px 16px; font-size: 13px; }

  /* ── формы / модалка ── */
  .center { display: flex; align-items: center; justify-content: center; height: 100%; }
  .panel { width: 400px; }
  .brand { text-align: center; font-size: 26px; font-weight: 700; margin-bottom: 28px; }
  .card2 { border: 1px solid #e4e4e7; border-radius: 12px; padding: 28px; box-shadow: 0 4px 16px rgba(0,0,0,.05); }
  .seg { display: flex; background: #f4f4f5; border-radius: 8px; padding: 3px; margin-bottom: 22px; }
  .seg div { flex: 1; text-align: center; padding: 7px; border-radius: 6px; color: #71717a; font-size: 13px; }
  .seg div.on { background: #fff; color: #18181b; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .lbl { font-size: 13px; color: #3f3f46; margin-bottom: 6px; font-weight: 500; }
  .inp { height: 38px; border: 1px solid #e4e4e7; border-radius: 8px; margin-bottom: 16px; background: #fff;
         display: flex; align-items: center; padding: 0 12px; color: #71717a; font-size: 13px; }
  .inp.filled { color: #18181b; }
  .inp .chev2 { margin-left: auto; color: #a1a1aa; font-size: 10px; }
  .inp.err { border-color: #dc2626; margin-bottom: 4px; }
  .msg { color: #dc2626; font-size: 12px; margin-bottom: 14px; }
  .sub { height: 40px; background: #18181b; color: #fff; border-radius: 8px;
         display: flex; align-items: center; justify-content: center; font-size: 14px; }
  .modal-wrap { position: absolute; inset: 0; background: rgba(0,0,0,.28); display: flex;
                align-items: center; justify-content: center; }
  .modal { width: 480px; background: #fff; border-radius: 12px; box-shadow: 0 20px 50px rgba(0,0,0,.2); }
  .modal-h { padding: 18px 22px; border-bottom: 1px solid #e4e4e7; font-weight: 600;
             display: flex; justify-content: space-between; }
  .modal-b { padding: 22px; }
  .row { display: flex; gap: 14px; }
  .row > div { flex: 1; }
  .modal-f { padding: 16px 22px; border-top: 1px solid #e4e4e7; display: flex;
             justify-content: flex-end; gap: 10px; }
  .ghost { border: 1px solid #e4e4e7; border-radius: 8px; padding: 8px 16px; font-size: 13px; color: #3f3f46; }

  /* ── гостевой вид ── */
  .guest-top { height: 56px; border-bottom: 1px solid #e4e4e7; display: flex;
               align-items: center; justify-content: space-between; padding: 0 32px; }
  .guest-body { padding: 48px 0; display: flex; justify-content: center; }
  .guest-doc { width: 720px; }
  .ro { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e4e4e7;
        color: #a1a1aa; font-size: 13px; }
`;

const sidebar = (activeTasks) => `
<div class="side">
  <div class="side-top"><div class="logo">Lite Notion</div><div style="color:#a1a1aa">‹</div></div>
  <div class="tree">
    <div class="node"><span class="chev">▾</span>Проект<span class="dots">⋯</span></div>
    <div class="node d1"><span class="chev">▾</span>Требования<span class="dots">⋯</span></div>
    <div class="node d2 ${activeTasks ? "" : "active"}"><span class="chev">•</span>API<span class="dots">⋯</span></div>
    <div class="node d1"><span class="chev">•</span>Дизайн<span class="dots">⋯</span></div>
    <div class="add">+ Новая страница</div>
  </div>
  <div class="side-bot">
    <div class="node ${activeTasks ? "active" : ""}"><span class="chev">☑</span>Задачи</div>
    <div class="user"><div class="ava"></div>Ray</div>
  </div>
</div>`;

const screens = {
  "01-auth": `
<div class="center">
  <div class="panel">
    <div class="brand">Lite Notion</div>
    <div class="card2">
      <div class="seg"><div class="on">Вход</div><div>Регистрация</div></div>
      <div class="lbl">Email</div><div class="inp filled">ray@example.com</div>
      <div class="lbl">Пароль</div><div class="inp err filled">••••••••</div>
      <div class="msg">Неверный email или пароль</div>
      <div class="sub">Войти</div>
    </div>
  </div>
</div>`,

  "02-workspace": `
<div class="app">
  ${sidebar(false)}
  <div class="main">
    <div class="top"><div>Проект / Требования / API</div><div>⋯</div></div>
    <div class="content">
      <div class="h1">API</div>
      <div class="rule"></div>
      <div class="blk"><div class="grip"></div><div style="color:#a1a1aa">Пустая страница — начните печатать или нажмите «/»</div></div>
    </div>
  </div>
</div>`,

  "03-editor": `
<div class="app">
  ${sidebar(false)}
  <div class="main">
    <div class="top"><div>Проект / Требования / API</div><div>⋯</div></div>
    <div class="content">
      <div class="h1">API</div>
      <div class="rule"></div>
      <div class="blk"><div class="grip"></div><div class="h2">Аутентификация</div><div class="tag">heading</div></div>
      <div class="blk"><div class="grip"></div><div>Токен выдаётся при входе и проверяется guard-ом.</div><div class="tag">paragraph</div></div>
      <div class="blk"><div class="grip">⠿</div><div>• регистрация<br>• вход по email и паролю</div><div class="tag">bulleted_list</div></div>
      <div class="blk"><div class="grip"></div><div>1. описать схему<br>2. написать миграцию</div><div class="tag">numbered_list</div></div>
      <div class="blk"><div class="grip"></div><div class="box on"></div><div class="done">описать формат ошибок</div><div class="tag">todo</div></div>
      <div class="blk"><div class="grip"></div><div class="box"></div><div>добавить Swagger</div><div class="tag">todo</div></div>
      <div class="blk"><div class="grip"></div><div>/<span class="caret"></span></div></div>
      <div class="menu">
        <div class="mh">Тип блока</div>
        <div class="mi sel">Текст</div>
        <div class="mi">Заголовок</div>
        <div class="mi">Маркированный список</div>
        <div class="mi">Нумерованный список</div>
        <div class="mi">Чекбокс</div>
      </div>
    </div>
  </div>
</div>`,

  "04-tasks": `
<div class="app">
  ${sidebar(true)}
  <div class="main">
    <div class="top"><div style="color:#18181b;font-weight:600">Задачи</div><div class="btn">+ Задача</div></div>
    <div class="content">
      <div class="tabs">
        <div class="tab on">Все</div><div class="tab">К выполнению</div>
        <div class="tab">В работе</div><div class="tab">Готово</div>
      </div>
      <div class="card">
        <div class="t">Сверстать форму входа</div>
        <div class="meta"><span class="pill p-prog">В работе</span><span>до 20.08.2026</span><span>· страница: API</span></div>
      </div>
      <div class="card">
        <div class="t">Описать формат jsonb для блоков</div>
        <div class="meta"><span class="pill p-todo">К выполнению</span><span class="over">до 15.08.2026 · просрочена</span><span>· без страницы</span></div>
      </div>
      <div class="card">
        <div class="t">Настроить миграции Prisma</div>
        <div class="meta"><span class="pill p-done">Готово</span><span>без срока</span></div>
      </div>
    </div>
  </div>
</div>`,

  "05-task-form": `
<div class="app">
  ${sidebar(true)}
  <div class="main">
    <div class="top"><div style="color:#18181b;font-weight:600">Задачи</div><div class="btn">+ Задача</div></div>
    <div class="content">
      <div class="tabs"><div class="tab on">Все</div><div class="tab">К выполнению</div><div class="tab">В работе</div><div class="tab">Готово</div></div>
      <div class="card"><div class="t">Сверстать форму входа</div>
        <div class="meta"><span class="pill p-prog">В работе</span><span>до 20.08.2026</span></div></div>
    </div>
  </div>
</div>
<div class="modal-wrap">
  <div class="modal">
    <div class="modal-h"><span>Новая задача</span><span style="color:#a1a1aa">✕</span></div>
    <div class="modal-b">
      <div class="lbl">Заголовок</div><div class="inp err"></div>
      <div class="msg">Заголовок обязателен</div>
      <div class="lbl">Описание</div>
      <div class="inp" style="height:70px;align-items:flex-start;padding-top:10px">необязательное описание</div>
      <div class="row">
        <div><div class="lbl">Статус</div><div class="inp filled">К выполнению<span class="chev2">▾</span></div></div>
        <div><div class="lbl">Срок</div><div class="inp filled">20.08.2026</div></div>
      </div>
      <div class="lbl">Страница</div><div class="inp">не выбрана<span class="chev2">▾</span></div>
    </div>
    <div class="modal-f"><div class="ghost">Отмена</div><div class="btn">Создать</div></div>
  </div>
</div>`,

  "06-guest": `
<div class="guest-top">
  <div class="logo">Lite Notion</div>
  <div class="ghost">Войти</div>
</div>
<div class="guest-body">
  <div class="guest-doc">
    <div class="h1">API</div>
    <div class="rule"></div>
    <div class="blk"><div class="h2">Аутентификация</div></div>
    <div class="blk"><div>Токен выдаётся при входе и проверяется guard-ом.</div></div>
    <div class="blk"><div>• регистрация<br>• вход по email и паролю</div></div>
    <div class="blk"><div class="box on"></div><div class="done">описать формат ошибок</div></div>
    <div class="blk"><div class="box"></div><div>добавить Swagger</div></div>
    <div class="ro">Страница доступна только для чтения</div>
  </div>
</div>`,
};

(async () => {
  const browser = await puppeteer.launch({
    ...(CHROME ? { executablePath: CHROME } : {}),
    headless: "shell",
    args: ["--no-sandbox", "--font-render-hinting=none"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });

  for (const [name, body] of Object.entries(screens)) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body style="position:relative">${body}</body></html>`;
    await page.setContent(html, { waitUntil: "load" });
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } });
    console.log(`${name}.png — ${(fs.statSync(file).size / 1024).toFixed(0)} КБ`);
  }
  await browser.close();
})();
