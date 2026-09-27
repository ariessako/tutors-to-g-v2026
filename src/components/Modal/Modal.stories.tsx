import { useState } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react-vite';
import { Modal } from './Modal';
import { Button } from '../Button/Button';
import { Card } from '../Card/Card';
import { Input } from '../Input/Input';

// The modal portals to document.body, so open-state stories render a full-height
// page behind it. That shows the overlay in context and gives the story root real
// content (screenshot tools that read #storybook-root see the page, not nothing).
const withPage: Decorator = (Story) => (
  <div style={{ minHeight: '100vh', padding: 32, background: 'var(--tt-color-bg)', boxSizing: 'border-box' }}>
    <div style={{ display: 'grid', gap: 16, maxWidth: 520 }}>
      <Card title="Algebra I · Session 4" subtitle="Thursday, 4:00 – 5:00 PM">
        Factoring quadratics and solving by completing the square.
      </Card>
      <Card title="Chemistry · Session 2" subtitle="Friday, 3:00 – 4:00 PM">
        Balancing chemical equations.
      </Card>
    </div>
    <Story />
  </div>
);

const meta = {
  title: 'Components/Modal',
  component: Modal,
  args: {
    open: true,
    onClose: () => {},
    title: 'Cancel this lesson?',
    description: 'Thursday, 4:00 – 5:00 PM with Ms. Reyes',
    children: 'Cancelling less than 24 hours before the lesson still uses one credit.',
    footer: (
      <>
        <Button variant="ghost">Keep lesson</Button>
        <Button variant="danger">Cancel lesson</Button>
      </>
    ),
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = { decorators: [withPage] };

export const WithForm: Story = {
  decorators: [withPage],
  args: {
    title: 'Invite a student',
    description: 'They’ll get an email with a link to join your class.',
    children: (
      <div style={{ display: 'grid', gap: 16 }}>
        <Input label="Student name" placeholder="e.g. Maya Santos" />
        <Input label="Email" type="email" placeholder="student@school.edu" />
      </div>
    ),
    footer: (
      <>
        <Button variant="ghost">Cancel</Button>
        <Button>Send invite</Button>
      </>
    ),
  },
};

export const Toggle: Story = {
  args: { open: false },
  parameters: { layout: 'centered' },
  render: (args) => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open modal</Button>
        <Modal {...args} open={open} onClose={() => setOpen(false)} />
      </>
    );
  },
};
