# Maestro E2E

Prereqs:
- Maestro CLI: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- iOS simulator with Redeemo dev build installed OR Android emulator
- Backend running locally and seeded (see root CLAUDE.md)

Run:
```bash
maestro test .maestro/login.yaml
maestro test .maestro/auth.yaml  # requires manual email verification step
```
