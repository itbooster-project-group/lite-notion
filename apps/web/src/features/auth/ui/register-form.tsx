'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useSession } from '@/entities/session';
import { type RegisterDto, register } from '@/shared/api';
import { Button, Input, Text } from '@/shared/ui';

import { type RegisterFormValues, registerSchema } from '../model/auth-schemas';
import { getAuthFormPath, getSafeReturnPath } from '../model/return-path';
import { AuthScreen, FormField } from './auth-screen';

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authenticate } = useSession();
  const [submitError, setSubmitError] = useState<string>();
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register: registerField,
    reset,
  } = useForm<RegisterFormValues>({
    defaultValues: { confirmPassword: '', email: '', name: '', password: '' },
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(undefined);
    const payload = {
      email: values.email,
      name: values.name,
      password: values.password,
    } satisfies RegisterDto;

    try {
      const response = await register(payload, { skipAuthRefresh: true });
      authenticate(response);
      reset();
      router.replace(getSafeReturnPath(searchParams?.get('next')));
    } catch (error) {
      setSubmitError(
        getStatus(error) === 409
          ? 'Аккаунт с таким email уже существует'
          : 'Не удалось зарегистрироваться. Проверьте соединение и попробуйте ещё раз.',
      );
    }
  });

  return (
    <AuthScreen
      title="Регистрация"
      description="Создайте пространство для заметок и документов"
      footer={
        <>
          Уже есть аккаунт?{' '}
          <Link
            className="font-medium text-foreground underline-offset-4 hover:underline"
            href={getAuthFormPath('/login', searchParams?.get('next'))}
          >
            Войти
          </Link>
        </>
      }
    >
      <form className="space-y-4" noValidate onSubmit={onSubmit}>
        <FormField error={errors.name?.message} htmlFor="register-name" label="Имя">
          <Input
            {...registerField('name')}
            aria-describedby={errors.name ? 'register-name-error' : undefined}
            aria-invalid={Boolean(errors.name)}
            autoComplete="name"
            id="register-name"
          />
        </FormField>
        <FormField error={errors.email?.message} htmlFor="register-email" label="Email">
          <Input
            {...registerField('email')}
            aria-describedby={errors.email ? 'register-email-error' : undefined}
            aria-invalid={Boolean(errors.email)}
            autoComplete="email"
            id="register-email"
            inputMode="email"
            type="email"
          />
        </FormField>
        <FormField error={errors.password?.message} htmlFor="register-password" label="Пароль">
          <Input
            {...registerField('password')}
            aria-describedby={errors.password ? 'register-password-error' : undefined}
            aria-invalid={Boolean(errors.password)}
            autoComplete="new-password"
            id="register-password"
            type="password"
          />
        </FormField>
        <FormField
          error={errors.confirmPassword?.message}
          htmlFor="register-confirm-password"
          label="Повторите пароль"
        >
          <Input
            {...registerField('confirmPassword')}
            aria-describedby={
              errors.confirmPassword ? 'register-confirm-password-error' : undefined
            }
            aria-invalid={Boolean(errors.confirmPassword)}
            autoComplete="new-password"
            id="register-confirm-password"
            type="password"
          />
        </FormField>
        {submitError ? (
          <Text variant="error" role="alert">
            {submitError}
          </Text>
        ) : null}
        <Button className="w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Создаём аккаунт…' : 'Создать аккаунт'}
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
