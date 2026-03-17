# Admin Outreach — Frontend Implementation Spec

**Designs:** Figma (see Admin Outreach flows for layout, spacing, and visual details).

This spec describes how to implement the Admin Outreach UI in the Meridian frontend. Use the existing Admin dashboard and Manage Users patterns; match styles to the Figma designs.

---

## 1. Shell & navigation

- **Use the same dashboard shell as Admin.** One route (e.g. `/admin/outreach` or under a feature-flag route) should render the Dashboard with a sidebar and three main views: **Campaigns**, **New outreach**, **Configuration**.

**Existing components:**

| Purpose | Component / asset | File path |
|--------|--------------------|-----------|
| Dashboard layout, sidebar, nav, back | `Dashboard` | `src/components/Dashboard/Dashboard.jsx` |
| Dashboard styles | — | `src/components/Dashboard/Dashboard.scss` |
| Admin logo (for consistency) | Admin logo asset | `src/assets/Brand Image/ADMIN.svg` |
| Icons | `Icon` (@iconify-icon/react) | Use `mdi:email-multiple`, `mdi:send`, `mdi:cog` for the three nav items |

**Reference implementation:** `src/pages/Admin/Admin.jsx` — same pattern: `Dashboard` with `menuItems` (each item has `label`, `icon`, `element`), `additionalClass="admin"`, `logo`, `onBack`. Copy this structure and swap in Outreach-specific menu items and panel components.

---

## 2. Design system & styling

- **Follow the Admin / Manage Users design language.** Use Meridian CSS variables and the same panel/card/input patterns so the feature feels like Admin.

**Reference files (copy patterns and class names from here):**

| Purpose | File path |
|--------|-----------|
| Panel layout, header, toolbar, list sections, buttons, inputs, badges | `src/pages/Admin/ManageUsers/ManageUsers.scss` |
| Admin dashboard content area styles | `src/pages/Admin/Admin.scss` |
| Global tokens (--text, --red, --background, --lightborder, etc.) | `src/App.scss` |

Reuse (or extend) patterns such as:

- `.manage-users-panel` → main content wrapper
- `.manage-users-header` + `h2` + `.subtitle` → page title and subtitle
- `.manage-users-toolbar` + `.search-input` + `.role-filter-select` → search and filters
- `.users-list-section` / `.users-list-header` / `.users-list` / `.user-row` → list cards and rows
- Primary/secondary/ghost buttons (e.g. `.impersonate-btn`, role chips) for actions
- `var(--red)`, `var(--background)`, `var(--lightborder)`, `var(--lighter-text)` for colors

---

## 3. Campaigns view

- **Content:** Page title, search, “New outreach” button, and a list (or table) of past campaigns with name, sent date, recipient count, status, and a “View” action.

**Existing components / patterns:**

| Purpose | Component / pattern | File path |
|--------|----------------------|-----------|
| Layout and list structure | Same as Manage Users list (header + toolbar + list section) | `src/pages/Admin/ManageUsers/ManageUsers.jsx` + `ManageUsers.scss` |
| Search input styling | `.search-input` in toolbar | `src/pages/Admin/ManageUsers/ManageUsers.scss` |
| List card and rows | `.users-list-section`, `.users-list-header`, `.users-list`, row divs | Same |
| Status badge | Similar to `.role-badge` / `.approval-badge` | Same |
| Notifications (e.g. success/error after actions) | `useNotification` | `src/NotificationContext.jsx` (or project’s notification hook) |

**Data:** Add API calls (e.g. `useFetch` or your app’s data layer) to load campaigns. “New outreach” can navigate to the New outreach view or open a create flow per Figma.

---

## 4. New outreach (compose) view

- **Content:** Two-column layout: (1) **Who receives this message?** — targeting filters (major/department, graduation year, program type, enrollment status) + estimated recipient count; (2) **Message** — subject, body, delivery note, “Send to N students” and “Save draft” buttons.

**Existing components / patterns:**

