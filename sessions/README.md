# Workout Tracker Core Sessions

This folder is the reusable home for session domain code.

Current migrated scope:

- Shared session types
- Pure session utility calculations
- Progressive overload recommendation calculation
- Progressive overload recommendation persistence

Compatibility exports remain under `src/features/sessions/*` so existing app
screens can migrate gradually.

Keep in the app layer:

- React Native screens
- Navigation and alert flows
- Hooks that depend on app stores, feature gates, or UI state
- Exercise image assets

Move here over time:

- Session repositories and SQL query helpers
- Session quality calculation
- Missed/skipped exercise detection
- Recovery and gap analytics
- UI-independent session lifecycle orchestration
