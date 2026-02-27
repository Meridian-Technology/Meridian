# Org Messages / Announcements – Frontend & Backend Audit

**Scope:** `orgMessageRoutes.js`, `orgMessage.js` (schema), `OrgMessageComposer.jsx`, `OrgMessageFeed.jsx`  
**Date:** 2025-02-04

---

## Executive summary

- **Backend:** Solid auth, validation, visibility, and notifications. One **critical bug** (PUT edit crashes), a few consistency and hardening gaps.
- **Frontend:** Composer and feed are aligned with the API; one **bug** in `canPost` (wrong path) and a **refetch race** after posting.
- **Schema:** Clear and indexed; no issues.

---

## 1. Backend (`orgMessageRoutes.js`)

### 1.1 Critical bug – PUT edit route

**Issue:** The PUT handler for editing a message (lines 763–884) does **not** include `OrgMember` in its `getModels()` call but later uses `OrgMember.findOne()` to attach `authorRole` to the response (lines 853–864). This causes a **ReferenceError** when any user edits a message.

**Fix:** Add `OrgMember` to `getModels` in the PUT route:

```javascript
const { OrgMessage, Org, OrgMember, Event, OrgManagementConfig } = getModels(req, 'OrgMessage', 'Org', 'OrgMember', 'Event', 'OrgManagementConfig');
```

### 1.2 Validation & security

- **Auth:** All routes use `verifyToken`; no unauthenticated access.
- **Authorization:** Post/reply require active membership; visibility and relationship (`getUserRelationship`) are enforced on GET; delete allows author or org owner/admin.
- **Input:** Content is trimmed and checked for empty; character limits (org + system) and profanity are applied; `visibility` is effectively constrained by backend default when not sent.
- **Gaps:**
  - **Pagination:** `limit` and `page` from query are not validated or capped. A client can send `limit=100000`, causing heavy queries. Recommend: `limit = Math.min(Math.max(1, parseInt(limit) || 20), 100)` and similar for `page`.
  - **ObjectIds:** `orgId`, `messageId`, `parentMessageId` are not validated as valid ObjectIds before use; invalid IDs can cause 500s instead of 400s. Consider validating with `mongoose.Types.ObjectId.isValid()` and returning 400 for invalid IDs.
  - **Reply min length:** POST create enforces `minCharacterLimit` (e.g. 100); POST reply does not. If that minimum is intentional for top-level posts only, document it; otherwise apply the same min to replies.

### 1.3 Visibility & permissions

- **Posting:** `canUserPost()` correctly gates on `org.messageSettings.postingPermissions` and member role.
- **Reading:** `findByOrg` and single-message GET correctly filter by `userRelationship` and message `visibility`.
- **Replies:** Replies inherit parent visibility; reply count and soft-delete cascade are consistent.

### 1.4 Notifications

- New message, event mention, and reply notifications are sent with try/catch; failures are logged and do not fail the main request. Template keys (`org_message_new`, etc.) are consistent.

### 1.5 Logging & errors

- **Logging:** `console.log` is used for success and some validation (e.g. “Message content is required”). Consider moving validation logs to debug level and avoiding logging full `messagesWithRoles` in production (line 381) for size and PII.
- **Errors:** 404/403/400 are returned appropriately; 500 handler exposes `error.message`. Consider not sending internal `error.message` to the client in production.

---

## 2. Backend schema (`orgMessage.js`)

- **Structure:** `orgId`, `authorId`, `content`, `visibility`, `mentionedEvents`, `links`, `likes`, `likeCount`, `replyCount`, `parentMessageId`, `isDeleted`, `deletedAt`, `metadata` are well-defined.
- **Indexes:** Appropriate indexes for org feed, author, replies, and soft-delete.
- **Pre-save:** `likeCount` is kept in sync with `likes.length`.
- **Soft delete:** Instance method and static queries use `isDeleted: false`.
- **Note:** `links` is `[String]` with no URL format validation; if these are rendered as links in the UI, ensure they are sanitized/validated or rendered in a safe way (e.g. allowlist scheme, no `javascript:`).

---

## 3. Frontend – Composer (`OrgMessageComposer.jsx`)

### 3.1 Alignment with backend

- **Endpoint:** POST `/org-messages/${orgId}/messages` with `content` and `visibility`.
- **Limits:** Character limits are derived from `systemConfig` and `orgData?.org?.overview?.messageSettings?.characterLimit` (fixed to use `overview` to match get-org-by-name response).
- **Visibility:** Default from `orgData?.org?.overview?.messageSettings?.visibility` or system config to match backend `org.messageSettings.visibility`.

### 3.2 Validation & UX

