import { useMemo } from 'react';
import { JobDetails, CostBreakdown, PaperStock, PrintColor, LaborTimeBreakdown, ShippingBreakdown } from '../types';
import { paperData } from '../constants/paperData';
import { shippingBoxes, getCarrierCost, MAX_WEIGHT_PER_BOX_LBS, ShippingBox } from '../constants/shippingData';

// --- Production Constants ---
const COLOR_CLICK_COST = 0.039;
const BW_CLICK_COST = 0.009;
const GLOSS_LAMINATE_COST_PER_COVER = 0.30;
const MATTE_LAMINATE_COST_PER_COVER = 0.60;
const PRINTING_SPEED_SPM = 15; // Sheets per minute for c3080 (4 seconds per sheet)
const LAMINATING_SPEED_MPM = 5; // Meters per minute
const PERFECT_BINDER_SETUP_MINS = 15;
const PERFECT_BINDER_SPEED_BPH = 300; // Books per hour
const SADDLE_STITCHER_SETUP_MINS = 10;
const SADDLE_STITCHER_SPEED_BPH = 400; // Books per hour (more realistic speed)
const BASE_PREP_TIME_MINS = 20;
const WASTAGE_FACTOR = 0.15; // 15% for materials and general time
const BINDING_INEFFICIENCY_FACTOR = 1.20; // 20% slower than optimal speed to account for real-world conditions
const TRIMMING_SETUP_MINS = 10;
const TRIMMING_BOOKS_PER_CYCLE = 250; // How many books/sheets in a stack for the guillotine
const TRIMMING_CYCLE_TIME_MINS = 5; // Time to load, clamp, cut 3 sides, unload a stack

// --- Conversion Constants ---
const SQ_INCH_TO_SQ_METER = 0.00064516;
const GRAMS_TO_LBS = 0.00220462;

const calculateImposition = (parentW: number, parentH: number, jobW: number, jobH: number): number => {
  if (jobW <= 0 || jobH <= 0) return 0;
  const fit1 = Math.floor(parentW / jobW) * Math.floor(parentH / jobH);
  const fit2 = Math.floor(parentW / jobH) * Math.floor(parentH / jobW);
  return Math.max(fit1, fit2);
};

const getPaperThicknessInches = (paper: PaperStock): number => {
  const caliperFactor = paper.type === 'Coated' ? 0.9 : 1.3;
  const caliperMicrons = paper.gsm * caliperFactor;
  return caliperMicrons / 25400;
};

const emptyLaborBreakdown: LaborTimeBreakdown = {
  printingTimeMins: 0, laminatingTimeMins: 0, bindingTimeMins: 0, setupTimeMins: 0, trimmingTimeMins: 0, wastageTimeMins: 0,
};

const createEmptyCostBreakdown = (error?: string): CostBreakdown => ({
  error,
  bwPaperCost: 0, colorPaperCost: 0, coverPaperCost: 0,
  bwClickCost: 0, colorClickCost: 0, coverClickCost: 0,
  laminationCost: 0, laborCost: 0, shippingCost: 0, subtotal: 0, markupAmount: 0, totalCost: 0, pricePerUnit: 0,
  bwPressSheets: 0, colorPressSheets: 0, coverPressSheets: 0,
  bwImposition: 0, colorImposition: 0, coverImposition: 0,
  totalClicks: 0, productionTimeHours: 0,
  laborTimeBreakdown: emptyLaborBreakdown,
  shippingBreakdown: null,
});

