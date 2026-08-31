import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from './index';
import { Button } from './shadcn/button';

afterEach(cleanup);

describe('shared overlays', () => {
  it('закрывает dialog по Escape и возвращает фокус trigger', async () => {
    render(
      <Dialog>
        <DialogTrigger render={<Button>Открыть диалог</Button>} />
        <DialogContent showCloseButton={false}>
          <DialogTitle>Подтверждение</DialogTitle>
          <DialogDescription>Проверьте действие</DialogDescription>
          <DialogClose render={<Button>Закрыть</Button>} />
        </DialogContent>
      </Dialog>,
    );

    const trigger = screen.getByRole('button', { name: 'Открыть диалог' });
    fireEvent.click(trigger);

    expect(await screen.findByRole('dialog', { name: 'Подтверждение' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('закрывает drawer по Escape и возвращает фокус trigger', async () => {
    render(
      <Drawer>
        <DrawerTrigger render={<Button>Открыть навигацию</Button>} />
        <DrawerContent>
          <DrawerTitle>Навигация</DrawerTitle>
          <DrawerClose render={<Button>Закрыть навигацию</Button>} />
        </DrawerContent>
      </Drawer>,
    );

    const trigger = screen.getByRole('button', { name: 'Открыть навигацию' });
    fireEvent.click(trigger);

    expect(await screen.findByRole('dialog', { name: 'Навигация' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('поддерживает keyboard activation menu item и возвращает фокус trigger', async () => {
    const onRename = vi.fn();

    render(
      <Menu>
        <MenuTrigger render={<Button>Действия</Button>} />
        <MenuPopup sideOffset={4}>
          <MenuItem onClick={onRename}>Переименовать</MenuItem>
        </MenuPopup>
      </Menu>,
    );

    const trigger = screen.getByRole('button', { name: 'Действия' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const item = await screen.findByRole('menuitem', { name: 'Переименовать' });
    await waitFor(() => expect(item).toHaveFocus());
    fireEvent.keyDown(item, { key: 'Enter' });

    expect(onRename).toHaveBeenCalledOnce();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
