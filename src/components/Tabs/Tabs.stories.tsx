import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs } from './Tabs';

const items = [
  { id: 'upcoming', label: 'Upcoming', content: 'You have 3 lessons this week.' },
  { id: 'past', label: 'Past', content: '12 completed lessons. Great progress!' },
  { id: 'homework', label: 'Homework', content: '2 assignments due on Friday.' },
  { id: 'archived', label: 'Archived', content: 'Nothing archived yet.', disabled: true },
];

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
  args: { items, 'aria-label': 'Lessons' },
  decorators: [(Story) => <div style={{ width: 460 }}><Story /></div>],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Line: Story = {};

export const Pill: Story = { args: { variant: 'pill' } };

export const SecondTabSelected: Story = { args: { defaultValue: 'past' } };
