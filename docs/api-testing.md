# API-Test-Eigenheiten (JSON:API)

Referenz für die API-Smoke-Test-Suite (`api-tests/`), die direkt gegen die hitobito JSON:API (`/api/*`) testet – ohne Browser, ohne Login/2FA. Alle Erkenntnisse stammen aus dem hitobito-Quellcode (`/home/patrick/Data/SourceCode/GitHub/hitobito/development/app/hitobito`) sowie Verifikation gegen die INTEGRATION-Instanz.

## Authentifizierung: Service Token statt Login

Die JSON:API akzeptiert einen `ServiceToken` per Header `X-Token: <token>` (alternativ Query-Param `?token=`, aber Header bevorzugt). Kein Cookie/Session/2FA nötig – dadurch ist die API-Suite komplett unabhängig von `auth.setup.ts`.

```typescript
extraHTTPHeaders: {
  Accept: 'application/vnd.api+json',
  'X-Token': process.env.HITOBITO_API_TOKEN || '',
}
```

Ungültiges/unbekanntes Token → **401** (`JsonApiUnauthorized`). Gültiges Token, aber fehlender Scope/keine Berechtigung auf die Ressource → **403** (`CanCan::AccessDenied`). Nicht existierende ID → **404** (`Graphiti::Errors::RecordNotFound`).

## Service-Token-Berechtigungsmodell

Ein `ServiceToken` hat zwei unabhängige Dimensionen, beide müssen passen:

1. **Scope-Flags** (Checkboxen bei Erstellung): `groups`, `people`, `events`, `event_participations`, `invoices`, `mailing_lists`, `register_people`. Ohne aktivierten Scope → 403, egal wie hoch die Permission ist.
2. **Permission** (`layer_read` / `layer_and_below_read` / `layer_full` / `layer_and_below_full`), verknüpft mit einer **Layer-Gruppe**. Der Token simuliert intern einen User mit genau einer Rolle auf dieser Layer-Gruppe (`ServiceToken#dynamic_user`). `layer_and_below_read` auf einer übergeordneten Layer (z.B. Dachgruppe) wirkt automatisch auch auf untergeordnete Layers (z.B. eine Jungschar-Gruppe darunter) – ein einzelner Token kann so mehrere Testszenarien über Gruppengrenzen hinweg abdecken.

**Aktuell verwendeter Token** ("E2E API Smoke Test", in `.env`/GitHub-Secret `HITOBITO_API_TOKEN`):
- Layer: **E2E Mio (582)**
- Permission: **`layer_and_below_read`**
- Scopes: `groups`, `people`, `events`, `event_participations`

Deckt damit ab: Gruppe 582 selbst, Personen/Anlässe/Kurse/Teilnehmer in allen darunterliegenden Layers (u.a. E2E Jungschar 584).

## Kurs ist kein eigener Endpoint – STI-Subtyp von Event

Es gibt **keinen** `/api/courses`-Endpoint. Ein Kurs ist `Event::Course`, ein STI-Subtyp von `Event`, und läuft über denselben Endpoint wie ein Anlass:

```
GET /api/events/:id
```

Der JSON:API `type` im Response unterscheidet sich aber je nach Subtyp:
- Anlass: `"type": "events"`, Attribut `attributes.type` ist `null`
- Kurs: `"type": "courses"`, Attribut `attributes.type` ist `"Event::Course"`

Beispiel Kurs-Response (verifiziert gegen Gruppe 582 / Event 1459):
```json
{
  "data": {
    "id": "1459",
    "type": "courses",
    "attributes": { "type": "Event::Course", "name": "E2E API Kurs", "kind_id": 3, "participant_count": 1, ... }
  }
}
```

## Teilnehmer (Anlass & Kurs): gleicher Endpoint, gefiltert

Es gibt keinen verschachtelten `/api/events/:id/participations`-Endpoint. Stattdessen die flache Ressource mit Filter:

```
GET /api/event_participations?filter[event_id]=<eventId>
```

**Falle:** `Event::ParticipationResource#base_scope` filtert zusätzlich auf `active: true`. Eine Teilnahme, die (z.B. bei einem Kurs mit `supports_applications`) im Status "applied" hängen bleibt (siehe [[docs/ui-testing.md]] – "Kurs-Teilnahme via Roles-Controller"), taucht möglicherweise **nicht** in dieser Liste auf, auch wenn sie über die UI sichtbar ist. Für stabile Test-Fixtures muss die Teilnahme bestätigt/zugeteilt sein (`active: true` im Response prüfen).

Mit curl gegen die echte Instanz verifizieren (Achtung: `curl` interpretiert `[` `]` als Range-Glob, daher `-g`/`--globoff` nötig):
```bash
curl -g -H "X-Token: $TOKEN" -H "Accept: application/vnd.api+json" \
  "https://cevi.puzzle.ch/api/event_participations?filter[event_id]=1459"
```

## Permanente API-Test-Fixtures

Im Gegensatz zu den UI-Tests (die ihre Anlässe/Kurse selbst erstellen und löschen) braucht die API-Suite **stabile, dauerhaft existierende** Events, da sie nichts selbst anlegt. Diese Fixtures sind manuell erstellt (nicht Teil der Test-Lifecycle) und in der README dokumentiert:

| Fixture | ID | Gruppe | Teilnehmer |
|---|---|---|---|
| E2E API Anlass | 1458 | E2E Jungschar (584) | E2E AL (3552), aktiv |
| E2E API Kurs | 1459 | E2E Mio (582) | Person 3550, aktiv |

## Format-Konstante

Route-Scope erzwingt `format: "jsonapi"` als Default (`ApplicationResource.endpoint_namespace = "/api/"`), d.h. `GET /api/groups/582` funktioniert ohne Extension. `Accept: application/vnd.api+json` trotzdem immer mitschicken (JSON:API-Konvention, macht Intent explizit).
