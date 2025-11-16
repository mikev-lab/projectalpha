"use client";

import { create } from 'zustand';

interface CartItem {
  id: string;
  name: string;
  price: number | null;
  quantity: number;
  details?: any;
}

interface CartState {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
}

export const useCart = create<CartState>((set) => ({
  items: [],
  addToCart: (item) => set((state) => ({ items: [...state.items, item] })),
  removeFromCart: (itemId) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== itemId),
    })),
  clearCart: () => set({ items: [] }),
}));
