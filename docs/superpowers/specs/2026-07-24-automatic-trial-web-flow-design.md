# Automatic Trial Web Flow

## Goal

Align the web account experience with the backend's automatic trial creation.
New tenants receive a Pro trial atomically during tenant creation, so the web app
must no longer offer or invoke manual trial activation.

## Scope

Remove the manual trial activation path from the web application:

- remove the `POST /billing/trial` API wrapper;
- remove the activation handler and activation button from the subscription UI;
- stop using `canActivateTrial` to present a trial invitation;
- present legacy `canActivateTrial: true` responses as ordinary blocked/no-plan
  states with a route to paid plans.

The backend response field may remain in `SubscriptionDto` for API compatibility,
but it will not control web behavior.

## Subscription UI Behavior

The subscription panel will derive its presentation only from `state` and the
current subscription details:

- `trial` shows the active trial plan and remaining trial days;
- `active`, `pastDue`, and `cancelled` preserve their current subscription
  presentation and actions;
- `blocked` shows that access has ended and directs the user to choose a paid
  plan;
- `none` shows that no plan is active and directs the user to available plans.

`canActivateTrial` will not change labels, plan names, styling, or available
actions. In particular, a legacy response with `state: "blocked"` and
`canActivateTrial: true` will still show the blocked paid-plan flow.

## Components and Data Flow

`AccountScreen` continues loading billing state through
`billingApi.getSubscription()`. `SubscriptionPanel` remains responsible for
rendering the state and paid-subscription actions. No client-side request will
attempt to create or activate a trial.

Tenant onboarding remains unchanged: after tenant creation, the web app
rehydrates the authenticated account and then reads the trial already created by
the backend.

## Error Handling

Existing subscription loading and paid checkout error handling remain unchanged.
There is no activation-specific loading or retry state because activation is no
longer a web operation.

If automatic trial creation fails, tenant creation is expected to fail
atomically in the backend. The web app therefore must not try to repair or retry
trial activation independently.

## Testing

Add focused subscription-panel coverage that verifies:

1. an active automatic trial renders the trial plan and remaining days without
   an activation button;
2. a legacy `blocked` response with `canActivateTrial: true` renders the
   paid-plan path and no activation button;
3. the removed billing API wrapper no longer exposes a manual activation
   operation.

Run the focused tests, then the full web checks and production build.

## Out of Scope

- removing the backend trial endpoint or `CanActivateTrial` response field;
- changing tenant creation or backend trial rules;
- changing paid subscription, cancellation, reactivation, or payment flows;
- migrating existing tenant billing records.
