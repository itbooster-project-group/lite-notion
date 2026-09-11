'use client';

import { X } from 'lucide-react';
import {
  type AriaAttributes,
  type FocusEventHandler,
  type Ref,
  useCallback,
  useId,
  useRef,
  useState,
} from 'react';
import { cn } from '@/shared/lib/cn';
import { Button } from './button';
import { type ControlSize, controlHeights, controlPadding } from './control-size';
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from './shadcn/combobox';
import { SelectContent, SelectItem, SelectTrigger, Select as ShadcnSelect } from './shadcn/select';
import { useFormValue } from './use-form-value';

export type SelectOption = Readonly<{ value: string; label: string; disabled?: boolean }>;
type ValueProps<T> = ({ value: T; defaultValue?: never } | { value?: never; defaultValue?: T }) & {
  onValueChange?: (value: T) => void;
};
type CommonProps = AriaAttributes & {
  options: readonly SelectOption[];
  searchable?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  controlSize?: ControlSize;
  placeholder?: string;
  name?: string;
  id?: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
};
export type SelectSingleProps = CommonProps & { multiple?: false } & ValueProps<string | null>;
export type SelectMultipleProps = CommonProps & { multiple: true } & ValueProps<string[]>;
export type SelectProps = SelectSingleProps | SelectMultipleProps;
const emptyValues: string[] = [];

export function Select(props: SelectProps) {
  const {
    options,
    multiple = false,
    searchable = false,
    disabled,
    clearable = false,
    controlSize = 'default',
    placeholder = 'Выберите вариант',
    name,
    id,
    className,
    ref,
    onBlur,
    value,
    defaultValue,
    onValueChange,
    ...aria
  } = props;
  const state = useFormValue<string | string[] | null>(
    value,
    defaultValue ?? (multiple ? emptyValues : null),
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const setTrigger = useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
      if (typeof ref === 'function') return ref(node);
      if (ref) ref.current = node;
    },
    [ref],
  );

  const values = Array.isArray(state.value)
    ? state.value
    : state.value === null
      ? []
      : [state.value];
  const labels = values.map(
    (value) => options.find((option) => option.value === value)?.label ?? value,
  );
  const display = labels.length
    ? `${labels.slice(0, 2).join(', ')}${labels.length > 2 ? ` +${labels.length - 2}` : ''}`
    : placeholder;
  const descriptions =
    [aria['aria-describedby'], multiple && values.length ? descriptionId : undefined]
      .filter(Boolean)
      .join(' ') || undefined;
  const triggerProps = {
    ...aria,
    id: triggerId,
    ref: setTrigger,
    disabled,
    onBlur,
    'aria-label': aria['aria-label'],
    'aria-labelledby': aria['aria-labelledby'],
    'aria-invalid': aria['aria-invalid'],
    'aria-required': aria['aria-required'],
    'aria-describedby': descriptions,
    className: cn(
      'w-full min-w-0 rounded-lg',
      controlHeights[controlSize],
      controlPadding[controlSize],
      className,
    ),
  };
  function change(next: string | string[] | null) {
    if (disabled) return;
    if (props.multiple) {
      const result = Array.isArray(next) ? [...new Set(next)] : [];
      state.setValue(result);
      props.onValueChange?.(result);
    } else {
      const result = typeof next === 'string' ? next : null;
      state.setValue(result);
      props.onValueChange?.(result);
    }
  }
  function changeOpen(next: boolean) {
    if (next) setQuery('');
    setOpen(next);
  }
  const rootProps = {
    multiple,
    value: state.value,
    onValueChange: change,
    disabled,
    name: values.length ? name : undefined,
    inputRef: state.inputRef,
    open,
    onOpenChange: changeOpen,
  };
  const filtered = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const message = options.length ? 'Ничего не найдено' : 'Нет доступных вариантов';
  const contents = (
    <span className={cn('truncate text-left', !values.length && 'text-muted-foreground')}>
      {display}
    </span>
  );

  return (
    <div className="flex min-w-0 items-center gap-1">
      {searchable ? (
        <Combobox<string, boolean>
          {...rootProps}
          items={options.map((option) => option.value)}
          filteredItems={filtered.map((option) => option.value)}
          inputValue={query}
          onInputValueChange={setQuery}
          itemToStringLabel={(value) =>
            options.find((option) => option.value === value)?.label ?? value
          }
        >
          <ComboboxTrigger
            {...triggerProps}
            className={cn(
              triggerProps.className,
              'flex items-center justify-between gap-1.5 border border-input bg-input/20 text-xs/relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20',
            )}
          >
            {contents}
          </ComboboxTrigger>
          <ComboboxContent anchor={triggerRef} initialFocus={searchRef}>
            <ComboboxInput ref={searchRef} aria-label="Поиск вариантов" showTrigger={false} />
            {!filtered.length && (
              <p role="status" className="p-2 text-xs text-muted-foreground">
                {message}
              </p>
            )}
            <ComboboxList>
              {(value: string) => {
                const option = options.find((option) => option.value === value);
                return (
                  <ComboboxItem
                    key={value}
                    value={value}
                    disabled={option?.disabled}
                    className="pr-7"
                  >
                    {option?.label ?? value}
                  </ComboboxItem>
                );
              }}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      ) : (
        <ShadcnSelect<string, boolean> {...rootProps} items={options}>
          <SelectTrigger
            {...triggerProps}
            size={controlSize === 'sm' ? 'sm' : 'default'}
            className={cn(
              triggerProps.className,
              controlSize === 'lg' && 'data-[size=default]:h-8',
            )}
          >
            {contents}
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {!options.length && (
              <p role="status" className="p-2 text-xs text-muted-foreground">
                Нет доступных вариантов
              </p>
            )}
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="pr-7"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </ShadcnSelect>
      )}
      {multiple && values.length > 0 && (
        <span id={descriptionId} className="sr-only">
          {labels.join(', ')}
        </span>
      )}
      {clearable && values.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Очистить выбор"
          disabled={disabled}
          onClick={() => {
            change(multiple ? [] : null);
            triggerRef.current?.focus();
          }}
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
