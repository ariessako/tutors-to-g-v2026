import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar } from './Avatar';

const photo =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#ffdccf"/><circle cx="40" cy="32" r="14" fill="#c4410f"/><path d="M14 80c2-18 13-27 26-27s24 9 26 27z" fill="#c4410f"/></svg>',
  );

const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  args: { name: 'Maya Santos' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initials: Story = {};

export const WithPhoto: Story = { args: { src: photo, size: 'lg' } };

export const Sizes: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Avatar {...args} size="sm" />
      <Avatar {...args} size="md" />
      <Avatar {...args} size="lg" />
      <Avatar {...args} size="xl" />
    </div>
  ),
};

export const Status: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <Avatar name="Maya Santos" size="lg" status="online" />
      <Avatar name="Leo Tan" size="lg" status="away" />
      <Avatar name="Ana Reyes" size="lg" status="offline" />
    </div>
  ),
};

export const Group: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      {['Maya Santos', 'Leo Tan', 'Ana Reyes', 'Sam Cruz', 'Jo Lim'].map((n) => (
        <Avatar key={n} name={n} />
      ))}
    </div>
  ),
};
