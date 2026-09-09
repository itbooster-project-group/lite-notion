'use client';

import { useEffect, useRef, useState } from 'react';

/** Keeps project-owned uncontrolled state in sync with the owning HTML form. */
export function useFormValue<T>(value: T | undefined, defaultValue: T) {
  const [internal, setInternal] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || value !== undefined) return;
    function reset(event: Event) {
      queueMicrotask(() => {
        if (!event.defaultPrevented) setInternal(defaultValue);
      });
    }
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [value, defaultValue]);
  return { value: value === undefined ? internal : value, inputRef, setValue: setInternal };
}
