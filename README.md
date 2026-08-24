# Fit Body Center · Trainings

Самостоятелен проект за график, записвания и защитен администраторски панел на Fit Body Center.

## Адреси в GitHub Pages

- Потребителски сайт: `https://trainwithniki.github.io/trainings/trainings.html`
- Админ панел: `https://trainwithniki.github.io/trainings/trainings/admin.html`

## Локално стартиране

1. Копирайте `.env.example` като `.env.local`.
2. Попълнете URL и publishable key от отделния Supabase проект.
3. Изпълнете:

```bash
pnpm install
pnpm dev
```

## Supabase

1. Създайте отделен Supabase проект за Trainings.
2. Изпълнете [supabase/setup.sql](supabase/setup.sql) в SQL Editor.
3. Създайте първия потребител в Authentication.
4. Изпълнете последната `update public.profiles...` команда от SQL файла с имейла на главния администратор.
5. В GitHub → Settings → Secrets and variables → Actions → Variables добавете:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

Никога не добавяйте `service_role`, secret key или пароли в GitHub.

## Потребители и роли

- `owner` — пълен достъп, включително управление на администратори.
- `admin` — управлява тренировки и може да добавя редактори.
- `editor` — управлява съдържанието и тренировките.

Новият потребител се добавя от раздел „Потребители“, след което използва „Активирай покана“ в Login панела и създава собствена парола.
