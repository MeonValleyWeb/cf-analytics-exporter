# Project working agreement

- Use three-part versions (0.0.x during the initial development milestones).
- Commit completed work; each implementation commit must include a matching CHANGELOG.md entry and package version update, keeping package-lock.json synchronized.
- The first documented baseline is 0.0.1. Increment the patch version for subsequent milestones unless the user requests another release level.
- Run relevant tests and the production build before committing implementation work. Record material verification limits honestly.
- Never commit secrets, local credentials, generated builds or private verification reports. Do not deploy or push merely because local commits are requested.

- Canonical local checkout: `/Users/andrew/Projects/personal/cf-analytics-exporter`. Keep source and configuration at this Git root; do not recreate the historical nested starter folder.