| Purpose | Component / pattern | File path |
|--------|----------------------|-----------|
| Two-column layout | Same grid as Manage Users (list + detail) | `src/pages/Admin/ManageUsers/ManageUsers.scss` (e.g. `.manage-users-content` grid) |
| Label + select | `.filter-row` + `.role-filter-select` | `src/pages/Admin/ManageUsers/ManageUsers.jsx` + `ManageUsers.scss` |
| Label + text input | `.search-input`-style input | Same SCSS |
| Textarea | Standard textarea with same border/radius/focus as other inputs | Same design tokens in `App.scss` / `ManageUsers.scss` |
| Primary / secondary buttons | Same as Manage Users (e.g. “Log in as user” / role chips) | `ManageUsers.scss` |
| Notifications | `useNotification` | As above |

**Data:** Wire filters to backend (or local state at first). Recipient count can come from an API that returns count-by-filters. Subject/body and “Send”/“Save draft” should call your outreach API.

---

## 5. Configuration view

- **Content:** Sections: (1) **Student attributes** — table/list of attribute key, label, source, editable; (2) **Data source** — primary source dropdown + last sync info; (3) **Admin roles & permissions** — who can send, who can configure; (4) **Delivery** — checkboxes for email and in-app notification, plus note about system email config.

**Existing components / patterns:**

| Purpose | Component / pattern | File path |
|--------|----------------------|-----------|
| Sectioned config layout | Similar to Event System Config or Org Management config | `src/pages/FeatureAdmin/Beacon/EventSystemConfig/EventSystemConfig.jsx` (tabs/sections only as reference) |
| Unsaved changes banner | `UnsavedChangesBanner` | `src/components/UnsavedChangesBanner/UnsavedChangesBanner.jsx` |
| Unsaved changes hook | `useUnsavedChanges` | `src/hooks/useUnsavedChanges.js` (or project equivalent) |
| Form fields and tables | Same as Manage Users: list sections, rows, selects, checkboxes | `src/pages/Admin/ManageUsers/ManageUsers.scss` |
| Save / Discard buttons | Primary and secondary buttons | Same as above |

**Data:** Load/save config via your backend. Use `useUnsavedChanges` + `UnsavedChangesBanner` when the user edits any config section.

---

## 6. Shared utilities & conventions

| Purpose | Use | File path / note |
|--------|-----|-------------------|
| API requests | Same as rest of app (e.g. `apiRequest`, `postRequest`) | e.g. `src/utils/postRequest.js` |
| Data fetching | `useFetch` (or app’s hook) | e.g. `src/hooks/useFetch.js` |
| Toasts / notifications | `useNotification` from context | `src/NotificationContext.jsx` |
| Routing | React Router; protect route with same pattern as Admin | Same as `src/App.js` admin routes |
| Auth / role checks | Reuse Admin route guard (e.g. `ProtectedRoute` with `authorizedRoles`) | `src/components/ProtectedRoute/ProtectedRoute.jsx` |

---

## 7. Suggested file structure

- **Route:** Register one route (e.g. under the same `ProtectedRoute` as Admin) that renders the Outreach dashboard.
- **Entry page:** One container (e.g. `AdminOutreach.jsx` or `Outreach/Outreach.jsx`) that composes `Dashboard` with `menuItems` pointing to the three views.
- **Views:** One component per view, e.g.:
  - `OutreachCampaigns.jsx` (+ optional `.scss`)
  - `OutreachCompose.jsx` (+ optional `.scss`)
  - `OutreachConfig.jsx` (+ optional `.scss`)
- **Styles:** Either a shared `Outreach.scss` that imports/extends Manage Users–style patterns or per-view SCSS that uses the same variables and class patterns from `ManageUsers.scss` and `App.scss`.

---

## 8. Figma

- **All layout, spacing, typography, and visual details (including empty states, loading, and errors) should follow the Admin Outreach designs in Figma.** Use this spec for which existing components and file paths to use; use Figma for pixel-accurate layout and copy.
