import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet';

describe('Sheet ref contract', () => {
  it('opens without React function-component ref errors', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const view = render(
      <Sheet open onOpenChange={() => undefined}>
        <SheetContent>
          <SheetTitle>Seller navigation</SheetTitle>
          <SheetDescription>Seller navigation controls.</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    expect(consoleError.mock.calls.flat().join(' ')).not.toContain(
      'Function components cannot be given refs',
    );

    view.unmount();
    consoleError.mockRestore();
  });

  it('honors an explicit controlled Escape close while an input is focused', () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              setOpen(false);
            }}
          >
            <SheetTitle>Seller navigation</SheetTitle>
            <SheetDescription>Seller navigation controls.</SheetDescription>
            <input aria-label="Search catalog" autoFocus />
          </SheetContent>
        </Sheet>
      );
    }

    render(<Harness />);
    const search = screen.getByRole('textbox', { name: 'Search catalog' });
    search.focus();
    fireEvent.keyDown(search, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Seller navigation' })).toBeNull();
  });
});
