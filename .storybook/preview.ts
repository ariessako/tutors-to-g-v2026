import type { Preview } from '@storybook/react-vite';
import '../src/fonts/fonts.css';
import '../src/styles.css';

const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: { options: { cream: { name: 'Cream', value: '#FFFBF7' } } },
  },
  initialGlobals: { backgrounds: { value: 'cream' } },
};

export default preview;
