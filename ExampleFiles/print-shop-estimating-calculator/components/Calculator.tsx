import React, { useState, useMemo, ChangeEvent, useCallback } from 'react';
import { JobDetails, PrintColor, ChartData, SummaryDataRow, BindingMethod, LaminationType } from '../types';
import { usePrintCalculator, calculateCosts } from '../hooks/usePrintCalculator';
import { QuantityDiscountChart } from './QuantityDiscountChart';
import PaperSearch from './PaperSearch';
import SizeSearch from './SizeSearch';
import { commonTrimSizes, TrimSize } from '../constants/trimSizes';
import { shippingBoxes } from '../constants/shippingData';
import { paperData } from '../constants/paperData';
import { ExpandIcon } from './icons/ExpandIcon';
import Tooltip from './Tooltip';
import { InfoIcon } from './icons/InfoIcon';
import { CopyIcon } from './icons/CopyIcon';
import { CheckIcon } from './icons/CheckIcon';


const initialJobDetails: JobDetails = {
  bookTitle: '',
  quantity: 100,
  finishedWidth: 5.5,
  finishedHeight: 8.5,
  
  bwPages: 20,
  bwPaperSku: null,
  
  colorPages: 0,
  colorPaperSku: null,

  hasCover: true,
  coverPaperSku: null,
  coverPrintColor: PrintColor.COLOR,
  coverPrintsOnBothSides: false,
  laminationType: 'gloss',

  bindingMethod: 'perfectBound',

  laborRate: 50,
  markupPercent: 35,
  spoilagePercent: 5,
  calculateShipping: true,
  overrideShippingBoxName: null,
};

const allBoxOptions = shippingBoxes.flatMap(box => {
    if (Array.isArray(box.height)) {
        return box.height.map(h => ({ name: `${box.name} (${h}")` }));
    }
    return { name: box.name };
});

// --- Helper Components ---

const ToggleSwitch = ({ name, checked, onChange, label }: { name: string, checked: boolean, onChange: (e: ChangeEvent<HTMLInputElement>) => void, label: string }) => (
  <label className="flex items-center justify-between cursor-pointer gap-3">
    <span className="text-sm font-medium">{label}</span>
    <div className="relative">
      <input type="checkbox" name={name} checked={checked} onChange={onChange} className="sr-only peer" />
      <div className="w-11 h-6 bg-gray-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
    </div>
  </label>
);

