# ROZ-40 Basic Profile Design

## Goal

Replace the generic empty `/app/:tenant/settings/profile` cabinet placeholder
with the basic profile experience promised by ROZ-40.

## Scope

The screen shows the authenticated user's display name and phone number, plus
the current tenant name and the user's role in that tenant. The display name is
editable. Phone, tenant, and role are read-only.

Changing the phone number, expanded security controls, avatars, and business
settings remain out of scope.

## Architecture

Create a dedicated lazy-loaded `ProfileScreen` and map the released `profile`
registry entry to it in the cabinet route table. The screen consumes the
existing authenticated user and current cabinet snapshot; it does not fetch a
second copy of profile or tenant data.

Add a narrow `updateName(name)` operation to `AuthContext`. It delegates to the
existing `authApi.updateName`, then replaces the authenticated user in context
with the returned user. This keeps the new access token and displayed name in
sync without re-running the full tenant bootstrap.

## User Interface

Use only the cabinet's existing layout, typography, colors, borders, form
controls, focus treatment, and responsive conventions. Do not introduce a new
palette, decorative component family, or visual language.

The screen contains:

- the `Профіль` heading;
- an editable `Ім’я` field;
- read-only `Телефон`, `Роль`, and `Поточна розбірка` values;
- one save action using the existing button treatment;
- accessible pending, success, validation, and failure feedback.

The save action is disabled while a request is pending, when the trimmed name
is unchanged, or when it is shorter than two characters. All interactive
targets follow the cabinet's existing minimum-size conventions.

## Data Flow and Failure Handling

On submit, the screen trims the name and calls `auth.updateName(name)`. A
successful response updates `auth.user` immediately and shows a confirmation.
An API failure preserves the typed value and current authenticated state, then
shows a generic retryable Ukrainian error without exposing backend details.

Repeated submits are blocked while the request is pending. Unmounting the
screen prevents late local status updates; the AuthContext update remains the
authoritative session result.

## Verification

Tests must first fail against the current placeholder and missing context
operation. Coverage includes:

- the profile route loads the dedicated screen rather than the generic module;
- all four approved values render from real context data;
- unchanged and invalid names cannot be submitted;
- a valid trimmed name reaches the existing API and updates context/UI;
- pending requests disable duplicate submission;
- a rejected update keeps the form usable and renders truthful feedback;
- existing route, auth, cabinet, type, lint, format, and build gates remain
  green.