const calculateSingleBookWeightLbs = (details: JobDetails, bwPaper?: PaperStock, colorPaper?: PaperStock, coverPaper?: PaperStock, spineWidth?: number): number => {
    let totalWeightGrams = 0;
    const { finishedWidth, finishedHeight, bwPages, colorPages, hasCover } = details;

    if (bwPaper && bwPages > 0) {
        const bwSheetAreaSqIn = finishedWidth * finishedHeight;
        const totalBwPaperAreaSqM = (bwPages / 2) * bwSheetAreaSqIn * SQ_INCH_TO_SQ_METER;
        totalWeightGrams += totalBwPaperAreaSqM * bwPaper.gsm;
    }

    if (colorPaper && colorPages > 0) {
        const colorSheetAreaSqIn = finishedWidth * finishedHeight;
        const totalColorPaperAreaSqM = (colorPages / 2) * colorSheetAreaSqIn * SQ_INCH_TO_SQ_METER;
        totalWeightGrams += totalColorPaperAreaSqM * colorPaper.gsm;
    }
    
    if (hasCover && coverPaper && spineWidth !== undefined) {
        const coverSpreadWidth = (finishedWidth * 2) + spineWidth;
        const coverAreaSqIn = coverSpreadWidth * finishedHeight;
        const coverAreaSqM = coverAreaSqIn * SQ_INCH_TO_SQ_METER;
        totalWeightGrams += coverAreaSqM * coverPaper.gsm;
    }
    
    return totalWeightGrams * GRAMS_TO_LBS;
};


const calculateShipping = (quantity: number, bookWidth: number, bookLength: number, bookSpine: number, bookWeightLbs: number, overrideBoxName?: string | null): { shippingCost: number; breakdown: ShippingBreakdown | null } => {
    if (quantity <= 0 || bookWeightLbs <= 0) {
        return { shippingCost: 0, breakdown: null };
    }

    const bookDims = [bookWidth, bookLength, bookSpine].sort((a, b) => b - a);

    const flatBoxes = shippingBoxes.flatMap(box => {
        if (Array.isArray(box.height)) {
            return box.height.map(h => ({ ...box, height: h, name: `${box.name} (${h}")` }));
        }
        return { ...box, height: box.height as number };
    });

    const boxesToConsider = overrideBoxName
        ? flatBoxes.filter(box => box.name === overrideBoxName)
        : flatBoxes;

    let bestOption = {
        cost: Infinity,
        breakdown: null as ShippingBreakdown | null,
    };

    for (const box of boxesToConsider) {
        const boxDims = [box.width, box.length, box.height].sort((a, b) => b - a);

        // Check if a single book can fit
        if (bookDims[0] > boxDims[0] || bookDims[1] > boxDims[1] || bookDims[2] > boxDims[2]) {
            continue;
        }

        // Calculate how many books can fit, checking all 6 orientations
        const w = bookWidth, l = bookLength, s = bookSpine;
        const W = box.width, L = box.length, H = box.height;
        const orientations = [
            Math.floor(W/w) * Math.floor(L/l) * Math.floor(H/s),
            Math.floor(W/w) * Math.floor(L/s) * Math.floor(H/l),
            Math.floor(W/l) * Math.floor(L/w) * Math.floor(H/s),
            Math.floor(W/l) * Math.floor(L/s) * Math.floor(H/w),
            Math.floor(W/s) * Math.floor(L/w) * Math.floor(H/l),
            Math.floor(W/s) * Math.floor(L/l) * Math.floor(H/w),
        ];
        let booksPerBox = Math.max(...orientations);
        if (booksPerBox === 0) continue;

        // Apply weight constraint
        const maxBooksByWeight = Math.floor(MAX_WEIGHT_PER_BOX_LBS / bookWeightLbs);
        if (maxBooksByWeight > 0) {
           booksPerBox = Math.min(booksPerBox, maxBooksByWeight);
        } else {
           continue; // Single book is too heavy for the max weight
        }

        const boxCount = Math.ceil(quantity / booksPerBox);
        const handlingCost = boxCount * box.cost;
        const totalWeightLbs = quantity * bookWeightLbs;
        const carrierCost = getCarrierCost(totalWeightLbs);
        const totalCost = handlingCost + carrierCost;

        if (totalCost < bestOption.cost) {
            bestOption = {
                cost: totalCost,
                breakdown: {
                    boxName: box.name,
                    boxCount,
                    booksPerBox,
                    totalWeightLbs,
                },
            };
        }
    }

    return { shippingCost: bestOption.cost === Infinity ? 0 : bestOption.cost, breakdown: bestOption.breakdown };
};


