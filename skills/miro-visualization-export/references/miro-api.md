# Miro API Quick Reference

Use this reference when implementing or troubleshooting export behavior.

## Required Scopes

- `boards:read`
- `boards:write`

## OAuth

- Authorize URL:
  - `GET https://miro.com/oauth/authorize`
  - Query params: `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`
- Token exchange:
  - `POST https://api.miro.com/v1/oauth/token`
  - Query params: `grant_type=authorization_code`, `client_id`, `client_secret`, `code`, `redirect_uri`
- Token refresh:
  - `POST https://api.miro.com/v1/oauth/token`
  - Query params: `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`

## Export Endpoints

- List tags on board:
  - `GET /v2/boards/{board_id}/tags?limit=<1..50>&offset=<n>`
- Create tag:
  - `POST /v2/boards/{board_id}/tags`
  - JSON body: `{ "title": "surface.navigation", "fillColor": "blue" }`
- Upload image from local file:
  - `POST /v2/boards/{board_id}/images`
  - `multipart/form-data`
  - part `resource`: binary file (max 6 MB)
  - part `data`: JSON string with optional `title`, `altText`, `position`
- Attach tag to item:
  - `POST /v2/boards/{board_id}/items/{item_id}?tag_id=<tag_id>`
  - Success status: `204`

## Notes

- Tags are board-scoped and title is case-sensitive.
- REST tag changes might require a board refresh to appear visually.
- Keep local evidence IDs and file paths as source of truth; store Miro item IDs only as export metadata.
