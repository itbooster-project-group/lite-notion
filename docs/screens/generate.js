import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const width = 1440;
const height = 900;
const outputDirectory = process.argv[2] ?? 'docs/screens';
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

const styles = `
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; }
  body {
    overflow: hidden; background: #f7f7f5; color: #27272a;
    font: 15px/1.45 Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  button, input { font: inherit; }
  .page { width: ${width}px; height: ${height}px; background: #fff; }
  .app { display: grid; grid-template-columns: 280px 1fr; height: 100%; }
  .side { display: flex; flex-direction: column; border-right: 1px solid #e4e4e7; background: #fafafa; }
  .brand, .toolbar { height: 58px; min-height: 58px; flex: 0 0 58px; display: flex; align-items: center; border-bottom: 1px solid #e4e4e7; }
  .brand { justify-content: space-between; padding: 0 18px; font-weight: 700; }
  .toolbar { justify-content: space-between; padding: 0 28px; color: #71717a; }
  .tree { flex: 1; padding: 16px 10px; }
  .node { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 6px 10px; border-radius: 7px; }
  .node.active { background: #ede9fe; color: #5b21b6; font-weight: 650; }
  .node.sub { padding-left: 28px; }
  .node.deep { padding-left: 48px; }
  .grow { margin-left: auto; }
  .profile { display: flex; align-items: center; gap: 10px; padding: 16px; border-top: 1px solid #e4e4e7; }
  .avatar { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: #ddd6fe; color: #5b21b6; font-weight: 700; border: 2px solid #fff; }
  .avatar.blue { background: #dbeafe; color: #1d4ed8; }
  .avatar.green { background: #dcfce7; color: #15803d; }
  .main { min-width: 0; display: flex; flex-direction: column; }
  .content { position: relative; flex: 1; padding: 42px 80px; overflow: hidden; }
  .content-inner { max-width: 880px; margin: 0 auto; }
  .cover { height: 150px; border-radius: 14px; margin: -8px 0 24px; background: linear-gradient(120deg, #ede9fe, #dbeafe 48%, #dcfce7); }
  h1 { margin: 0 0 10px; font-size: 38px; line-height: 1.15; }
  h2 { margin: 26px 0 8px; font-size: 24px; }
  p { margin: 8px 0; }
  .muted { color: #a1a1aa; }
  .small { font-size: 13px; }
  .button { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; padding: 0 14px; border-radius: 8px; background: #27272a; color: #fff; }
  .button.ghost { background: #fff; color: #3f3f46; border: 1px solid #e4e4e7; }
  .button.danger { background: #fee2e2; color: #b91c1c; }
  .status { display: inline-flex; align-items: center; gap: 7px; color: #16a34a; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  .people { display: flex; align-items: center; }
  .people .avatar { margin-left: -7px; }
  .people .avatar:first-child { margin-left: 0; }
  .top-actions { display: flex; align-items: center; gap: 14px; }
  .block { position: relative; padding: 7px 10px 7px 28px; border-radius: 6px; }
  .block:hover { background: #fafafa; }
  .grip { position: absolute; left: 4px; color: #d4d4d8; }
  .cursor { position: relative; display: inline-block; border-left: 2px solid #2563eb; }
  .cursor::before { content: attr(data-name); position: absolute; left: -2px; bottom: 20px; padding: 2px 6px; background: #2563eb; color: #fff; border-radius: 4px 4px 4px 0; font-size: 11px; white-space: nowrap; }
  .overlay { position: absolute; inset: 0; display: grid; place-items: center; background: rgb(24 24 27 / 28%); }
  .dialog { width: 520px; border: 1px solid #e4e4e7; border-radius: 14px; background: #fff; box-shadow: 0 22px 70px rgb(0 0 0 / 18%); }
  .dialog.wide { width: 680px; }
  .dialog-head, .dialog-foot { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; }
  .dialog-head { border-bottom: 1px solid #e4e4e7; font-weight: 700; }
  .dialog-foot { border-top: 1px solid #e4e4e7; justify-content: flex-end; gap: 10px; }
  .dialog-body { padding: 22px; }
  .field { margin-bottom: 16px; }
  .label { margin-bottom: 6px; color: #52525b; font-size: 13px; font-weight: 600; }
  .input { display: flex; align-items: center; min-height: 40px; padding: 0 12px; border: 1px solid #d4d4d8; border-radius: 8px; background: #fff; }
  .segmented { display: flex; padding: 3px; border-radius: 9px; background: #f4f4f5; }
  .segment { flex: 1; padding: 8px; text-align: center; color: #71717a; }
  .segment.active { border-radius: 7px; background: #fff; color: #27272a; box-shadow: 0 1px 4px rgb(0 0 0 / 10%); font-weight: 650; }
  .row { display: flex; align-items: center; gap: 12px; min-height: 48px; }
  .row + .row { border-top: 1px solid #f4f4f5; }
  .pill { display: inline-flex; padding: 3px 9px; border-radius: 999px; background: #f4f4f5; color: #52525b; font-size: 12px; }
  .pill.green { background: #dcfce7; color: #15803d; }
  .pill.amber { background: #fef3c7; color: #a16207; }
  .asset-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .asset { min-height: 120px; padding: 12px; border: 1px solid #e4e4e7; border-radius: 10px; background: #fafafa; }
  .thumb { height: 64px; border-radius: 7px; margin-bottom: 8px; background: linear-gradient(135deg, #ddd6fe, #bfdbfe); }
  .progress { height: 5px; margin-top: 8px; overflow: hidden; border-radius: 999px; background: #e4e4e7; }
  .progress > span { display: block; width: 64%; height: 100%; background: #7c3aed; }
  .split { display: grid; grid-template-columns: 1fr 360px; height: 100%; }
  .history { padding: 24px; border-left: 1px solid #e4e4e7; background: #fafafa; }
  .history-item { padding: 12px; border-radius: 8px; }
  .history-item.active { background: #ede9fe; color: #5b21b6; }
  .search-result { padding: 14px 4px; }
  .search-result + .search-result { border-top: 1px solid #e4e4e7; }
  .public-head { height: 62px; display: flex; align-items: center; justify-content: space-between; padding: 0 36px; border-bottom: 1px solid #e4e4e7; }
  .public-doc { width: 760px; margin: 0 auto; padding: 58px 0; }
  .media { display: grid; place-items: center; height: 210px; margin: 24px 0; border-radius: 14px; background: linear-gradient(135deg, #e0e7ff, #dbeafe 50%, #dcfce7); color: #52525b; }
`;

