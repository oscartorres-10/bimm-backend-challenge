import { jest as jestApi } from '@jest/globals';

export const jest = jestApi as unknown as typeof globalThis.jest;