export const calculateCosts = (details: JobDetails): CostBreakdown => {
  const {
    quantity, finishedWidth, finishedHeight,
    bwPages, bwPaperSku, colorPages, colorPaperSku,
    hasCover, coverPaperSku, coverPrintColor, coverPrintsOnBothSides, laminationType, bindingMethod,
    laborRate, markupPercent, spoilagePercent, calculateShipping: shouldCalcShipping
  } = details;

  const bwPaper = paperData.find(p => p.sku === bwPaperSku);
  const colorPaper = paperData.find(p => p.sku === colorPaperSku);
  const coverPaper = paperData.find(p => p.sku === coverPaperSku);
  
  const totalInteriorPages = (bwPages > 0 ? bwPages : 0) + (colorPages > 0 ? colorPages : 0);
  if (bindingMethod === 'saddleStitch' && totalInteriorPages > 0 && totalInteriorPages % 4 !== 0) {
    return createEmptyCostBreakdown('Saddle stitch requires the total interior page count to be a multiple of 4.');
  }

  const spoilageMultiplier = 1 + ((spoilagePercent || 0) / 100);

  const bwImposition = bwPaper ? calculateImposition(bwPaper.parentWidth, bwPaper.parentHeight, finishedWidth, finishedHeight) : 0;
  const colorImposition = colorPaper ? calculateImposition(colorPaper.parentWidth, colorPaper.parentHeight, finishedWidth, finishedHeight) : 0;
  
  let coverImposition = 0;
  let spineWidth = 0;
  if (hasCover && coverPaper) {
    if (bindingMethod === 'perfectBound') {
      const bwLeaves = Math.ceil((bwPages > 0 ? bwPages : 0) / 2);
      const colorLeaves = Math.ceil((colorPages > 0 ? colorPages : 0) / 2);
      
      const bwPaperThickness = (bwPaper && bwPages > 0) ? getPaperThicknessInches(bwPaper) : 0;
      const colorPaperThickness = (colorPaper && colorPages > 0) ? getPaperThicknessInches(colorPaper) : 0;

      spineWidth = (bwLeaves * bwPaperThickness) + (colorLeaves * colorPaperThickness);
    }
    const coverSpreadWidth = (finishedWidth * 2) + spineWidth;
    const coverSpreadHeight = finishedHeight;
    const maxPossibleImposition = calculateImposition(coverPaper.parentWidth, coverPaper.parentHeight, coverSpreadWidth, coverSpreadHeight);

    // If it fits at least once, force it to 1-up for costing. Otherwise, it's 0 (which will trigger an error).
    if (maxPossibleImposition >= 1) {
      coverImposition = 1;
    } else {
      coverImposition = 0;
    }
  }
  
  if (bwPaper && bwImposition === 0 && bwPages > 0) return createEmptyCostBreakdown('Finished size does not fit on the B/W interior paper.');
  if (colorPaper && colorImposition === 0 && colorPages > 0) return createEmptyCostBreakdown('Finished size does not fit on the Color interior paper.');
  if (hasCover && coverPaper && coverImposition === 0) return createEmptyCostBreakdown('Full cover spread (including spine) does not fit on the selected cover paper.');

  const bwPressSheets = Math.ceil((bwImposition > 0 ? Math.ceil(quantity * Math.ceil((bwPages > 0 ? bwPages : 0) / 2) / bwImposition) : 0) * spoilageMultiplier);
  const bwPaperCost = bwPaper ? bwPressSheets * bwPaper.costPerSheet : 0;
  const bwClicks = bwPressSheets * 2;
  const bwClickCost = bwClicks * BW_CLICK_COST;
  
  const colorPressSheets = Math.ceil((colorImposition > 0 ? Math.ceil(quantity * Math.ceil((colorPages > 0 ? colorPages : 0) / 2) / colorImposition) : 0) * spoilageMultiplier);
  const colorPaperCost = colorPaper ? colorPressSheets * colorPaper.costPerSheet : 0;
  const colorClicks = colorPressSheets * 2;
  const colorClickCost = colorClicks * COLOR_CLICK_COST;

  let coverPressSheets = 0, coverPaperCost = 0, coverClickCost = 0, coverClicks = 0;
  if (hasCover) {
    coverPressSheets = Math.ceil((coverImposition > 0 ? Math.ceil(quantity / coverImposition) : 0) * spoilageMultiplier);
    coverPaperCost = coverPaper ? coverPressSheets * coverPaper.costPerSheet : 0;
    const coverClickRate = coverPrintColor === PrintColor.COLOR ? COLOR_CLICK_COST : BW_CLICK_COST;
    coverClicks = coverPressSheets * (coverPrintsOnBothSides ? 2 : 1);
    coverClickCost = coverClicks * coverClickRate;
  }

  const laminationCost = (hasCover && laminationType !== 'none' && quantity > 0) ? (laminationType === 'gloss' ? GLOSS_LAMINATE_COST_PER_COVER : MATTE_LAMINATE_COST_PER_COVER) * quantity : 0;

  const totalPressSheets = bwPressSheets + colorPressSheets + coverPressSheets;
  const printingTimeMins = totalPressSheets / PRINTING_SPEED_SPM;

  let laminatingTimeMins = 0;
  if (hasCover && laminationType !== 'none' && coverPaper && coverPressSheets > 0) {
    const sheetLengthMeters = coverPaper.parentHeight * 0.0254;
    laminatingTimeMins = (coverPressSheets * sheetLengthMeters) / LAMINATING_SPEED_MPM;
  }

  let bindingTimeMins = 0;
  let bindingSetupMins = 0;
  if (quantity > 0 && bindingMethod !== 'none') {
    if (bindingMethod === 'perfectBound') {
        bindingSetupMins = PERFECT_BINDER_SETUP_MINS;
        bindingTimeMins = (quantity / (PERFECT_BINDER_SPEED_BPH / 60));
    } else if (bindingMethod === 'saddleStitch') {
        bindingSetupMins = SADDLE_STITCHER_SETUP_MINS;
        bindingTimeMins = (quantity / (SADDLE_STITCHER_SPEED_BPH / 60));
    }
    bindingTimeMins *= BINDING_INEFFICIENCY_FACTOR;
  }
  
  const trimmingTimeMins = quantity > 0 ? TRIMMING_SETUP_MINS + (Math.ceil(quantity / TRIMMING_BOOKS_PER_CYCLE) * TRIMMING_CYCLE_TIME_MINS) : 0;
  
  const setupTimeMins = BASE_PREP_TIME_MINS + bindingSetupMins;
  const totalProductionTimeMins = setupTimeMins + printingTimeMins + laminatingTimeMins + bindingTimeMins + trimmingTimeMins;
  const wastageTimeMins = totalProductionTimeMins * WASTAGE_FACTOR;
  const totalTimeMins = totalProductionTimeMins + wastageTimeMins;
  const productionTimeHours = totalTimeMins / 60;
  const laborCost = productionTimeHours * laborRate;

  const laborTimeBreakdown: LaborTimeBreakdown = { printingTimeMins, laminatingTimeMins, bindingTimeMins, setupTimeMins, trimmingTimeMins, wastageTimeMins };

  const subtotal = (bwPaperCost + colorPaperCost + coverPaperCost) + (bwClickCost + colorClickCost + coverClickCost) + laminationCost + laborCost;
  const markupAmount = subtotal * (markupPercent / 100);
  
  let shippingCost = 0;
  let shippingBreakdown: ShippingBreakdown | null = null;
  if (shouldCalcShipping) {
      const bookWeightLbs = calculateSingleBookWeightLbs(details, bwPaper, colorPaper, coverPaper, spineWidth);
      const shippingResult = calculateShipping(quantity, finishedWidth, finishedHeight, spineWidth, bookWeightLbs, details.overrideShippingBoxName);
      shippingCost = shippingResult.shippingCost;
      shippingBreakdown = shippingResult.breakdown;
  }

  const totalCost = subtotal + markupAmount + shippingCost;
  const pricePerUnit = quantity > 0 ? totalCost / quantity : 0;
  const totalClicks = bwClicks + colorClicks + coverClicks;

  return {
    bwPaperCost, colorPaperCost, coverPaperCost,
    bwClickCost, colorClickCost, coverClickCost,
    laminationCost, laborCost, shippingCost, subtotal, markupAmount, totalCost, pricePerUnit,
    bwPressSheets, colorPressSheets, coverPressSheets,
    bwImposition, colorImposition, coverImposition,
    totalClicks, productionTimeHours, laborTimeBreakdown, shippingBreakdown
  };
};

export const usePrintCalculator = (details: JobDetails): CostBreakdown => {
  return useMemo(() => calculateCosts(details), [details]);
};