const sidebar = `
  <aside class="side">
    <div class="brand"><span>Lite Notion</span><span class="muted">‹</span></div>
    <div class="tree">
      <div class="node">⌄ <span>Проект</span><span class="grow muted">＋</span></div>
      <div class="node sub">⌄ <span>Требования</span><span class="grow muted">＋</span></div>
      <div class="node deep active">• <span>API</span><span class="grow muted">•••</span></div>
      <div class="node sub">• <span>Дизайн</span><span class="grow muted">•••</span></div>
      <div class="node muted">＋ <span>Новая страница</span></div>
    </div>
    <div class="profile"><span class="avatar">R</span><span>Ray</span><span class="grow muted">•••</span></div>
  </aside>
`;

const app = ({ toolbar = '', content = '', overlay = '' }) => `
  <div class="page app">
    ${sidebar}
    <main class="main">
      <div class="toolbar"><span>Проект / Требования / API</span>${toolbar}</div>
      <div class="content">${content}${overlay}</div>
    </main>
  </div>
`;

const documentBody = `
  <div class="content-inner">
    <h1>API</h1>
    <div class="block"><span class="grip">⠿</span><h2>Аутентификация</h2></div>
    <div class="block"><span class="grip">⠿</span>Access token проверяется guard-ом.</div>
    <div class="block"><span class="grip">⠿</span>Refresh token ротируется при продлении сессии.</div>
    <div class="block"><span class="grip">⠿</span>☐ Добавить интеграционные тесты</div>
  </div>
`;

