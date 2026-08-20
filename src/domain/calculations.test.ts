import { describe, test, expect } from 'vitest';
import { calculateWeightedScore, calculateSubjectTotal, validateScore } from './calculations';

describe('Calculation Engine Tests', () => {
  // Test Scenario 1: Basic weights
  // Assignment: 8/10, Weight: 10% -> 8
  // Midterm: 24/30, Weight: 30% -> 24
  // Final: 52/60, Weight: 60% -> 52
  // Total: 8 + 24 + 52 = 84
  test('Standard weighted score calculations (Scenario 1)', () => {
    const w1 = calculateWeightedScore(8, 10, 10);
    const w2 = calculateWeightedScore(24, 30, 30);
    const w3 = calculateWeightedScore(52, 60, 60);

    expect(w1).toBe(8);
    expect(w2).toBe(24);
    expect(w3).toBe(52);

    const assessments = [
      { score: 8, maxMark: 10, weight: 10 },
      { score: 24, maxMark: 30, weight: 30 },
      { score: 52, maxMark: 60, weight: 60 }
    ];
    const total = calculateSubjectTotal(assessments, 1);
    expect(total).toBe(84);
  });

  // Test Scenario 2: Different assessment profile
  // Quiz: 8.5/10, Weight: 10% -> 8.5
  // Assignment: 9/10, Weight: 10% -> 9
  // Midterm: 17/20, Weight: 20% -> 17
  // Final: 54/60, Weight: 60% -> 54
  // Total: 8.5 + 9 + 17 + 54 = 88.5
  test('Four assessment categories with decimals (Scenario 2)', () => {
    const assessments = [
      { score: 8.5, maxMark: 10, weight: 10 },
      { score: 9, maxMark: 10, weight: 10 },
      { score: 17, maxMark: 20, weight: 20 },
      { score: 54, maxMark: 60, weight: 60 }
    ];
    const total = calculateSubjectTotal(assessments, 1);
    expect(total).toBe(88.5);
  });

  // Test Rounding Behavior
  test('Scoring precision rounding policies', () => {
    const assessments = [
      { score: 7.3, maxMark: 10, weight: 15 }, // 10.95
      { score: 23.4, maxMark: 30, weight: 35 }, // 27.3
      { score: 48.1, maxMark: 60, weight: 50 } // 40.08333...
    ]; // Sum = 78.33333...

    expect(calculateSubjectTotal(assessments, 0)).toBe(78); // Rounded to nearest integer
    expect(calculateSubjectTotal(assessments, 1)).toBe(78.3); // Rounded to 1 decimal place
    expect(calculateSubjectTotal(assessments, 2)).toBe(78.33); // Rounded to 2 decimal places
  });

  // Test Score Boundaries & Validation
  test('Input score validation checks', () => {
    expect(validateScore(8, 10).isValid).toBe(true);
    expect(validateScore(10, 10).isValid).toBe(true);
    expect(validateScore(0, 10).isValid).toBe(true);
    
    expect(validateScore(-1, 10).isValid).toBe(false); // Negative score
    expect(validateScore(12, 10).isValid).toBe(false); // Exceeds max score
    expect(validateScore(NaN, 10).isValid).toBe(false); // Non-numeric
  });
});
