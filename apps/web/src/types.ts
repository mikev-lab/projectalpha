export interface PaperStock {
  name: string;
  gsm: number;
  type: 'Coated' | 'Uncoated';
  finish: 'Gloss' | 'Silk' | 'Uncoated' | 'Petallic' | 'C1S' | 'Copy';
  parentWidth: number;
  parentHeight: number;
  sku: string;
  costPerSheet: number;
  usage: string;
}

export interface ShippingBox {
  name: string;
  width: number;
  length: number;
  height: number | number[];
  cost: number;
}

export interface ShippingBreakdown {
  boxName: string;
  boxCount: number;
  booksPerBox: number;
  totalWeightLbs: number;
}
