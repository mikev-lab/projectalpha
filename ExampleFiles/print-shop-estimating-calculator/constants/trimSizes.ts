export interface TrimSize {
  name: string;
  width?: number; // in inches
  height?: number; // in inches
  group: 'Custom' | 'US' | 'A Series' | 'JIS (Doujin)';
}

// Helper to convert mm to inches and round to 2 decimal places
const mmToInches = (mm: number): number => parseFloat((mm / 25.4).toFixed(2));

export const commonTrimSizes: TrimSize[] = [
  { name: 'Custom Size', group: 'Custom' },
  // --- US Sizes ---
  { name: 'Letter', width: 8.5, height: 11, group: 'US' },
  { name: 'Half Letter', width: 5.5, height: 8.5, group: 'US' },
  { name: 'Graphic Novel', width: 6.625, height: 10.25, group: 'US' },
  { name: 'Digest', width: 5.5, height: 8.5, group: 'US' },
  { name: 'Pocket Book', width: 4.25, height: 6.87, group: 'US' },
  { name: 'Tabloid', width: 11, height: 17, group: 'US' },

  // --- ISO A Sizes ---
  { name: 'A4', width: mmToInches(210), height: mmToInches(297), group: 'A Series' },
  { name: 'A5', width: mmToInches(148), height: mmToInches(210), group: 'A Series' },
  { name: 'A6', width: mmToInches(105), height: mmToInches(148), group: 'A Series' },

  // --- JIS B Sizes (for Doujinshi) ---
  { name: 'JIS B5', width: mmToInches(182), height: mmToInches(257), group: 'JIS (Doujin)' },
  { name: 'JIS B6', width: mmToInches(128), height: mmToInches(182), group: 'JIS (Doujin)' },
];
