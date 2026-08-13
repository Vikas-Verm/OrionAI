# OrionAI public homepage implementation brief

Implement the OrionAI public landing/home page inside the existing OrionAI project so it matches the approved homepage reference image as closely as possible and is production-ready.

## Constraints

- Inspect the project before changing code: frontend framework, routing, design system, global tokens, reusable components, logo, auth routes, pricing/signup/sign-in routes, Workspace Briefing, and responsive patterns.
- Run and inspect the existing app before implementation.
- Do not redesign or modify authenticated OrionAI product pages such as Workspace Briefing, Messages, Study & Learning, Agents, integrations, or other product pages unless absolutely necessary.
- Build the public page separately and reuse OrionAI theme tokens where possible.
- The approved visual is the source of truth: near-black/navy background, understated blue borders/glow, white headlines, muted supporting text, blue CTAs, amber eyebrow text, compact radii, subtle space/orbit decoration, glowing stars, dark glass cards, and premium SaaS spacing.
- Avoid excessive gradients/animation, oversized rounded cards, white sections, cartoon UI, and fake product screenshots.

## Required page order

1. Header: OrionAI logo; About, Features, Pricing, Contact; Sign in and Get Started; mobile hamburger; smooth anchors.
2. Hero: eyebrow “AI assistant for work and life”; heading “Your personal and work command center”; supplied supporting copy; Start Free and Book Demo buttons; privacy line. The right side must be an HTML/CSS/SVG OrionAI ecosystem visual rather than a fake dashboard, with the core, orbital lines, connected app icons, and cards for Workspace Briefing, Priority Feed, Messages, AI Agent Actions, Study & Learning, Documents, and Connected Apps.
3. Integrations: Gmail, Slack, Calendar, Google Drive, Docs, Telegram, Notion, Jira.
4. Features: Workspace Briefing, Priority Feed, Grounded Answers, AI Agent Actions, Study & Learning, Focus Areas; responsive 3/2/1-column layout.
5. Focus Areas: My Day, Messages, Study & Learning, Career & Interviews, Home & Family, Customers & Payments, Clients & Projects, Team & Work, Engineering & Releases.
6. Trust: Private by design, Grounded in connected sources, Built for action not clutter.
7. Final CTA: “Start using OrionAI today” with Get Started and Contact Sales.
8. Footer with the logo and About, Features, Pricing, Contact, Privacy, Terms links.

## Functional requirements

- Reuse actual project routes and existing auth behavior. Do not create duplicate auth.
- Public visitors see the homepage. Existing authenticated `/` behavior remains unchanged.
- Sign in uses the existing sign-in flow. Get Started/Start Free use the existing signup flow. Book Demo and Contact Sales use the existing contact section if no contact system exists. Pricing uses an existing pricing page or the page anchor when absent.
- Integration and Focus Area links must not trigger OAuth or expose product pages to public visitors; they should use signup/sign-in routing as appropriate.
- Include semantic HTML, focus states, keyboard support, sufficient contrast, reduced-motion support, and no horizontal overflow.
- Keep the implementation modular with components such as the nav, hero, ecosystem visual, integrations, features, focus areas, trust section, final CTA, and footer.
- Run applicable lint, tests, and production build; visually compare desktop, tablet, and mobile views against the reference and correct differences.

## Implementation record

### Files created

- `frontend/src/components/landing/LandingPage.vue`
- `frontend/src/components/landing/LandingNavbar.vue`
- `frontend/src/components/landing/LandingBrand.vue`
- `frontend/src/components/landing/LandingIcon.vue`
- `frontend/src/components/landing/HeroSection.vue`
- `frontend/src/components/landing/OrionEcosystemVisual.vue`
- `frontend/src/components/landing/IntegrationStrip.vue`
- `frontend/src/components/landing/FeatureGrid.vue`
- `frontend/src/components/landing/FocusAreasSection.vue`
- `frontend/src/components/landing/TrustSection.vue`
- `frontend/src/components/landing/FinalCTA.vue`
- `frontend/src/components/landing/LandingFooter.vue`
- `frontend/src/styles/landing.css`
- `prompt.md`

### Files changed

- `frontend/src/App.vue`: unauthenticated `/` now presents the landing page, `/login` and `/signup` expose the existing auth component, and authenticated routing continues to use the current Workspace Briefing/product behavior.
- `frontend/src/components/auth/LoginScreen.vue`: accepts an initial tab so public Sign in and Get Started actions open the existing auth UI on the relevant tab.

### Behavior implemented

- Logo and homepage anchors work on the marketing page.
- Sign in routes to `/login`; Get Started and Start Free route to `/signup`.
- Book Demo and Contact Sales scroll to the contact CTA because the project has no existing public contact/demo endpoint.
- Public integration and focus-area cards route to signup and do not start OAuth.
- The visual is built with components, inline SVG, CSS, and existing project tokens; no rasterized app icons or dashboard screenshot were copied from the reference.
