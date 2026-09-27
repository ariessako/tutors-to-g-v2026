import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { children: 'New' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

const tones = ['neutral', 'primary', 'secondary', 'success', 'warning', 'danger', 'info'] as const;

export const Default: Story = {};

export const SoftTones: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {tones.map((tone) => (
        <Badge key={tone} {...args} tone={tone}>{tone}</Badge>
      ))}
    </div>
  ),
};

export const SolidTones: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {tones.map((tone) => (
        <Badge key={tone} {...args} variant="solid" tone={tone}>{tone}</Badge>
      ))}
    </div>
  ),
};

export const WithDot: Story = { args: { tone: 'success', dot: true, children: 'Online' } };

export const Small: Story = { args: { size: 'sm', tone: 'primary', children: 'Grade 7' } };