const screens = {
  '01-auth': `
    <div class="page" style="display:grid;place-items:center;background:linear-gradient(140deg,#fafafa,#f5f3ff)">
      <div style="width:430px">
        <div style="text-align:center;font-size:30px;font-weight:750;margin-bottom:24px">Lite Notion</div>
        <div class="dialog" style="width:430px">
          <div class="dialog-body">
            <div class="segmented" style="margin-bottom:22px"><div class="segment active">Вход</div><div class="segment">Регистрация</div></div>
            <div class="field"><div class="label">Email</div><div class="input">ray@example.com</div></div>
            <div class="field"><div class="label">Пароль</div><div class="input">••••••••</div><div style="color:#dc2626;font-size:12px;margin-top:5px">Неверные учётные данные</div></div>
            <div class="button" style="width:100%">Войти</div>
          </div>
        </div>
        <div class="profile" style="margin-top:18px;border:0;justify-content:center"><span class="avatar">R</span><span>Ray · Профиль · Выйти</span></div>
      </div>
    </div>
  `,
  '02-workspace': app({
    toolbar: '<span>•••</span>',
    content:
      '<div class="content-inner"><div class="cover"></div><h1>API</h1><p class="muted">Выберите страницу или начните ввод</p></div>',
  }),
  '03-permissions': app({
    toolbar: '<span class="button ghost">Поделиться</span>',
    content: documentBody,
    overlay: `
      <div class="overlay"><div class="dialog">
        <div class="dialog-head"><span>Доступ к странице</span><span class="muted">×</span></div>
        <div class="dialog-body">
          <div class="field"><div class="label">Наследование</div><div class="input">inherit <span class="grow">⌄</span></div></div>
          <div class="row"><span class="avatar">R</span><b>Ray</b><span class="grow pill">Владелец</span></div>
          <div class="row"><span class="avatar blue">A</span><span>Anna</span><span class="grow pill">editor⌄</span></div>
          <div class="row"><span class="avatar green">M</span><span>Max</span><span class="grow pill">viewer⌄</span></div>
          <div class="button ghost" style="margin-top:16px">＋ Добавить пользователя</div>
          <p class="small muted">Публичная ссылка настраивается отдельно.</p>
        </div>
      </div></div>`,
  }),
  '04-collaboration': app({
    toolbar: `
      <div class="top-actions"><span class="status"><span class="dot"></span>Сохранено</span>
      <div class="people"><span class="avatar">R</span><span class="avatar blue">A</span><span class="avatar green">M</span></div>
      <span class="button ghost">Поделиться</span></div>`,
    content: `
      <div class="content-inner"><h1>API</h1>
      <div class="block"><span class="grip">⠿</span><h2>Аутентификация</h2></div>
      <div class="block"><span class="grip">⠿</span>Access token проверяется guard-ом.</div>
      <div class="block"><span class="grip">⠿</span>Refresh token <span class="cursor" data-name="Anna">ротируется</span> при продлении сессии.</div>
      <div class="block"><span class="grip">⠿</span>☐ Добавить интеграционные тесты</div>
      <p class="small muted" style="margin-top:36px">3 участника · realtime · room page:…</p></div>`,
  }),
  '05-assets': app({
    toolbar: '<span class="button ghost">Обложка</span>',
    content: `${documentBody}<div class="media">architecture.png · image media node</div>`,
    overlay: `
      <div class="overlay"><div class="dialog wide">
        <div class="dialog-head"><span>Assets</span><span class="button">Загрузить файл</span></div>
        <div class="dialog-body asset-grid">
          <div class="asset"><div class="thumb"></div><b>architecture.png</b><div class="pill green">ready</div></div>
          <div class="asset"><div class="thumb"></div><b>demo-video.mp4</b><div class="progress"><span></span></div><div class="small muted">64%</div></div>
          <div class="asset"><div class="thumb" style="filter:grayscale(1)"></div><b>old-cover.jpg</b><div class="pill amber">failed · повторить</div></div>
        </div>
      </div></div>`,
  }),
  '06-history': `
    <div class="page split">
      <main class="main"><div class="toolbar"><span>Preview версии 18</span><span class="pill">Только чтение</span></div><div class="content">${documentBody}</div></main>
      <aside class="history"><h2 style="margin-top:0">История версий</h2>
        <div class="history-item"><b>Сейчас · версия 21</b><div class="small muted">23 августа, 20:15</div></div>
        <div class="history-item">Версия 20<div class="small muted">automatic · Ray</div></div>
        <div class="history-item">Версия 19<div class="small muted">publication · Anna</div></div>
        <div class="history-item active">Версия 18<div class="small">manual · Ray</div></div>
        <div class="button" style="margin-top:20px;width:100%">Восстановить версию</div>
      </aside>
    </div>
  `,
  '07-search': app({
    content: documentBody,
    overlay: `
      <div class="overlay"><div class="dialog wide">
        <div class="dialog-head"><span>🔎&nbsp; authentication</span><span class="muted">Esc</span></div>
        <div class="dialog-body">
          <div class="search-result"><b>API</b><p>…authentication guard проверяет access token…</p><span class="small muted">Проект / Требования / API</span></div>
          <div class="search-result"><b>Сессии</b><p>…authentication token и refresh rotation…</p><span class="small muted">Проект / Backend / Сессии</span></div>
          <p class="small muted">Индекс обновляется после сохранения документа.</p>
        </div>
      </div></div>`,
  }),
  '08-publication': app({
    toolbar: '<span class="button">Publish</span>',
    content: documentBody,
    overlay: `
      <div class="overlay"><div class="dialog">
        <div class="dialog-head"><span>Публикация страницы</span><span class="muted">×</span></div>
        <div class="dialog-body">
          <div class="row"><span>Статус</span><span class="grow pill green">published</span></div>
          <div class="field"><div class="label">Публичный адрес</div><div class="input">/p/api-authentication</div></div>
          <div class="row"><span>Snapshot</span><b class="grow">версия 19</b></div>
          <div class="row"><span>Live-документ</span><span class="grow pill amber">изменён</span></div>
          <p class="small muted">Новые правки появятся только после повторной публикации.</p>
        </div>
        <div class="dialog-foot"><span class="button danger">Снять</span><span class="button">Опубликовать снова</span></div>
      </div></div>`,
  }),
  '09-public-page': `
    <div class="page"><header class="public-head"><b>Lite Notion</b><span class="button ghost">Войти</span></header>
      <article class="public-doc"><h1>API</h1><h2>Аутентификация</h2><p>Access token проверяется guard-ом.</p>
      <p>Refresh token ротируется при продлении сессии.</p><div class="media">architecture.png</div>
      <p class="small muted" style="padding-top:20px;border-top:1px solid #e4e4e7">Опубликованная версия · только чтение</p></article>
    </div>
  `,
};

fs.mkdirSync(outputDirectory, { recursive: true });

const browser = await puppeteer.launch({
  ...(executablePath ? { executablePath } : { channel: 'chrome' }),
  headless: true,
  args: ['--no-sandbox', '--font-render-hinting=none'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });

  for (const [name, body] of Object.entries(screens)) {
    await page.setContent(
      `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${styles}</style></head><body>${body}</body></html>`,
      { waitUntil: 'load' },
    );

    const filePath = path.join(outputDirectory, `${name}.png`);
    await page.screenshot({
      path: filePath,
      clip: { x: 0, y: 0, width, height },
    });
    console.log(`${name}.png — ${(fs.statSync(filePath).size / 1024).toFixed(0)} КБ`);
  }
} finally {
  await browser.close();
}
