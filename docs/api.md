# REST API `/api/v1`

Mọi response:

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": { "code": "unauthorized", "message": "…" } }
```

Auth: cookie `anp_session` (HttpOnly, SameSite=Lax) hoặc `Authorization: Bearer <token>`.

Mutation kiểm tra `Origin`.

## Auth

| Method | Path | Mô tả |
| --- | --- | --- |
| POST | `/auth/register` | name, email, password, confirmPassword |
| POST | `/auth/login` | email, password, device* |
| POST | `/auth/logout` | |
| POST | `/auth/verify-email` | token từ email |
| POST | `/auth/verify-email/resend` | gửi lại email xác minh |
| GET | `/auth/me` | user + settings + vaultUnlocked |
| PATCH | `/auth/me` | name |
| POST | `/auth/password` | đổi mật khẩu |
| PATCH | `/auth/settings` | theme, slideshowSeconds |
| POST | `/auth/vault/pin` | đặt / đổi PIN |
| POST | `/auth/vault/unlock` | |
| POST | `/auth/vault/lock` | |

## Media & upload

| Method | Path |
| --- | --- |
| POST | `/uploads` |
| GET | `/uploads/:id` |
| PUT | `/uploads/:id/parts/:n` |
| POST | `/uploads/:id/complete` |
| PUT | `/uploads/:id/thumb` |
| DELETE | `/uploads/:id` |
| GET | `/media` cursor pagination |
| GET | `/media/map` |
| GET | `/media/calendar` |
| GET | `/media/memories` |
| GET | `/media/duplicates` |
| GET | `/media/:id` |
| PATCH | `/media/:id` |
| GET | `/media/:id/file` `?share=&dl=` |
| GET | `/media/:id/thumb` |
| GET | `/media/:id/preview` |
| POST | `/media/batch/favorite` |
| POST | `/media/batch/private` |
| POST | `/media/batch/delete` |

Query `/media`: `type`, `favorite`, `q`, `from`, `to`, `albumId`, `momentId`, `recent=1\|7\|30`, `hasGps`, `private=1`, `trash=1`, `cursor`, `limit`, `sort=taken\|uploaded`.

## Albums / shares / trash

`/albums`, `/albums/:id`, `/albums/:id/items`, `/albums/:id/media`

`/shares` CRUD. Public: `/shares/public/:token`, `/unlock`, `/download/:mediaId`

`/trash/restore`, `/trash/purge`, `/trash/info`

## Hệ thống

`/storage`, `/storage/cleanup`

`/devices`, `DELETE /devices/:id`, `DELETE /devices/sessions/:id`

`/backup`, `/backup/:id/check`, `/progress`, `/complete`

`/drop`, `/drop/code/:code`, `/drop/:id/files`

`/notifications`, `/notifications/read`

`/activity`

`/moments`, `/moments/rebuild`, `PATCH /moments/:id`

`/home`

`/jobs`, `POST /jobs/export`, `/jobs/:id/file`

`GET /health`
