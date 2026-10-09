# THINKLESS PROJECT - COPILOT INSTRUCTIONS

## 1. TOKEN ECONOMY & EXTREME CONCISION (CRITICAL)

- ALWAYS be extremely concise. Zero greetings, preambles, conversational filler, or summaries.
- NEVER rewrite entire files. Output ONLY modified lines, functions, or diffs.
- Use `// ... existing code ...` to preserve unchanged code blocks.
- Provide raw code directly without unnecessary prose.
- Provide step-by-step testing instructions ONLY if explicitly asked.

## 2. BACKEND BEST PRACTICES (Node.js / Express / MySQL / Docker)

- Architecture: Keep existing MVC pattern with thin, modular controllers and route middleware.
- Security & SQL: Use async/await and parameterized MySQL queries (`mysql2`) exclusively to prevent SQL injection. Implement `helmet` and input validation.
- Error Handling: Use try/catch blocks with clear console logs. Handle DB errors gracefully without crashing Docker. Return standard HTTP status codes.
- Comments: Document modified functions and complex backend logic with concise comments in French.

## 3. UI/UX & TAILWIND BEST PRACTICES (Pitch-Side Mobile-First)

- Mobile-First & Touch: Mobile-optimized views. Interactive elements MUST have a minimum tap target of 44x44px for pitch-side use.
- Sunlight Readability: High contrast typography (WCAG 2.1 AA), distinct badge colors for status, scores, and jersey numbers.
- Tailwind CSS: Use standard Tailwind utility classes directly in HTML. Never use `@apply` in custom CSS files.
- Fluid Layouts: Use Flexbox and CSS Grid with relative units (rem, em, %) instead of fixed pixel widths.
- User Feedback: Show loading indicators for async actions and provide immediate DOM feedback.

## 4. CODE IMPLEMENTATION GUIDELINES

- JS Style: Modern, clean Vanilla JavaScript (ES6+), async/await, fetch API. No extra external frontend frameworks.
- Clean Code: Use early returns to improve readability. Write DRY, self-documenting code.
- Naming Conventions: Match existing codebase conventions. Name event handlers with a `handle` prefix (e.g., `handleClick`, `handleSubmit`).
- Accessibility: Use semantic HTML5 (`<main>`, `<nav>`, `<section>`, `<article>`) and proper ARIA attributes/labels.