const Calculator: React.FC = () => {
  const [details, setDetails] = useState<JobDetails>(initialJobDetails);
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  const [isCustomSize, setIsCustomSize] = useState(true); // Treat initial size as custom
  const [isOwnersLabor, setIsOwnersLabor] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copy Specs');
  const costBreakdown = usePrintCalculator(details);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    // If user manually changes dimensions, switch to custom size mode
    if (name === 'finishedWidth' || name === 'finishedHeight') {
      setIsCustomSize(true);
    }
    
    let parsedValue: string | number | boolean | null = value;
    if (name === 'overrideShippingBoxName') {
        parsedValue = value === 'automatic' ? null : value;
    } else if (type === 'number') {
      parsedValue = value === '' ? '' : parseFloat(value);
      if (isNaN(parsedValue as number)) parsedValue = '';
    } else if (e.target.type === 'checkbox') {
        const isChecked = (e.target as HTMLInputElement).checked;
        parsedValue = isChecked;
        
        // Special handling for `hasCover` to manage lamination state
        if (name === 'hasCover') {
          setDetails(prev => ({ 
            ...prev, 
            hasCover: isChecked,
            laminationType: isChecked ? prev.laminationType === 'none' ? 'gloss' : prev.laminationType : 'none',
          }));
          return;
        }
    }
    setDetails(prev => ({ ...prev, [name]: parsedValue }));
  };
  
  const handlePaperSelection = useCallback((name: string, sku: string | null) => {
     setDetails(prev => ({ ...prev, [name]: sku }));
  }, []);

  const handleSizeSelect = useCallback((size: TrimSize | null) => {
    // A standard size was selected from the dropdown
    if (size && size.width && size.height) {
        setDetails(prev => ({
            ...prev,
            finishedWidth: size.width!,
            finishedHeight: size.height!,
        }));
        setIsCustomSize(false);
    } else { 
        // "Custom Size" was selected, likely by clearing a standard size
        setIsCustomSize(true);
    }
  }, []);
  
  const handleCopySpecs = useCallback(() => {
    const bwPaper = paperData.find(p => p.sku === details.bwPaperSku);
    const colorPaper = paperData.find(p => p.sku === details.colorPaperSku);
    const coverPaper = paperData.find(p => p.sku === details.coverPaperSku);

    // Helper to remove parent sheet dimensions like "19x12.5" from paper names
    const stripDimensionsFromName = (name: string): string => {
        return name.replace(/\s+\d+(\.\d+)?x\d+(\.\d+)?/g, '').trim();
    };

    const trimSize = `${details.finishedWidth}" x ${details.finishedHeight}"`;

    let coverText = "No Cover";
    if (details.hasCover && coverPaper) {
        const printType = details.coverPrintsOnBothSides
            ? (details.coverPrintColor === PrintColor.COLOR ? '4/4' : '1/1')
            : (details.coverPrintColor === PrintColor.COLOR ? '4/0' : '1/0');
        const paperName = stripDimensionsFromName(coverPaper.name);
        coverText = `${paperName}, ${printType}`;
    }

    const internalParts = [];
    if (details.bwPages > 0 && bwPaper) {
        // Assume B/W pages are duplex (1/1)
        internalParts.push(`${details.bwPages} B/W pages (1/1) on ${stripDimensionsFromName(bwPaper.name)}`);
    }
    if (details.colorPages > 0 && colorPaper) {
        // Assume Color pages are duplex (4/4)
        internalParts.push(`${details.colorPages} Color pages (4/4) on ${stripDimensionsFromName(colorPaper.name)}`);
    }
    const internalText = internalParts.length > 0 ? internalParts.join(', ') : "No Internal Pages";

    let finishingText = "None";
    if (details.hasCover && details.laminationType !== 'none') {
        finishingText = `${details.laminationType.charAt(0).toUpperCase() + details.laminationType.slice(1)} Lamination`;
    }

    let bindingText = "Loose Leaf (Unbound)";
    if (details.bindingMethod === 'perfectBound') {
        bindingText = 'Perfect Bound';
    } else if (details.bindingMethod === 'saddleStitch') {
        bindingText = 'Saddle Stitch';
    }
    
    const specsText = `Book Title: ${details.bookTitle}
Trim Size:  ${trimSize}
Cover: ${coverText}
Internal: ${internalText}
Finishing: ${finishingText}
Binding: ${bindingText}`;

    navigator.clipboard.writeText(specsText).then(() => {
        setCopyButtonText('Copied!');
        setTimeout(() => setCopyButtonText('Copy Specs'), 2000);
    }).catch(err => {
        console.error('Failed to copy specs: ', err);
        setCopyButtonText('Copy Failed');
        setTimeout(() => setCopyButtonText('Copy Specs'), 2000);
    });
  }, [details]);


  const currentTrimSizeName = useMemo(() => {
    if (isCustomSize) {
      return 'Custom Size';
    }
    const match = commonTrimSizes.find(size =>
        size.width === details.finishedWidth && size.height === details.finishedHeight
    );
    // If dimensions no longer match a common size (e.g., due to rounding), revert to custom
    return match ? match.name : 'Custom Size';
  }, [isCustomSize, details.finishedWidth, details.finishedHeight]);


  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };
  
  const quantityAnalysisData = useMemo((): { chartData: ChartData; summaryData: SummaryDataRow[] } | null => {
    if (!details.quantity || details.quantity <= 0) return null;

    const quantityTiers = [
      Math.round(details.quantity * 0.25),
      Math.round(details.quantity * 0.5),
      details.quantity,
      Math.round(details.quantity * 2),
      Math.round(details.quantity * 5),
      Math.round(details.quantity * 10),
    ].filter(q => q >= 10); // Ensure a minimum sensible quantity
    
    const uniqueTiers = [...new Set(quantityTiers)].sort((a,b) => a - b);
    if (uniqueTiers.length === 0) uniqueTiers.push(details.quantity);

    const labels: string[] = [];
    const expenses: number[] = [];
    const labor: number[] = [];
    const profit: number[] = [];
    const totalPrice: number[] = [];
    const summaryData: SummaryDataRow[] = [];

    uniqueTiers.forEach(quantity => {
      const result = calculateCosts({ ...details, quantity });
      if (result && !result.error && isFinite(result.pricePerUnit) && result.pricePerUnit > 0) {
        labels.push(quantity.toLocaleString());
        
        const totalExpenses = result.bwPaperCost + result.colorPaperCost + result.coverPaperCost + result.bwClickCost + result.colorClickCost + result.coverClickCost + result.laminationCost;
        
        let laborValue = result.laborCost;
        let profitValue = result.markupAmount;
        let totalProfitValue = result.markupAmount;
        
        if (isOwnersLabor) {
          profitValue += laborValue;
          totalProfitValue += laborValue;
          laborValue = 0;
        }

        expenses.push(parseFloat((totalExpenses / quantity).toFixed(4)));
        labor.push(parseFloat((laborValue / quantity).toFixed(4)));
        profit.push(parseFloat((profitValue / quantity).toFixed(4)));
        totalPrice.push(parseFloat(result.pricePerUnit.toFixed(4)));
        
        summaryData.push({
          quantity,
          totalProfit: totalProfitValue,
          profitPerHour: result.productionTimeHours > 0 ? totalProfitValue / result.productionTimeHours : 0,
        });
      }
    });

    if (labels.length === 0) return null;

    const chartData = { labels, expenses, labor, profit, totalPrice };
    return { chartData, summaryData };
  }, [details, isOwnersLabor]);

  const renderCostRow = (label: string, value: string | number, subtext?: React.ReactNode, isTotal = false) => (
    <div className={`flex justify-between items-start py-3 ${isTotal ? 'border-t-2 border-blue-500 pt-4 mt-2' : 'border-b border-gray-200 dark:border-slate-700'}`}>
      <div className="pr-4">
        <p className={`font-semibold ${isTotal ? 'text-xl text-blue-500' : 'text-gray-800 dark:text-gray-200'}`}>{label}</p>
        {subtext && <div className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">{subtext}</div>}
      </div>
      <p className={`font-mono text-right flex-shrink-0 ${isTotal ? 'text-xl font-bold text-blue-500' : 'text-gray-900 dark:text-gray-100'}`}>
        {typeof value === 'number' ? formatCurrency(value) : value}
      </p>
    </div>
  );
  
  const formatTime = (minutes: number) => minutes < 1 ? '<1m' : `${Math.round(minutes)}m`;

  const laborSubtext = useMemo(() => {
    if (!costBreakdown.laborTimeBreakdown) return '';
    const { setupTimeMins, printingTimeMins, bindingTimeMins, laminatingTimeMins, trimmingTimeMins, wastageTimeMins } = costBreakdown.laborTimeBreakdown;
    const parts = [];
    if (setupTimeMins > 0) parts.push(`Setup: ${formatTime(setupTimeMins)}`);
    if (printingTimeMins > 0) parts.push(`Print: ${formatTime(printingTimeMins)}`);
    if (bindingTimeMins > 0) parts.push(`Bind: ${formatTime(bindingTimeMins)}`);
    if (laminatingTimeMins > 0) parts.push(`Laminate: ${formatTime(laminatingTimeMins)}`);
    if (trimmingTimeMins > 0) parts.push(`Trim: ${formatTime(trimmingTimeMins)}`);
    if (wastageTimeMins > 0) parts.push(`Misc: ${formatTime(wastageTimeMins)}`);
    
    return `${parts.join(' / ')} | Total: ${costBreakdown.productionTimeHours.toFixed(2)}hr @ ${formatCurrency(details.laborRate)}/hr`;
  }, [costBreakdown.laborTimeBreakdown, costBreakdown.productionTimeHours, details.laborRate]);


  const bwImpositionSubtext = (
    <div className="flex items-center space-x-1">
      <span>{`${costBreakdown.bwPressSheets} press sheets | ${costBreakdown.bwImposition}-up`}</span>
      <Tooltip text="Imposition ('-up') refers to how many pages can fit onto a single large press sheet. A higher number is more efficient.">
        <InfoIcon className="w-4 h-4" />
      </Tooltip>
    </div>
  );
  const colorImpositionSubtext = (
    <div className="flex items-center space-x-1">
      <span>{`${costBreakdown.colorPressSheets} press sheets | ${costBreakdown.colorImposition}-up`}</span>
      <Tooltip text="Imposition ('-up') refers to how many pages can fit onto a single large press sheet. A higher number is more efficient.">
        <InfoIcon className="w-4 h-4" />
      </Tooltip>
    </div>
  );
  const coverImpositionSubtext = (
    <div className="flex items-center space-x-1">
      <span>{`${costBreakdown.coverPressSheets} press sheets | ${costBreakdown.coverImposition}-up`}</span>
      <Tooltip text="Imposition ('-up') refers to how many pages can fit onto a single large press sheet. A higher number is more efficient.">
        <InfoIcon className="w-4 h-4" />
      </Tooltip>
    </div>
  );

  const laminationSubtext = useMemo(() => {
    if (details.laminationType === 'none') return undefined;
    const cost = details.laminationType === 'gloss' ? 0.30 : 0.60;
    return `${details.quantity} covers @ ${formatCurrency(cost)}/ea`;
  }, [details.quantity, details.laminationType]);

  const shippingSubtext = useMemo(() => {
    if (!details.calculateShipping || !costBreakdown.shippingBreakdown) return undefined;
    const { boxCount, boxName, booksPerBox, totalWeightLbs } = costBreakdown.shippingBreakdown;
    return `${boxCount}x ${boxName} (${booksPerBox} books/box) | ${totalWeightLbs.toFixed(2)} lbs total`;
  }, [details.calculateShipping, costBreakdown.shippingBreakdown]);


  const bindingWarning = useMemo(() => {
      if (details.bindingMethod === 'saddleStitch') {
          const totalPages = (details.bwPages || 0) + (details.colorPages || 0);
          if (totalPages > 0 && totalPages % 4 !== 0) {
              return 'Warning: Page count must be a multiple of 4 for saddle stitching.';
          }
          if (totalPages > 80) { 
              return 'Warning: Saddle stitching may not be suitable for books over 80 pages.';
          }
      }
      return null;
  }, [details.bindingMethod, details.bwPages, details.colorPages]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
      <div className="lg:col-span-3 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg">
        <div className="space-y-6">
          <section>
            <h3 className="text-xl font-bold border-b border-gray-300 dark:border-slate-600 pb-2 mb-4">Job Specifications</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="md:col-span-2">
                <label htmlFor="bookTitle" className="block mb-2 text-sm font-medium">Book Title</label>
                <input id="bookTitle" type="text" name="bookTitle" value={details.bookTitle} onChange={handleInputChange} className="input-field" placeholder="e.g., My Awesome Comic Vol. 1" />
              </div>
              <div>
                <label htmlFor="quantity" className="block mb-2 text-sm font-medium">Quantity</label>
                <input id="quantity" type="number" name="quantity" value={details.quantity} onChange={handleInputChange} className="input-field" />
              </div>
               <div>
                <label htmlFor="commonSizes" className="block mb-2 text-sm font-medium">Common Sizes</label>
                <SizeSearch value={currentTrimSizeName} onSizeSelect={handleSizeSelect} />
              </div>
              <div>
                <label htmlFor="finishedWidth" className="block mb-2 text-sm font-medium">Finished Width (in)</label>
                <input id="finishedWidth" type="number" name="finishedWidth" value={details.finishedWidth} onChange={handleInputChange} className="input-field" />
              </div>
              <div>
                <label htmlFor="finishedHeight" className="block mb-2 text-sm font-medium">Finished Height (in)</label>
                <input id="finishedHeight" type="number" name="finishedHeight" value={details.finishedHeight} onChange={handleInputChange} className="input-field" />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xl font-bold border-b border-gray-300 dark:border-slate-600 pb-2 mb-4">Black & White Interior</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-start">
              <div>
                <label htmlFor="bwPages" className="block text-sm font-medium mb-2">Page Count</label>
                <input id="bwPages" type="number" name="bwPages" value={details.bwPages} onChange={handleInputChange} className="input-field" placeholder="e.g., 20" />
              </div>
              <div>
                 <div className="flex items-center space-x-2 mb-2">
                    <label className="block text-sm font-medium">Paper</label>
                    <Tooltip text="GSM (Grams per Square Meter) is a standard measure of paper weight. Heavier paper feels thicker and more durable.">
                        <InfoIcon className="w-4 h-4" />
                    </Tooltip>
                </div>
                <PaperSearch name="bwPaperSku" value={details.bwPaperSku} onPaperSelect={handlePaperSelection} />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-xl font-bold border-b border-gray-300 dark:border-slate-600 pb-2 mb-4">Color Interior</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-start">
              <div>
                <label htmlFor="colorPages" className="block text-sm font-medium mb-2">Page Count</label>
                <input id="colorPages" type="number" name="colorPages" value={details.colorPages} onChange={handleInputChange} className="input-field" placeholder="e.g., 4" />
              </div>
              <div>
                <div className="flex items-center space-x-2 mb-2">
                    <label className="block text-sm font-medium">Paper</label>
                    <Tooltip text="GSM (Grams per Square Meter) is a standard measure of paper weight. Heavier paper feels thicker and more durable.">
                        <InfoIcon className="w-4 h-4" />
                    </Tooltip>
                </div>
                <PaperSearch name="colorPaperSku" value={details.colorPaperSku} onPaperSelect={handlePaperSelection} />
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between border-b border-gray-300 dark:border-slate-600 pb-2 mb-4">
              <h3 className="text-xl font-bold">Cover</h3>
              <ToggleSwitch name="hasCover" checked={details.hasCover} onChange={handleInputChange} label="Add Cover" />
            </div>
            {details.hasCover && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-start">
                <div>
                   <div className="flex items-center space-x-2 mb-2">
                      <label className="block text-sm font-medium">Paper</label>
                      <Tooltip text="GSM (Grams per Square Meter) is a standard measure of paper weight. Heavier paper feels thicker and more durable.">
                          <InfoIcon className="w-4 h-4" />
                      </Tooltip>
                  </div>
                  <PaperSearch name="coverPaperSku" value={details.coverPaperSku} onPaperSelect={handlePaperSelection} />
                </div>
                <div>
                  <label htmlFor="coverPrintColor" className="block text-sm font-medium mb-2">Printing Color</label>
                  <select id="coverPrintColor" name="coverPrintColor" value={details.coverPrintColor} onChange={handleInputChange} className="input-field">
                    <option value={PrintColor.COLOR}>Color</option>
                    <option value={PrintColor.BW}>Black & White</option>
                  </select>
                  <div className="mt-4">
                    <ToggleSwitch 
                        name="coverPrintsOnBothSides" 
                        checked={details.coverPrintsOnBothSides} 
                        onChange={handleInputChange} 
                        label="Print on both sides"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          <section>
             <h3 className="text-xl font-bold border-b border-gray-300 dark:border-slate-600 pb-2 mb-4">Finishing & Binding</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 items-start">
                <div>
                    <label htmlFor="bindingMethod" className="block text-sm font-medium mb-2">Binding</label>
                    <select id="bindingMethod" name="bindingMethod" value={details.bindingMethod} onChange={handleInputChange} className="input-field">
                        <option value="perfectBound">Perfect Bound</option>
                        <option value="saddleStitch">Saddle Stitch</option>
                        <option value="none">Loose Leaf (Unbound)</option>
                    </select>
                </div>
                {details.hasCover && (
                    <div>
                        <label htmlFor="laminationType" className="block text-sm font-medium mb-2">Lamination</label>
                         <select id="laminationType" name="laminationType" value={details.laminationType} onChange={handleInputChange} className="input-field">
                            <option value="none">No Lamination</option>
                            <option value="gloss">Gloss Lamination</option>
                            <option value="matte">Matte Lamination</option>
                        </select>
                    </div>
                )}
             </div>
             {bindingWarning && (
                <p className="mt-2 text-sm text-yellow-600 dark:text-yellow-400">{bindingWarning}</p>
             )}
          </section>
          
          <section>
            <div className="flex items-center justify-between border-b border-gray-300 dark:border-slate-600 pb-2 mb-4">
                <h3 className="text-xl font-bold">Shipping</h3>
                <ToggleSwitch name="calculateShipping" checked={details.calculateShipping} onChange={handleInputChange} label="Calculate Shipping" />
            </div>
             {details.calculateShipping && (
                <div className="space-y-4 pt-2">
                    <div>
                        <label htmlFor="overrideShippingBoxName" className="block text-sm font-medium mb-2">Box Selection</label>
                        <select 
                            id="overrideShippingBoxName" 
                            name="overrideShippingBoxName" 
                            value={details.overrideShippingBoxName || 'automatic'} 
                            onChange={handleInputChange} 
                            className="input-field"
                        >
                            <option value="automatic">Automatic (Recommended)</option>
                            {allBoxOptions.map(box => <option key={box.name} value={box.name}>{box.name}</option>)}
                        </select>
                    </div>

                    {costBreakdown.shippingBreakdown ? (
                        <div className="bg-gray-50 dark:bg-slate-700/50 p-3 rounded-lg text-sm">
                            <p className="font-semibold text-gray-800 dark:text-gray-200">Packing Plan</p>
                            <ul className="list-disc list-inside mt-1 text-gray-600 dark:text-gray-300">
                                <li><span className="font-medium">Box:</span> {costBreakdown.shippingBreakdown.boxName}</li>
                                <li><span className="font-medium">Total Boxes:</span> {costBreakdown.shippingBreakdown.boxCount}</li>
                                <li><span className="font-medium">Books per Box:</span> {costBreakdown.shippingBreakdown.booksPerBox}</li>
                                <li><span className="font-medium">Total Weight:</span> {costBreakdown.shippingBreakdown.totalWeightLbs.toFixed(2)} lbs</li>
                            </ul>
                        </div>
                    ) : (
                        <div className="bg-yellow-50 dark:bg-yellow-900/30 p-3 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
                            Could not determine a suitable shipping box. The finished book might be too large for standard boxes.
                        </div>
                    )}
                </div>
            )}
          </section>

          <section>
            <h3 className="text-xl font-bold border-b border-gray-300 dark:border-slate-600 pb-2 mb-4">Pricing</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
              <div>
                <label htmlFor="laborRate" className="block text-sm font-medium mb-2">Labor Rate ($/hr)</label>
                <input id="laborRate" type="number" name="laborRate" value={details.laborRate} onChange={handleInputChange} className="input-field" />
              </div>
              <div>
                <label htmlFor="markupPercent" className="block text-sm font-medium mb-2">Markup (%)</label>
                <input id="markupPercent" type="number" name="markupPercent" value={details.markupPercent} onChange={handleInputChange} className="input-field" />
              </div>
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <label htmlFor="spoilagePercent" className="block text-sm font-medium">Print Spoilage (%)</label>
                  <Tooltip text="Adds a percentage to the material count to account for setup sheets, paper jams, and other potential printing errors.">
                    <InfoIcon className="w-4 h-4" />
                  </Tooltip>
                </div>
                <input id="spoilagePercent" type="number" name="spoilagePercent" value={details.spoilagePercent} onChange={handleInputChange} className="input-field" />
              </div>
            </div>
          </section>
        </div>
      </div>
      <div className="lg:col-span-2 space-y-8">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Cost Summary</h3>
                <button 
                  onClick={handleCopySpecs}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50
                             bg-slate-100 text-slate-700 hover:bg-slate-200 
                             dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  disabled={copyButtonText !== 'Copy Specs'}
                >
                  {copyButtonText === 'Copied!' ? <CheckIcon className="w-4 h-4 text-green-500"/> : <CopyIcon className="w-4 h-4" />}
                  {copyButtonText}
                </button>
              </div>
              {costBreakdown.error ? (
                <div className="text-red-500 bg-red-100 dark:bg-red-900/30 p-4 rounded-lg text-center">
                  <p className="font-semibold">Calculation Error</p>
                  <p>{costBreakdown.error}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                      {details.bwPages > 0 && renderCostRow('B/W Paper', costBreakdown.bwPaperCost, bwImpositionSubtext)}
                      {details.colorPages > 0 && renderCostRow('Color Paper', costBreakdown.colorPaperCost, colorImpositionSubtext)}
                      {details.hasCover && renderCostRow('Cover Paper', costBreakdown.coverPaperCost, coverImpositionSubtext)}

                      {(details.bwPages > 0 || details.colorPages > 0 || details.hasCover) && 
                        renderCostRow('Clicks', costBreakdown.bwClickCost + costBreakdown.colorClickCost + costBreakdown.coverClickCost, `${costBreakdown.totalClicks.toLocaleString()} total impressions`)
                      }

                      {details.hasCover && details.laminationType !== 'none' &&
                        renderCostRow('Lamination', costBreakdown.laminationCost, laminationSubtext)
                      }
                      
                      {renderCostRow('Labor', costBreakdown.laborCost, laborSubtext)}
                  </div>
                  
                  <div className="border-b border-gray-200 dark:border-slate-700 my-3"></div>
                  {renderCostRow('Subtotal', costBreakdown.subtotal)}
                  {renderCostRow('Markup', costBreakdown.markupAmount, `${details.markupPercent}% of subtotal`)}
                  {details.calculateShipping && costBreakdown.shippingCost > 0 && 
                      renderCostRow('Shipping & Handling', costBreakdown.shippingCost, shippingSubtext)
                  }
                  
                  {renderCostRow('Total Price', costBreakdown.totalCost, true)}

                  <div className="mt-4 text-center bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
                      <p className="text-lg font-bold text-blue-800 dark:text-blue-200">{formatCurrency(costBreakdown.pricePerUnit)} per unit</p>
                  </div>
                </>
              )}
          </div>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-lg h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">Quantity Analysis</h3>
              {quantityAnalysisData && (
                <button 
                  onClick={() => setIsChartModalOpen(true)} 
                  className="p-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"
                  aria-label="Expand chart"
                >
                  <ExpandIcon className="w-5 h-5" />
                </button>
              )}
            </div>
             <div className="flex-grow">
               <QuantityDiscountChart chartData={quantityAnalysisData?.chartData ?? null} />
            </div>
          </div>
      </div>

       {isChartModalOpen && quantityAnalysisData && (
        <div 
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setIsChartModalOpen(false)}
        >
          <div 
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[80vh] p-6 relative flex flex-col lg:flex-row gap-6"
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setIsChartModalOpen(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-red-600 dark:hover:text-red-400 z-10"
              aria-label="Close chart view"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="w-full lg:w-2/3 h-1/2 lg:h-full">
              <QuantityDiscountChart chartData={quantityAnalysisData.chartData} />
            </div>
            <div className="w-full lg:w-1/3 overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-lg font-bold">Profitability Summary</h4>
                  <Tooltip text="When enabled, labor cost is treated as profit instead of an expense in this analysis.">
                    <div>
                      <ToggleSwitch 
                        name="isOwnersLabor" 
                        checked={isOwnersLabor} 
                        onChange={(e) => setIsOwnersLabor(e.target.checked)} 
                        label="Owner's Labor?"
                      />
                    </div>
                  </Tooltip>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-slate-700 dark:text-gray-400">
                            <tr>
                                <th scope="col" className="px-4 py-3">Qty</th>
                                <th scope="col" className="px-4 py-3">Total Profit</th>
                                <th scope="col" className="px-4 py-3">Profit/Hour</th>
                            </tr>
                        </thead>
                        <tbody>
                            {quantityAnalysisData.summaryData.map(row => (
                                <tr key={row.quantity} className="border-b dark:border-slate-700">
                                    <th scope="row" className="px-4 py-3 font-medium whitespace-nowrap">{row.quantity.toLocaleString()}</th>
                                    <td className="px-4 py-3">{formatCurrency(row.totalProfit)}</td>
                                    <td className="px-4 py-3">{formatCurrency(row.profitPerHour)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calculator;