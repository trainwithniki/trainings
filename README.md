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
3. Изпълнете [supabase/trainings.sql](supabase/trainings.sql) за тренировките, записванията, защитата и realtime синхронизацията.
4. Добавете първия собственик чрез покана в `public.user_invites`, след което той активира профила си от Login панела.
5. В GitHub → Settings → Secrets and variables → Actions → Variables добавете:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

Никога не добавяйте `service_role`, secret key или пароли в GitHub.

## Достъп и роли

- `owner` — главен администратор.
- `admin` — администратор.
- `editor` — редактор.

Админ интерфейсът показва само раздел „Тренировки“. Профилите и ролите се пазят защитено в Supabase и не се визуализират в сайта.

## Данни за записванията

Публичният сайт вижда само графика, статуса и броя записани. Имената, телефоните и избраните тарифи са достъпни единствено за активен администратор. Публичното записване се извършва чрез ограничена SQL функция, която проверява статуса, капацитета и дублираните телефони.
