# SIH Demo Checklist — EcoSetu (Smart Swachh Bharat)

Run `npm run dev` (or open the deployed URL) before starting. Use the
**Reset Demo Data** button on the Citizen or Government Profile screen
beforehand if you've already run through the flow once, so the demo
starts from a clean, known state.

Login for every role: choose the role → enter any 10-digit mobile
number → OTP `123456`.

1. **Start application** — open the app; it lands on the splash screen.
2. **Select Citizen** — choose the Citizen role on the login screen.
3. **Find Bin** — from the Citizen home, open the Bin Map and locate a
   nearby bin (e.g. in Gomti Nagar).
4. **Report Overflowing Bin** — go to Report an Issue → select
   *Overflowing Bin* → confirm/pick the location.
5. **Submit complaint** — submit the report; note the new complaint ID.
6. **Switch to Government** — log out, log back in as Government
   Official.
7. **Open complaint** — go to Complaints → open the complaint just
   submitted (or the seeded `SSB2026-0048`, already in `SUBMITTED`).
8. **Assign Vikash Kumar** — assign the complaint to sanitation worker
   *Vikash Kumar*. Status becomes `ASSIGNED`.
9. **Switch to Worker** — log out, log back in as Sanitation Worker
   (defaults to Vikash Kumar as the signed-in demo worker).
10. **Start Work** — open the assigned task and tap **Start Work**.
    Status becomes `IN_PROGRESS`.
11. **Switch to Citizen** — log out, log back in as Citizen.
12. **Verify IN PROGRESS** — open My Complaints / complaint tracking and
    confirm the status now reads `IN_PROGRESS`.
13. **Switch to Worker** — log out, log back in as Worker.
14. **Mark Resolved** — open the same task and tap **Mark as Resolved**
    (optionally add a note/photo).
15. **Switch to Citizen** — log out, log back in as Citizen.
16. **Verify RESOLVED** — confirm the complaint now reads `RESOLVED`.
17. **Switch to Government** — log out, log back in as Government
    Official.
18. **Verify RESOLVED** — confirm the same complaint shows `RESOLVED`
    on the Government dashboard/complaints list, with the same ID,
    location, and assigned worker throughout.

## Notes

- The whole workflow persists in `localStorage`, so a browser refresh
  at any point during the demo does not lose progress.
- If something looks out of sync mid-demo, a refresh is safe — the
  data is read fresh from `localStorage` every time.
- Use **Reset Demo Data** (Citizen or Government Profile screen) to
  restore the seed complaints between repeated presentations.
