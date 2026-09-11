import { Select, type SelectMultipleProps, type SelectSingleProps } from '@/shared/ui';

// Compiled by the application's typecheck, never rendered in the application.
export function SelectTypeExamples() {
  const single: SelectSingleProps = {
    options: [],
    value: null,
    onValueChange: (value) => {
      const check: string | null = value;
      void check;
    },
  };
  const multiple: SelectMultipleProps = {
    options: [],
    multiple: true,
    defaultValue: [],
    onValueChange: (value) => {
      const check: string[] = value;
      void check;
    },
  };
  // @ts-expect-error Multiple selection requires an array.
  const wrongMultiple: SelectMultipleProps = { options: [], multiple: true, value: 'a' };
  // @ts-expect-error Single selection does not accept arrays.
  const wrongSingle: SelectSingleProps = { options: [], value: ['a'] };
  // @ts-expect-error Controlled and uncontrolled values are mutually exclusive.
  const mixed: SelectSingleProps = { options: [], value: 'a', defaultValue: 'b' };
  void wrongMultiple;
  void wrongSingle;
  void mixed;
  return (
    <>
      <Select {...single} />
      <Select {...multiple} searchable />
    </>
  );
}
