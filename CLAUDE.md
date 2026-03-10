## Current Build: The Prospector (SAM.gov Integration)

Full technical spec is in /docs/PROSPECTOR_SAM_GOV_SPEC.md — read it before
starting any Prospector-related work.

Key context:
- This is a new "Opportunities" tab in the existing Bid Assassin app
- Uses SAM.gov public API to scan federal contract opportunities
- Matches opportunities against member company profiles using a 5-factor scoring model
- Notifications via Resend (email) and Web Push
- Pre-fills the Proposal Builder when a member clicks "Build Proposal"
- Database: Supabase PostgreSQL with RLS
- Frontend: React with existing sidebar nav pattern