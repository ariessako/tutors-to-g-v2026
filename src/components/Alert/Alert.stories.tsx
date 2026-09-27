import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert } from './Alert';
import { Button } from '../Button/Button';

const meta = {
  title: 'Components/Alert',
  component: Alert,
  args: {
    title: 'Lesson moved',
    children: 'Your Thursday algebra lesson now starts at 4:30 PM.',
  },
  decorators: [(Story) => <div style={{ width: 420 }}><Story /></div>],
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};

export const Tones: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      <Alert tone="info" title="Heads up">Your tutor added notes to last week’s session.</Alert>
      <Alert tone="success" title="Homework submitted">Nice work! Ms. Reyes will review it by Friday.</Alert>
      <Alert tone="warning" title="Payment due soon">Your plan renews in 3 days.</Alert>
      <Alert tone="danger" title="Couldn’t join the call">Check your camera permissions and try again.</Alert>
    </div>
  ),
};

export const Dismissible: Story = { args: { tone: 'success', title: 'Profile saved', children: undefined, onDismiss: () => {} } };

export const WithActions: Story = {
  args: {
    tone: 'warning',
    title: 'Your session starts in 10 minutes',
    children: 'Make sure your microphone works before joining.',
    actions: (
      <>
        <Button size="sm">Join now</Button>
        <Button size="sm" variant="ghost">Test audio</Button>
      </>
    ),
  },
};
