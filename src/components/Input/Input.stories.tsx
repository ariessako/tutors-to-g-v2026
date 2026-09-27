import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './Input';

const meta = {
  title: 'Components/Input',
  component: Input,
  args: { label: 'Student name', placeholder: 'e.g. Maya Santos' },
  decorators: [(Story) => <div style={{ width: 320 }}><Story /></div>],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: { label: 'Email', type: 'email', placeholder: 'you@school.edu', hint: 'We send lesson reminders here.' },
};

export const WithError: Story = {
  args: { label: 'Email', type: 'email', defaultValue: 'maya@', error: 'Enter a complete email address.' },
};

export const WithIcon: Story = {
  args: {
    label: undefined,
    'aria-label': 'Search tutors',
    placeholder: 'Search tutors or subjects',
    leftIcon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    ),
  },
};

export const Sizes: Story = {
  render: (args) => (
    <div style={{ display: 'grid', gap: 16 }}>
      <Input {...args} size="sm" label="Small" />
      <Input {...args} size="md" label="Medium" />
      <Input {...args} size="lg" label="Large" />
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true, defaultValue: 'Maya Santos' } };
