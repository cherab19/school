/**
 * Sabyan School Academic Result calculation engine
 */

/**
 * Calculates the weighted score for an individual assessment item.
 * Formula: (Student Score / Maximum Mark) * Weight
 */
export function calculateWeightedScore(
  score: number,
  maxMark: number,
  weight: number
): number {
  if (maxMark <= 0) return 0;
  return (score / maxMark) * weight;
}

/**
 * Sums individual assessment scores and rounds the final total according to precision.
 * To avoid floating-point inconsistencies, we sum intermediate decimal values and round only at the end.
 */
export function calculateSubjectTotal(
  assessments: { score: number; maxMark: number; weight: number }[],
  precision: number = 1
): number {
  const sum = assessments.reduce((total, item) => {
    return total + calculateWeightedScore(item.score, item.maxMark, item.weight);
  }, 0);

  // Standard round half up to precision decimals
  const factor = Math.pow(10, precision);
  return Math.round((sum + Number.EPSILON) * factor) / factor;
}

/**
 * Validates if the score is within valid limits.
 */
export function validateScore(score: number, maxMark: number): { isValid: boolean; message: string } {
  if (isNaN(score)) {
    return { isValid: false, message: "Score must be a valid number." };
  }
  if (score < 0) {
    return { isValid: false, message: "Score cannot be negative." };
  }
  if (score > maxMark) {
    return { isValid: false, message: `Score cannot exceed the maximum mark of ${maxMark}.` };
  }
  return { isValid: true, message: "" };
}
