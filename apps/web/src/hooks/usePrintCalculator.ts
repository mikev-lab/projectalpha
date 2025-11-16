"use client";

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// Basic pricing structure - replace with your actual pricing data
const PRICING_DATA = {
  paperStock: {
    '100lb Text': 0.10,
    '80lb Text': 0.08,
    '100lb Cover': 0.25,
  },
  trimSize: {
    '8.5x11': 1.0,
    '6x9': 0.9,
    '5.5x8.5': 0.85,
    custom: 1.2, // A multiplier for custom sizes
  },
  baseCost: 25, // A flat fee for each job
};

interface CalculationParams {
  quantity: number;
  trimSize: string;
  paperStock: string;
  pages: number;
}

export function usePrintCalculator() {
  const [price, setPrice] = useState<number | null>(null);

  const calculatePrice = async (params: CalculationParams) => {
    const { quantity, trimSize, paperStock, pages } = params;

    const paperCost = PRICING_DATA.paperStock[paperStock] || PRICING_DATA.paperStock['100lb Text'];
    const sizeMultiplier = PRICING_DATA.trimSize[trimSize] || PRICING_DATA.trimSize.custom;

    const manufacturingCost = (pages * paperCost) * sizeMultiplier;

    const totalPrice = (PRICING_DATA.baseCost + (manufacturingCost * quantity));

    setPrice(totalPrice);

    try {
      await addDoc(collection(db, 'quotes'), {
        ...params,
        price: totalPrice,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error logging quote: ", error);
    }
  };

  return { price, calculatePrice };
}
