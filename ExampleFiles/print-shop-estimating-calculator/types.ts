export interface PaperStock {
  name: string;
  gsm: number;
  type: 'Coated' | 'Uncoated';
  finish: string;
  parentWidth: number;
  parentHeight: number;
  sku: string | null;
  costPerSheet: number;
  usage: string;
}

export enum PrintColor {
  COLOR = 'COLOR',
  BW = 'BW',
}

export type BindingMethod = 'perfectBound' | 'saddleStitch' | 'none';
export type LaminationType = 'gloss' | 'matte' | 'none';

export interface JobDetails {
  bookTitle: string;
  quantity: number;
  finishedWidth: number;
  finishedHeight: number;
  
  // Inside Pages
  bwPages: number;
  bwPaperSku: string | null;
  
  colorPages: number;
  colorPaperSku: string | null;

  // Cover
  hasCover: boolean;
  coverPaperSku: string | null;
  coverPrintColor: PrintColor;
  coverPrintsOnBothSides: boolean;
  laminationType: LaminationType;

  // Binding
  bindingMethod: BindingMethod;

  // Labor & Markup
  laborRate: number;
  markupPercent: number;
  spoilagePercent: number;

  // Shipping
  calculateShipping: boolean;
  overrideShippingBoxName: string | null;
}

export interface LaborTimeBreakdown {
  printingTimeMins: number;
  laminatingTimeMins: number;
  bindingTimeMins: number;
  setupTimeMins: number;
  trimmingTimeMins: number;
  wastageTimeMins: number;
}

export interface ShippingBreakdown {
    boxName: string;
    boxCount: number;
    booksPerBox: number;
    totalWeightLbs: number;
}

export interface CostBreakdown {
  bwPaperCost: number;
  colorPaperCost: number;
  coverPaperCost: number;
  
  bwClickCost: number;
  colorClickCost: number;
  coverClickCost: number;
  
  laminationCost: number;
  laborCost: number;
  shippingCost: number;
  subtotal: number;
  markupAmount: number;
  totalCost: number;
  pricePerUnit: number;

  bwPressSheets: number;
  colorPressSheets: number;
  coverPressSheets: number;

  bwImposition: number;
  colorImposition: number;
  coverImposition: number;

  totalClicks: number;
  productionTimeHours: number;
  laborTimeBreakdown: LaborTimeBreakdown;
  shippingBreakdown: ShippingBreakdown | null;

  error?: string;
}

export interface ChartData {
  labels: string[];
  expenses: number[];
  labor: number[];
  profit: number[];
  totalPrice: number[];
}

export interface SummaryDataRow {
  quantity: number;
  totalProfit: number;
  profitPerHour: number;
}