# Building with Tutors UI

A friendly, rounded component library for a tutoring product: warm coral primary, violet secondary, cream page background and the Nunito font.

## Setup

There is no provider or theme wrapper. Linking `styles.css` defines every token on `:root` and loads Nunito, so components are styled as soon as they mount. Give the page the brand background and font once:

```jsx
<div style={{ background: 'var(--tt-color-bg)', color: 'var(--tt-color-text)', fontFamily: 'var(--tt-font-sans)', minHeight: '100vh' }}>…</div>
```

`Modal` renders into `document.body` through a portal and locks page scroll while `open` is true. Always pass `onClose`, which runs on Escape, the close button and overlay clicks.

## Styling idiom

- **Components are styled through props, not classes.** For example `variant`, `size`, `tone`, `padding` and `fullWidth`. The `tt-*` class names are internal; don't write or override them.
- **Layout glue (page grids, stacks, spacing between components) uses inline styles or your own CSS that read the `--tt-*` tokens.** Never hard-code hex colors.

| Family | Tokens |
|---|---|
| Brand | `--tt-color-primary-{50,100,200,300,500,600,700}`, `--tt-color-secondary-{50,100,500,600}` |
| Status | `--tt-color-{success,warning,danger,info}-{50,600}`: 50 is the soft fill, 600 the text or solid color |
| Neutrals | `--tt-color-neutral-{0,50,100,200,300,500,600,900}` |
| Semantic | `--tt-color-bg`, `--tt-color-surface`, `--tt-color-text`, `--tt-color-text-muted`, `--tt-color-border`, `--tt-color-focus` |
| Type | `--tt-font-sans`, `--tt-font-size-{xs,sm,md,lg,xl}`, `--tt-font-weight-{regular,bold}` |
| Space | `--tt-space-{1,2,3,4,5,6,8}` (4px steps: 4, 8, 12, 16, 20, 24, 32px) |
| Shape | `--tt-radius-{sm,md,lg,pill}`, `--tt-shadow-{sm,md,lg}` |

Put white text only on `-600` colors. `--tt-color-primary-500` is for accents and fails contrast behind white text. Use one `variant="primary"` Button per view as the main call to action.

## Choosing components

- **Status and feedback:** `Badge` for short labels (`tone`, `variant="soft" | "solid"`, `dot`). `Alert` for messages (`tone`, `title`, `actions`, `onDismiss`).
- **Content blocks:** `Card` takes `title`, `subtitle`, `media` and `footer`. `variant="tinted"` is for celebratory or highlight content.
- **People:** `Avatar` shows initials from `name` when `src` is missing, and has an optional `status` dot.
- **Forms:** `Input` has `label`, `hint`, `error` and `leftIcon` built in. Don't add separate labels.
- **Navigation:** `Tabs` takes `items: [{ id, label, content, disabled? }]`, with `variant="line" | "pill"`.

Read `components/components/<Name>/<Name>.prompt.md` for each component's full props and examples.

## Example

```jsx
const { Card, Button, Badge, Avatar } = window.TutorsUI;

<div style={{ display: 'grid', gap: 'var(--tt-space-4)', maxWidth: 360 }}>
  <Card
    title="Algebra I · Session 4"
    subtitle="Thursday, 4:00 – 5:00 PM"
    footer={<><Button variant="ghost" size="sm">Reschedule</Button><Button size="sm">Join lesson</Button></>}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tt-space-2)' }}>
      <Avatar name="Ana Reyes" size="sm" status="online" />
      <span style={{ color: 'var(--tt-color-text-muted)', fontSize: 'var(--tt-font-size-sm)' }}>with Ms. Reyes</span>
      <Badge tone="success" size="sm">Confirmed</Badge>
    </div>
  </Card>
</div>
```
