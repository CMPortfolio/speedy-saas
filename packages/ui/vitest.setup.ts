import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest has no global afterEach unless `globals: true`, so Testing Library cannot clean up
// on its own. Unmount after every test so queries never see a previous render.
afterEach(() => {
  cleanup();
});
