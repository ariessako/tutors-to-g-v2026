import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';
import { Button } from '../Button/Button';
import { Badge } from '../Badge/Badge';

const meta = {
  title: 'Components/Card',
  component: Card,
  args: {
    title: 'Algebra I · Session 4',
    subtitle: 'Thursday, 4:00 – 5:00 PM',
    children: 'Factoring quadratics and solving by completing the square. Bring last week’s worksheet.',
  },
  decorators: [(Story) => <div style={{ width: 340 }}><Story /></div>],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Elevated: Story = {};

export const Outlined: Story = { args: { variant: 'outlined' } };

export const Tinted: Story = {
  args: {
    variant: 'tinted',
    title: 'You’re on a 5-day streak! 🎉',
    subtitle: undefined,
    children: 'Keep practicing a little every day to lock in what you learn.',
  },
};

export const WithFooter: Story = {
  args: {
    footer: (
      <>
        <Button variant="ghost" size="sm">Reschedule</Button>
        <Button size="sm">Join lesson</Button>
      </>
    ),
  },
};

export const WithMedia: Story = {
  args: {
    interactive: true,
    title: 'Intro to Chemistry',
    subtitle: '12 lessons · Beginner',
    media: (
      <div style={{ height: 120, background: 'linear-gradient(135deg, #ffb89f, #6d5bd0)' }} />
    ),
    children: <Badge tone="success">Enrolling now</Badge>,
  },
};
