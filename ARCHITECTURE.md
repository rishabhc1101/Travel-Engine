# Application Architecture & Flow

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                               │
│                                                                     │
│   React 19 + TypeScript (Vite)  ──  http://localhost:5173 (dev)    │
│   TailwindCSS v4  │  React Router v7  │  axios  │  Firebase JS SDK │
└────────────────────┬────────────────────────────────────────────────┘
                     │  HTTP/SSE  (proxied via Vite → localhost:5152)
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   ASP.NET Core 8 Web API                            │
│                   http://localhost:5152 (dev)                       │
│                                                                     │
│   Controllers  │  EF Core 8  │  Firebase JWT middleware             │
│   Background service: WeatherPollingService (every 30 min)         │
└──────┬─────────────┬──────────────────┬──────────────────┬──────────┘
       │             │                  │                  │
       ▼             ▼                  ▼                  ▼
  PostgreSQL    Firebase Auth      Google Cloud        OpenWeatherMap
  (Docker /     (token            Pub/Sub              API (free tier)
  Cloud SQL)    verification)     (weather-alerts,
                                  trip-updates topics)
```

---

## External Services

| Service | What it does | Where configured |
|---|---|---|
| **Firebase Auth** | User sign-in (Google OAuth + Email/Password). Issues a signed JWT ID token. | `Firebase:ProjectId` in appsettings |
| **Google Cloud Pub/Sub** | Message bus for real-time weather alerts and trip update events | `Gcp:ProjectId` in appsettings + GCP credentials |
| **OpenWeatherMap API** | Fetches current weather for trip destinations | `Weather:OpenWeatherMapApiKey` in appsettings |
| **Google Maps JS API** | Interactive map with activity markers in the browser | `VITE_GOOGLE_MAPS_API_KEY` in frontend `.env.local` |
| **PostgreSQL** | Stores users, trips, itinerary days, activities | Connection string in appsettings |

> **AI/Gemini note:** Vertex AI is currently replaced with a built-in template-based itinerary generator. No external call is made for trip planning. To enable Gemini later, implement `IGeminiService` with `Google.Cloud.AIPlatform.V1` and swap the registration in `Program.cs`.

---

## How Docker Postgres Connects to the API

```
Your Laptop
┌─────────────────────────────────────────────┐
│                                             │
│  .NET API  ──→  localhost:5432  ──────────┐ │
│                                           │ │
│  Docker Desktop                           │ │
│  ┌────────────────────────────────────┐   │ │
│  │  travel-pg container               │   │ │
│  │  PostgreSQL 16                     │←──┘ │
│  │  Internal port: 5432               │     │
│  │  Mapped to host: 5432 (-p 5432:5432│     │
│  └────────────────────────────────────┘     │
└─────────────────────────────────────────────┘
```

The `-p 5432:5432` flag in the `docker run` command punches a hole in Docker's network isolation. Any process on your laptop that connects to `localhost:5432` is forwarded into the container. The API's connection string `Host=localhost;Port=5432;Database=travelengine` points there exactly.

**Auto-migration**: `Program.cs` runs `dbCtx.Database.MigrateAsync()` at startup — it reads `__EFMigrationsHistory` in Postgres and applies any pending migration files from `Migrations/`. You never need to run `dotnet ef database update` manually in development.

---

## Authentication Flow (end-to-end)

```
Browser                        Firebase              .NET API
   │                               │                    │
   │  1. Click "Sign in with Google"│                   │
   │──────────────────────────────►│                    │
   │                               │                    │
   │  2. Firebase returns ID Token │                    │
   │◄──────────────────────────────│                    │
   │  (JWT signed by Google,        │                   │
   │   audience = Firebase ProjectId)                   │
   │                               │                    │
   │  3. POST /api/users/profile                        │
   │     Authorization: Bearer {ID token}               │
   │──────────────────────────────────────────────────►│
   │                               │                    │
   │                               │  4. JwtBearer middleware fetches Google's
   │                               │     public keys from:
   │                               │  https://securetoken.google.com/{projectId}
   │                               │  Validates: issuer, audience, expiry, signature
   │                               │                    │
   │                               │  5. User UID extracted from
   │                               │     ClaimTypes.NameIdentifier claim
   │                               │                    │
   │  6. 200 OK + UserProfileDto   │                    │
   │◄──────────────────────────────────────────────────│
```

Every subsequent API call repeats steps 3–6. The token is attached automatically by the axios interceptor in `frontend/src/lib/api.ts`.

---

## Trip Planning Flow

```
PlanTripPage (browser)            .NET API              PostgreSQL
       │                              │                      │
       │  POST /api/trips/plan        │                      │
       │  { destination, dates,       │                      │
       │    budget, interests,        │                      │
       │    constraints, prompt }     │                      │
       │─────────────────────────────►│                      │
       │                              │                      │
       │                              │  Validate input      │
       │                              │  (date range, budget)│
       │                              │                      │
       │                              │  GeminiService       │
       │                              │  .GenerateItinerary()│
       │                              │  ┌────────────────┐  │
       │                              │  │Template-based  │  │
       │                              │  │generator:      │  │
       │                              │  │• N days from   │  │
       │                              │  │  date range    │  │
       │                              │  │• 4 activities  │  │
       │                              │  │  per day       │  │
       │                              │  │• Budget split  │  │
       │                              │  │  25/20/30/25%  │  │
       │                              │  │• Interest-based│  │
       │                              │  │  activity names│  │
       │                              │  └────────────────┘  │
       │                              │                      │
       │                              │  INSERT Trip         │
       │                              │  INSERT ItineraryDays│──►│
       │                              │  INSERT Activities   │
       │                              │                      │
       │                              │  Pub/Sub: publish    │
       │                              │  "trip-updates" topic│
       │                              │                      │
       │  201 Created + TripDetailDto │                      │
       │◄─────────────────────────────│                      │
       │                              │                      │
       │  navigate to /trips/{id}     │                      │
```

---

## Real-time Weather Alert Flow (SSE)

```
TripDetailPage              .NET API              Pub/Sub        WeatherPollingService
      │                         │                    │                  │
      │  GET /api/trips/{id}/stream                  │                  │
      │  (EventSource with token)                    │                  │
      │────────────────────────►│                    │                  │
      │                         │  Subscribe to      │                  │
      │  text/event-stream      │  "trip-updates-sub"│                  │
      │  (connection stays open)│───────────────────►│                  │
      │                         │                    │                  │
      │          (every 30 minutes)                  │                  │
      │                         │                    │  CheckActiveTrips│
      │                         │                    │◄─────────────────│
      │                         │                    │                  │
      │                         │                    │  OpenWeatherMap  │
      │                         │                    │  API call per    │
      │                         │                    │  active trip     │
      │                         │                    │                  │
      │                         │  weather-alert msg │  Publish to      │
      │                         │◄───────────────────│  "weather-alerts"│
      │                         │                    │  topic           │
      │  event: weather-alert   │                    │                  │
      │  data: {json}           │                    │                  │
      │◄────────────────────────│                    │                  │
      │                         │                    │                  │
      │  Toast notification     │                    │                  │
      │  shown to user          │                    │                  │
```

---

## Database Schema

```
Users
├── Uid (PK, string — Firebase UID)
├── DisplayName
├── Email (unique)
├── TravelPreferences (JSONB)
└── CreatedAt

Trips
├── Id (PK, Guid)
├── UserId (FK → Users.Uid)
├── Title, Destination
├── Latitude, Longitude
├── StartDate, EndDate (DateOnly)
├── BudgetUsd, EstimatedCostUsd (decimal)
├── UserPrompt (text)
├── Interests (JSONB — string array)
├── Constraints (JSONB — string array)
├── Status (Draft|Confirmed|InProgress|Completed|Cancelled)
├── CreatedAt, UpdatedAt
└── ItineraryDays (1:N)
    ├── Id (PK, Guid)
    ├── TripId (FK)
    ├── DayNumber, Date
    ├── Theme, Summary
    ├── EstimatedDayCostUsd
    └── Activities (1:N)
        ├── Id (PK, Guid)
        ├── ItineraryDayId (FK)
        ├── OrderIndex, Name, Description
        ├── Category, Address
        ├── Latitude, Longitude (nullable)
        ├── StartTime, EndTime (TimeOnly)
        ├── EstimatedCostUsd
        ├── GooglePlaceId, BookingUrl
        └── WeatherNote
```

---

## Frontend Page Map

```
/ (redirect) ──→ /dashboard

/login          LoginPage        Firebase email/password + Google sign-in
/signup         SignupPage       Firebase create account
/dashboard      DashboardPage    GET /api/trips — list of trip cards
/plan           PlanTripPage     POST /api/trips/plan — submit trip form
/trips/:id      TripDetailPage   GET /api/trips/{id}
                                 GET /api/trips/{id}/stream (SSE)
                                 GET /api/trips/{id}/weather
                                 Google Maps with activity markers
```

---

## Key Files Reference

### Backend
| File | Role |
|---|---|
| `Program.cs` | App bootstrap: DI, JWT, CORS, EF migration, Swagger |
| `Controllers/TripsController.cs` | Trip CRUD + plan + weather + SSE stream |
| `Controllers/UsersController.cs` | User profile upsert + preferences |
| `Services/GeminiService.cs` | Itinerary generator (template-based; swap for Vertex AI later) |
| `Services/WeatherService.cs` | OpenWeatherMap calls + alert detection logic |
| `Services/PubSubService.cs` | Google Cloud Pub/Sub publish/subscribe wrapper |
| `BackgroundServices/WeatherPollingService.cs` | Hosted service polling weather every 30 min |
| `Data/AppDbContext.cs` | EF Core DbContext with JSONB columns and indexes |
| `Migrations/` | EF Core schema history (auto-applied at startup) |

### Frontend
| File | Role |
|---|---|
| `lib/api.ts` | axios instance — auto-attaches Firebase token to every request |
| `lib/firebase.ts` | Firebase app init from `.env.local` variables |
| `contexts/AuthContext.tsx` | Auth state, sign-in/out methods, profile sync on login |
| `hooks/useTripStream.tsx` | EventSource hook for SSE weather/trip alerts |
| `pages/PlanTripPage.tsx` | Trip planning form — interests, constraints, budget slider |
| `pages/TripDetailPage.tsx` | Full trip view with Google Map and day-by-day accordion |

---

## Local Dev — Port Summary

| Process | Port | URL |
|---|---|---|
| Vite dev server | 5173 | http://localhost:5173 |
| .NET API | 5152 | http://localhost:5152/swagger |
| PostgreSQL (Docker) | 5432 | `localhost:5432` (internal to apps) |

Vite proxies all `/api/*` requests from `5173` → `5152`, so the frontend never hard-codes the API URL.
