---
name: Bug report
about: Something in Mecena is not working as expected
labels: bug
---

<!--
Thanks for taking the time to report this. Please do not paste passwords, API keys, invite codes
or personal data you would not want public. Security problems go to the maintainers privately
(see SECURITY.md), never in an issue.
-->

**Describe the bug**
A clear description of what happens. E.g. "On my phone the voice onboarding stops hearing me after the second question."

**To reproduce**
1. Go to '...' (e.g. https://mecena.fly.dev/onboarding)
2. Tap / type '...'
3. See error

**Expected behavior**
What you expected to happen instead.

**Environment**
- Where: [e.g. the live app at https://mecena.fly.dev, or local `npm run dev` at commit `46dfa4f`]
- Page / URL: [e.g. `/convocatorias`, `/dossier`, `/solicitud/...`]
- Account type: [creator / pyme]
- Plan: [free / Mecena Pro / Solicitud premium credit]
- Device and OS: [e.g. iPhone 15, iOS 26; Pixel 8, Android 16; laptop, Ubuntu 24.04]
- Browser: [e.g. Safari, Chrome 142, Firefox]
- Input mode, if it is the onboarding: [voice / text]
- Local only: AI on mocks (no `ANTHROPIC_API_KEY`) or with a real key?

**Logs / screenshots**
A screenshot or screen recording helps a lot, especially for layout problems on phones.
For dictation problems on a phone, opening the onboarding with `?voz=debug` shows the speech events on screen: a screenshot of that is very useful.
If you run Mecena locally, paste the relevant terminal output from `npm run dev` or the browser console.
