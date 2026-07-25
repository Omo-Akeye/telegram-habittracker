# HabitBot

A Telegram habit tracker built with NestJS, Prisma, PostgreSQL, and Telegraf.

## Tech Stack

- **Backend:** NestJS
- **ORM:** Prisma 7 (with driver adapter)
- **Database:** PostgreSQL
- **Bot:** Telegraf
- **Validation:** class-validator + class-transformer
- **Schedule:** @nestjs/schedule
- **Docs:** Swagger (OpenAPI)

## Architecture

```
src
├── auth          User authentication (telegram-based)
├── users         User management
├── telegram      Bot commands and webhook
├── habits        Habit CRUD
├── completions   Daily completions
├── statistics    Streaks and completion rates
├── reminders     Habit reminders
├── scheduler     Cron-based reminder checks
├── prisma        Database service
├── common        Guards, filters, decorators
└── config        Environment configuration
```

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL running locally
- Telegram bot token (from [@BotFather](https://t.me/BotFather))

### Install

```bash
npm install
```

### Configure

Copy the environment file and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` — PostgreSQL connection string
- `BOT_TOKEN` — Telegram bot token from BotFather

### Database

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### Run

```bash
# development
npm run start:dev

# production
npm run build
npm run start:prod
```

## Telegram Commands

| Command | Description |
|---|---|
| `/start` | Create account and show welcome message |
| `/help` | List available commands |
| `/new` | Create a new habit (title → frequency → reminder) |
| `/habits` | View all habits with inline actions |
| `/stats` | View streaks, completion rate, and totals |

Inline buttons on `/habits`:
- **✅ Complete** / **🔄 Undo** — mark or unmark today's completion
- **✏ Edit** — rename the habit
- **🗑 Delete** — remove the habit

## API Endpoints

All REST endpoints require `x-telegram-id` header.

| Method | Path | Description |
|---|---|---|
| POST | `/telegram/webhook` | Telegram bot webhook |
| GET | `/users/me` | Current user profile |
| POST | `/habits` | Create a habit |
| GET | `/habits` | List all habits |
| GET | `/habits/:id` | Get a habit |
| PATCH | `/habits/:id` | Update a habit |
| DELETE | `/habits/:id` | Delete a habit |
| POST | `/habits/:id/completions` | Complete a habit for today |
| DELETE | `/habits/:id/completions/today` | Remove today's completion |
| GET | `/statistics` | User statistics |

Swagger docs available at `/api/docs`.

## Database Models

- **User** — id, telegramId, username, firstName, timezone
- **Habit** — id, userId, title, emoji, frequency (DAILY/WEEKLY/CUSTOM), target, archived
- **Completion** — id, habitId, date (once per calendar day), value
- **Reminder** — id, habitId, time (HH:MM), enabled

## Design

- Modular architecture with dependency injection
- Business logic in services, controllers handle request/response only
- DTOs validated with class-validator
- Global exception filter (no database errors exposed)
- Global validation pipe (whitelist + forbidNonWhitelisted + transform)
