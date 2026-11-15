import { dataSource, app } from './setup-e2e';

describe('Simple Test', () => {
  it('should work', async () => {
    console.log('Running simple test...');
    expect(true).toBe(true);
    console.log('Simple test passed');
  });
});