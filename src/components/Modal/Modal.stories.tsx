import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Modal } from './Modal';
import { Button } from '../Button/Button';
import { Input } from '../Input/Input';

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

export const Open: Story = {};

export const WithForm: Story = {
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
