# shadcn/ui primitives

This folder is reserved for shadcn/ui components, per the #112 stack
decision. Components are added here as they are needed by the popup/side
panel UI; each component is a self-contained `.tsx` file with its styles
handled by Tailwind v4 utilities plus `cva`/`tailwind-merge` for headless
logic.

No components are included in the initial scaffold — the folder exists to
match the structure promised in #112 and to make the first `npx shadcn@latest
add button` land in the expected location.
