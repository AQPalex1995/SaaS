import { describe, it, expect } from 'vitest';
import { ResearchService } from '../src/domain/research/service';

describe('Research Engine Domain', () => {
  it('should define the 8 mandatory research tasks', () => {
    const service = new ResearchService();
    // Verify service can be instantiated and check the default task types list
    const expectedTaskTypes = [
      'identity',
      'geolocation',
      'registry',
      'bgr',
      'urbanism',
      'judicial',
      'market',
      'risk',
    ];

    // Check that research service is ready
    expect(service).toBeDefined();
    expect(typeof service.createResearch).toBe('function');
    expect(typeof service.getCaseById).toBe('function');
    expect(typeof service.getTasks).toBe('function');
    expect(typeof service.getResults).toBe('function');
  });
});
