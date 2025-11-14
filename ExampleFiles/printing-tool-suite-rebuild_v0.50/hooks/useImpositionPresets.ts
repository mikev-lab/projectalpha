import { useState, useEffect, useCallback } from 'react';
import { ImpositionPreset, ImpositionSettings } from '../types';

const PRESETS_STORAGE_KEY = 'impositionPresets';

export const useImpositionPresets = () => {
  const [presets, setPresets] = useState<ImpositionPreset[]>([]);

  useEffect(() => {
    try {
      const storedPresets = localStorage.getItem(PRESETS_STORAGE_KEY);
      if (storedPresets) {
        setPresets(JSON.parse(storedPresets));
      }
    } catch (error) {
      console.error("Failed to load presets from localStorage", error);
    }
  }, []);

  const savePreset = useCallback((name: string, settings: ImpositionSettings) => {
    if (!name.trim()) {
      alert("Preset name cannot be empty.");
      return;
    }
    setPresets(currentPresets => {
      const newPreset: ImpositionPreset = { ...settings, name };
      const existingIndex = currentPresets.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
      
      let updatedPresets;
      if (existingIndex !== -1) {
        // Update existing preset
        updatedPresets = [...currentPresets];
        updatedPresets[existingIndex] = newPreset;
      } else {
        // Add new preset
        updatedPresets = [...currentPresets, newPreset];
      }
      
      try {
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updatedPresets));
      } catch (error) {
        console.error("Failed to save presets to localStorage", error);
      }
      
      return updatedPresets;
    });
  }, []);

  const deletePreset = useCallback((name: string) => {
    setPresets(currentPresets => {
      const updatedPresets = currentPresets.filter(p => p.name.toLowerCase() !== name.toLowerCase());
      try {
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(updatedPresets));
      } catch (error) {
        console.error("Failed to save presets to localStorage after deletion", error);
      }
      return updatedPresets;
    });
  }, []);

  return { presets, savePreset, deletePreset };
};
