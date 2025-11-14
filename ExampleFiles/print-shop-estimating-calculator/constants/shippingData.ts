export interface ShippingBox {
  name: string;
  width: number; // inches
  length: number; // inches
  height: number | number[]; // inches, can be array for multi-depth
  cost: number; // Placeholder for box + materials
}

// Based on prompt
export const shippingBoxes: ShippingBox[] = [
  { name: 'Standard Small Box (11.75x8.75x4.75)', width: 11.75, length: 8.75, height: 4.75, cost: 1.75 },
  { name: 'Standard Medium Box (11.25x8.75x9.5)', width: 11.25, length: 8.75, height: 9.5, cost: 2.50 },
  { name: 'Standard Large Box (12x9x10)', width: 12, length: 9, height: 10, cost: 3.00 },
  { name: 'Large Multi-Depth Box (12.25x9.25x12)', width: 12.25, length: 9.25, height: [12, 10, 8, 6], cost: 3.50 },
];

export const MAX_WEIGHT_PER_BOX_LBS = 40;

// Placeholder carrier rates based on total weight in LBS
// This would be replaced by a real API call in a production app
export const getCarrierCost = (totalWeightLbs: number): number => {
    if (totalWeightLbs <= 0) return 0;
    if (totalWeightLbs <= 1) return 9.50;
    if (totalWeightLbs <= 5) return 12.00;
    if (totalWeightLbs <= 10) return 15.00;
    if (totalWeightLbs <= 20) return 20.00;
    if (totalWeightLbs <= 30) return 28.00;
    if (totalWeightLbs <= 40) return 35.00;
    if (totalWeightLbs <= 50) return 42.00;
    // Over 50 lbs, add $0.75 per pound
    return 42.00 + (totalWeightLbs - 50) * 0.75;
};
