import { beforeEach, describe, expect, it } from 'vitest';
import {
  emptySamanthaMemory,
  loadSamanthaMemoryMerged,
  saveSamanthaMemory,
} from './samanthaMemory';

describe('Seller Samantha memory principal isolation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not merge another principal memory into a new principal or guest', () => {
    saveSamanthaMemory('principal:auth0:seller-a', {
      ...emptySamanthaMemory(),
      preferences: ['Use short refund confirmations'],
    });

    expect(loadSamanthaMemoryMerged('principal:auth0:seller-a').preferences).toEqual([
      'Use short refund confirmations',
    ]);
    expect(loadSamanthaMemoryMerged('principal:auth0:seller-b').preferences).toEqual([]);
    expect(loadSamanthaMemoryMerged(null).preferences).toEqual([]);
  });

  it('does not persist guest memory', () => {
    saveSamanthaMemory(null, {
      ...emptySamanthaMemory(),
      notes: ['private'],
    });

    expect(localStorage.length).toBe(0);
  });
});
