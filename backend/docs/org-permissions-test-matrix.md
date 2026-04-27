# Org Permissions Test Matrix

## Route Authorization

- `GET /org-roles/:orgId/members`
  - non-member -> `403`
  - member without `manage_members` -> `403`
  - manager/owner -> `200`
- `POST /org-roles/:orgId/members/:userId/role`
  - non-member -> `403`
  - manager assigning above own order -> `403`
  - assigning `owner` without transfer -> `403`
  - valid manager assignment -> `200`
- `GET /org-roles/:orgId/roles/:roleName/members`
  - non-member -> `403`
  - member without `manage_members` -> `403`
  - manager/owner -> `200`
- `GET /org/:orgId/forms`
  - member without `manage_members` -> `403`
  - manager/owner -> `200`

## Ownership Invariants

- transfer ownership endpoint updates:
  - `Org.owner` to target user
  - target `OrgMember` includes `roles: ['owner', ...]`
  - previous owner loses `owner` role
- `owner` role cannot be assigned through general role assignment endpoint

## Multi-Role Compatibility

- existing records with only `role` are backfilled to `roles: [role]`
- permission checks resolve from union of `roles[]`
- invite acceptance copies `roles[]` and sets legacy `role` to first element

## Frontend Regression Checks

- `RoleManager` shows owner role as visible immutable system role
- member role assignment modal supports selecting multiple roles
- role options above actor hierarchy are hidden/disabled
- application approval includes selected role payload
