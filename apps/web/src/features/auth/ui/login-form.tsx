'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useSession } from '@/entities/session';
import { type LoginDto, login } from '@/shared/api';
import { Button, Input, Text } from '@/shared/ui';

import { type LoginFormValues, loginSchema } from '../model/auth-schemas';
import { getAuthFormPath, getSafeReturnPath } from '../model/return-path';
import { AuthScreen, FormField } from './auth-screen';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authenticate } = useSession();
  const [submitError, setSubmitError] = useState<string>();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register: registerField,
    reset,
  } = useForm<LoginFormValues>({
    defaultValues: { email: '', password: '' },
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(undefined);
    const payload = { email: values.email, password: values.password } satisfies LoginDto;

    try {
      const response = await login(payload, { skipAuthRefresh: true });
      authenticate(response);
      reset();
      router.replace(getSafeReturnPath(searchParams?.get('next')));
    } catch (error) {
      setSubmitError(
        getStatus(error) === 401
          ? 'Неверный email или пароль'
          : 'Не удалось войти. Проверьте соединение и попробуйте ещё раз.',
      );
    }
  });

  return (
    <AuthScreen
      title="Вход"
      description="Продолжите работу в своём пространстве"
      footer={
        <>
          Нет аккаунта?{' '}
          <Link
            className="font-medium text-foreground underline-offset-4 hover:underline"
            href={getAuthFormPath('/register', searchParams?.get('next'))}
          >
            Зарегистрироваться
          </Link>
        </>
      }
    >
      <form className="space-y-4" noValidate onSubmit={onSubmit}>
        <FormField error={errors.email?.message} htmlFor="login-email" label="Email">
          <Input
            {...registerField('email')}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            aria-invalid={Boolean(errors.email)}
            autoComplete="email"
            id="login-email"
            inputMode="email"
            type="email"
          />
        </FormField>
        <FormField error={errors.password?.message} htmlFor="login-password" label="Пароль">
          <Input
            {...registerField('password')}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
            aria-invalid={Boolean(errors.password)}
            autoComplete="current-password"
            id="login-password"
            type="password"
          />
        </FormField>
        {submitError ? (
          <Text variant="error" role="alert">
            {submitError}
          </Text>
        ) : null}
        <Button className="w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Входим…' : 'Войти'}
        </Button>
      </form>
    </AuthScreen>
  );
}

function getStatus(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? Number(error.status)
    : undefined;
}