- **Client-side:** `validateContent()` checks required, min length, and max length; errors are shown and submit is disabled when invalid.
- **Backend errors:** Profanity or other server errors are shown via `validationError` and notifications.
- **RichTextInput:** Event mentions and `maxLength={characterLimit + 100}` are used; the extra 100 may be for mention markup. Confirm backend receives final content length after parsing; if the backend counts stored content only, this is fine.

### 3.3 Minor

- **Default visibility in effect:** `useEffect` sets `visibility` from org/system config; if `defaultVisibility` is not in the API response, the composer still falls back to `'members_and_followers'`, which matches the backend default.

---

## 4. Frontend – Feed (`OrgMessageFeed.jsx`)

### 4.1 Bug – `canPost` path

**Issue:** `canPost` is computed as:

```javascript
const canPost = orgData?.org?.isMember && orgData?.overview?.messageSettings?.enabled !== false;
```

`orgData` here is the full get-org response; the org document (including `messageSettings`) is under `org.overview`, not at the top level. So `orgData?.overview` is undefined and `canPost` is effectively `orgData?.org?.isMember && undefined !== false` → `orgData?.org?.isMember`. Messaging enabled is never considered, so the composer can show even when messaging is disabled.

**Fix:** Use the same shape as the API:

```javascript
const canPost = orgData?.org?.isMember && orgData?.org?.overview?.messageSettings?.enabled !== false;
```

### 4.2 Refetch after new message

**Issue:** `handleNewMessage` does `setPage(1)` then `setTimeout(() => refetch(), 100)`. When the user had previously clicked “Load More”, `page` was 2. The `refetch` from `useFetch` closes over the URL at the time it was created, so it may still request `page=2`. That can leave the feed showing page-2 data or a mix, and the “refresh” after post can be wrong.

**Fix:** Rely on the URL changing when `page` is set to 1. When `page` becomes 1, `useFetch`’s URL changes and it will refetch automatically. So you can remove the `setTimeout` and `refetch()` and just do:

```javascript
const handleNewMessage = () => {
    setPage(1);
};
```

If your `useFetch` does not refetch when the URL changes, then ensure the feed uses a key or dependency so that when `page` is set to 1, the next request is for page 1 (e.g. pass `page` into the hook and let the effect re-run with the new URL). The current `useFetch` does depend on `url`, so when `page` updates to 1 the URL updates and a new fetch runs; the explicit `refetch()` is unnecessary and can be wrong.

### 4.3 Pagination

- **Load more:** Incrementing `page` and appending `data.messages` is correct; “Load More” is disabled while `loading`.
- **Initial load:** Loading and error states are handled; empty state is clear.

---

## 5. Frontend–backend consistency

| Area              | Backend                         | Frontend                               | Status / note                                      |
|-------------------|----------------------------------|----------------------------------------|----------------------------------------------------|
| Post URL          | `POST /:orgId/messages`          | `POST /org-messages/${orgId}/messages` | OK (mount prefix)                                  |
| Visibility enum   | `members_only`, `members_and_followers`, `public` | Same options in select                 | OK                                                 |
| Character limits  | org + system, min/max            | From config + org                       | OK                                                 |
| Messaging enabled | `org.messageSettings.enabled`    | Was `orgData?.overview?.…` (wrong)      | Fix feed to use `orgData?.org?.overview?.messageSettings?.enabled` |
| Default visibility| `org.messageSettings.visibility`| `msgSettings?.visibility` (org.overview) | Fixed: composer now uses `org.overview.messageSettings` |

---

## 6. Recommended fixes (priority)

1. **Critical:** Add `OrgMember` to the PUT edit route’s `getModels()` so edits don’t throw.
2. **High:** Fix feed `canPost` to use `orgData?.org?.overview?.messageSettings?.enabled`.
3. **High:** Simplify `handleNewMessage` to only `setPage(1)` (rely on URL change to refetch).
4. **Medium:** Cap and validate `page` and `limit` in GET `/:orgId/messages`.
5. **Medium:** Validate `orgId` and `messageId` (and optionally `parentMessageId`) as ObjectIds; return 400 when invalid.
6. **Done:** Composer uses `orgData?.org?.overview?.messageSettings` for characterLimit and visibility (matches get-org-by-name shape).
7. **Low:** Align reply min character limit with top-level posts if desired; document otherwise.
8. **Low:** Reduce or guard logging of large payloads and avoid exposing internal error messages in production.

---

## 7. Files touched in audit

- `Meridian/backend/routes/orgMessageRoutes.js`
- `Meridian/backend/schemas/orgMessage.js`
- `Meridian/frontend/src/components/OrgMessages/OrgMessageComposer.jsx`
- `Meridian/frontend/src/components/OrgMessages/OrgMessageFeed.jsx`
- Referenced: `useFetch`, Org schema, get-org-by-name response shape.
