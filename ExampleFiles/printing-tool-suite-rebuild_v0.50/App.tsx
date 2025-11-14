
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileUploadButton } from './components/FileUploadButton';
import { SelectField } from './components/SelectField';
import { NumberField } from './components/NumberField';
import { Button } from './components/Button';
import { Icon } from './components/Icon';
import PdfPreview from './components/PdfPreview';
import { ToggleSwitch } from './components/ToggleSwitch'; 
import { BookSpineCalculator } from './components/BookSpineCalculator';
import { JobInformationForm } from './components/JobInformationForm';
import { BoxLabelPrinter } from './components/BoxLabelPrinter';
import { ProofingTool } from './components/ProofingTool'; // New Proofing Tool
import { TextField } from './components/TextField';
import { usePdfImposition } from './hooks/usePdfImposition';
import { usePdfInfo } from './hooks/usePdfInfo';
import { useDebounce } from './hooks/useDebounce';
import { useImpositionPresets } from './hooks/useImpositionPresets';
import { SheetConfig, ImpositionType, SheetOrientation, JobInfoState, SlipSheetColorName, ReadingDirection, RowOffsetType, AlternateRotationType, ImpositionPreset, ImpositionSettings } from './types';
import { 
  SHEET_SIZES, IMPOSITION_TYPE_OPTIONS, SHEET_ORIENTATION_OPTIONS,
  DEFAULT_BLEED_INCHES, DEFAULT_SHEET_SIZE_NAME,
  DEFAULT_HORIZONTAL_GUTTER_INCHES, DEFAULT_VERTICAL_GUTTER_INCHES,
  DEFAULT_IMPOSITION_TYPE, DEFAULT_SHEET_ORIENTATION,
  DEFAULT_CLIENT_NAME, // Legacy
  DEFAULT_INCLUDE_INFO, DEFAULT_IS_DUPLEX, DEFAULT_JOB_INFO_STATE,
  DEFAULT_COMPANY_NAME_FOR_LABEL, DEFAULT_ADD_FIRST_SHEET_SLIP,
  SLIP_SHEET_COLORS, DEFAULT_SLIP_SHEET_COLOR_NAME,
  READING_DIRECTION_OPTIONS, DEFAULT_READING_DIRECTION, DEFAULT_SHOW_SPINE_MARKS,
  DEFAULT_COLUMNS, DEFAULT_ROWS, ROW_OFFSET_OPTIONS, ALTERNATE_ROTATION_OPTIONS,
  DEFAULT_ROW_OFFSET_TYPE, DEFAULT_ALTERNATE_ROTATION_TYPE,
  INCH_TO_POINTS, DEFAULT_PREVIEW_PAGE_WIDTH_POINTS, DEFAULT_PREVIEW_PAGE_HEIGHT_POINTS,
  DEFAULT_CREEP_INCHES
} from './constants';

type TabKey = 'imposition' | 'proofing' | 'calculator' | 'boxLabel'; // Added 'proofing'

const OUTPUT_FILE_SIZE_THRESHOLD_BYTES = 1900 * 1024 * 1024; // ~1.9 GB, a safe limit for pdf-lib

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('imposition');
  const [inputFile, setInputFile] = useState<File | null>(null);
  const [isLargeFile, setIsLargeFile] = useState<boolean>(false);
  const [selectedSheetName, setSelectedSheetName] = useState<string>(DEFAULT_SHEET_SIZE_NAME);
  const [columns, setColumns] = useState<number>(DEFAULT_COLUMNS);
  const [rows, setRows] = useState<number>(DEFAULT_ROWS);
  const [bleedInches, setBleedInches] = useState<number>(DEFAULT_BLEED_INCHES);
  const [horizontalGutterInches, setHorizontalGutterInches] = useState<number>(DEFAULT_HORIZONTAL_GUTTER_INCHES);
  const [verticalGutterInches, setVerticalGutterInches] = useState<number>(DEFAULT_VERTICAL_GUTTER_INCHES);
  const [impositionType, setImpositionType] = useState<ImpositionType>(DEFAULT_IMPOSITION_TYPE);
  const [sheetOrientation, setSheetOrientation] = useState<SheetOrientation>(DEFAULT_SHEET_ORIENTATION);
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>(DEFAULT_READING_DIRECTION);
  const [rowOffsetType, setRowOffsetType] = useState<RowOffsetType>(DEFAULT_ROW_OFFSET_TYPE);
  const [alternateRotationType, setAlternateRotationType] = useState<AlternateRotationType>(DEFAULT_ALTERNATE_ROTATION_TYPE);
  const [creepInches, setCreepInches] = useState<number>(DEFAULT_CREEP_INCHES);
  
  const [legacyClientName, setLegacyClientName] = useState<string>(DEFAULT_CLIENT_NAME); // May deprecate
  const [includeInfo, setIncludeInfo] = useState<boolean>(DEFAULT_INCLUDE_INFO);
  const [isDuplex, setIsDuplex] = useState<boolean>(DEFAULT_IS_DUPLEX);
  const [showSpineMarks, setShowSpineMarks] = useState<boolean>(DEFAULT_SHOW_SPINE_MARKS);
  const [addFirstSheetSlip, setAddFirstSheetSlip] = useState<boolean>(DEFAULT_ADD_FIRST_SHEET_SLIP);
  const [firstSheetSlipColor, setFirstSheetSlipColor] = useState<SlipSheetColorName>(DEFAULT_SLIP_SHEET_COLOR_NAME);


  const [jobInfo, setJobInfo] = useState<JobInfoState>(DEFAULT_JOB_INFO_STATE);
  const [showJobInfoForm, setShowJobInfoForm] = useState<boolean>(false);
  const [companyNameForLabel, setCompanyNameForLabel] = useState<string>(DEFAULT_COMPANY_NAME_FOR_LABEL);

  const { pdfDocProxy, pdfInfo, isLoading: isPdfInfoLoading, error: pdfInfoError } = usePdfInfo(inputFile);

  const { presets, savePreset, deletePreset } = useImpositionPresets();
  const [activePresetName, setActivePresetName] = useState('custom');
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState("");


  const selectedSheet = SHEET_SIZES.find(s => s.name === selectedSheetName) || SHEET_SIZES[0];

  const debouncedBleedInches = useDebounce(bleedInches, 300);
  const debouncedHorizontalGutterInches = useDebounce(horizontalGutterInches, 300);
  const debouncedVerticalGutterInches = useDebounce(verticalGutterInches, 300);
  const debouncedJobInfo = useDebounce(jobInfo, 500);

  // Auto-adjust settings for booklet mode
  useEffect(() => {
    if (impositionType === 'booklet') {
      setColumns(2);
      setRows(1);
      setIsDuplex(true);
    }
  }, [impositionType]);

  // Effect to determine if chunked processing is needed, based on estimated output file size
  useEffect(() => {
    if (!inputFile) {
      setIsLargeFile(false);
      return;
    }

    let shouldChunk = false;
    if (impositionType === 'repeat') {
      const slotsPerSheet = columns * rows;
      // For 'repeat', the output file size is roughly the input size times the number of slots,
      // as each page from the input is duplicated for every slot.
      const estimatedOutputSize = inputFile.size * slotsPerSheet;
      if (estimatedOutputSize > OUTPUT_FILE_SIZE_THRESHOLD_BYTES) {
        shouldChunk = true;
      }
    } else {
      // For 'stack', 'collateCut', and 'booklet', the output size is roughly the same as the input size.
      if (inputFile.size > OUTPUT_FILE_SIZE_THRESHOLD_BYTES) {
        shouldChunk = true;
      }
    }
    
    setIsLargeFile(shouldChunk);
  }, [inputFile, impositionType, columns, rows]);


  const { imposePdf, outputPdfUrl, isLoading, error, message, clearOutput, impositionProgress } = usePdfImposition({
    inputFile,
    selectedSheet,
    columns,
    rows,
    bleedInches, 
    horizontalGutterInches,
    verticalGutterInches,
    impositionType,
    sheetOrientation,
    readingDirection,
    clientName: legacyClientName, 
    includeInfo,
    isDuplex, 
    showSpineMarks,
    jobInfo, 
    addFirstSheetSlip,
    firstSheetSlipColor,
    rowOffsetType,
    alternateRotationType,
    creepInches,
    isLargeFile,
  });

  const handleFileSelect = (file: File) => {
    setInputFile(file);
    // isLargeFile state is now managed by the useEffect hook
    setJobInfo(prev => ({
        ...prev,
        fileNameTitle: prev.fileNameTitle || file.name.substring(0, file.name.lastIndexOf('.')) || file.name
    }));
    clearOutput(); 
  };
  
  const handleJobInfoChange = useCallback(<K extends keyof JobInfoState>(key: K, value: JobInfoState[K]) => {
    setJobInfo(prev => ({ ...prev, [key]: value }));
  }, []);


  const handleImposeClick = async () => {
    await imposePdf();
  };
  
  const prevIsLoadingRef = useRef(isLoading);
  const prevOutputPdfUrlRef = useRef(outputPdfUrl);

  // This effect now primarily manages auto-clearing the output URL on setting changes.
  useEffect(() => {
    // If the file is removed, clear the output
    if (!inputFile && outputPdfUrl) {
      clearOutput();
      return;
    }
    // If the main process is not running and there is an output URL,
    // it means the settings have changed since the last run. Clear the old output.
    if (!isLoading && outputPdfUrl) {
       clearOutput();
    }
    // We only want this to run when one of these specific settings changes.
  }, [
    selectedSheetName, columns, rows, bleedInches, horizontalGutterInches, 
    verticalGutterInches, impositionType, sheetOrientation, readingDirection,
    legacyClientName, includeInfo, isDuplex, showSpineMarks, jobInfo, addFirstSheetSlip, firstSheetSlipColor,
    rowOffsetType, alternateRotationType, creepInches,
    inputFile, // Also trigger on file change
  ]);

  const calculateMaxUnits = (
    availableDimension: number,
    itemDimension: number,
    gutter: number
  ): number => {
    if (itemDimension <= 0) return 1;
    return Math.floor((availableDimension + gutter) / (itemDimension + gutter));
  };

  const getMaxUnitsForCurrentOrientation = (dimension: 'width' | 'height') => {
    if (!pdfInfo) return;

    const pageDim = { width: pdfInfo.width, height: pdfInfo.height };
    const hGutterPts = horizontalGutterInches * INCH_TO_POINTS;
    const vGutterPts = verticalGutterInches * INCH_TO_POINTS;
    let paperW = selectedSheet.longSideInches * INCH_TO_POINTS;
    let paperH = selectedSheet.shortSideInches * INCH_TO_POINTS;
    
    if (sheetOrientation === 'portrait') {
        [paperW, paperH] = [paperH, paperW];
    } else if (sheetOrientation === 'auto') {
        const contentW = (pageDim.width * columns) + (Math.max(0, columns - 1) * hGutterPts);
        const contentH = (pageDim.height * rows) + (Math.max(0, rows - 1) * vGutterPts);
        const fitsLandscape = contentW <= paperW && contentH <= paperH;
        const fitsPortrait = contentW <= paperH && contentH <= paperW;
        if (!fitsLandscape && fitsPortrait) {
            [paperW, paperH] = [paperH, paperW];
        }
    }
    
    if (dimension === 'width') {
        setColumns(calculateMaxUnits(paperW, pageDim.width, hGutterPts));
    } else {
        setRows(calculateMaxUnits(paperH, pageDim.height, vGutterPts));
    }
  };

  const handleCalculateAbsoluteMax = () => {
    if (!pdfInfo) return;
    
    const pageW = pdfInfo.width;
    const pageH = pdfInfo.height;
    const hGutter = horizontalGutterInches * INCH_TO_POINTS;
    const vGutter = verticalGutterInches * INCH_TO_POINTS;
    const paperLong = selectedSheet.longSideInches * INCH_TO_POINTS;
    const paperShort = selectedSheet.shortSideInches * INCH_TO_POINTS;

    // The previous logic incorrectly considered rotating the page content, which the
    // imposition engine does not support. This new logic only considers the two
    // possible sheet orientations for the content's fixed aspect ratio.

    // Scenario 1: Sheet is oriented as Landscape
    const landscapeScenario = {
      orientation: 'landscape' as SheetOrientation,
      cols: calculateMaxUnits(paperLong, pageW, hGutter),
      rows: calculateMaxUnits(paperShort, pageH, vGutter),
    };
    const landscapeTotal = landscapeScenario.cols * landscapeScenario.rows;

    // Scenario 2: Sheet is oriented as Portrait
    const portraitScenario = {
      orientation: 'portrait' as SheetOrientation,
      cols: calculateMaxUnits(paperShort, pageW, hGutter),
      rows: calculateMaxUnits(paperLong, pageH, vGutter),
    };
    const portraitTotal = portraitScenario.cols * portraitScenario.rows;

    // Prefer landscape if it's better or equal, as it's common for press sheets.
    const bestScenario = landscapeTotal >= portraitTotal ? landscapeScenario : portraitScenario;
    
    if (bestScenario.cols > 0 && bestScenario.rows > 0) {
        setSheetOrientation(bestScenario.orientation);
        setColumns(bestScenario.cols);
        setRows(bestScenario.rows);
        setActivePresetName('custom');
    } else {
        // Fallback for when content doesn't fit at all.
        // Still set the values so the user sees 0 and the orientation that was tested.
        setSheetOrientation(bestScenario.orientation);
        setColumns(bestScenario.cols);
        setRows(bestScenario.rows);
        setActivePresetName('custom');
    }
  };


  const handleLoadPreset = (presetName: string) => {
    setActivePresetName(presetName);
    if (presetName === 'custom') {
      return;
    }
    const preset = presets.find(p => p.name === presetName);
    if (preset) {
      setSelectedSheetName(preset.selectedSheetName);
      setColumns(preset.columns);
      setRows(preset.rows);
      setBleedInches(preset.bleedInches);
      setHorizontalGutterInches(preset.horizontalGutterInches);
      setVerticalGutterInches(preset.verticalGutterInches);
      setImpositionType(preset.impositionType);
      setSheetOrientation(preset.sheetOrientation);
      setReadingDirection(preset.readingDirection);
      setIncludeInfo(preset.includeInfo);
      setIsDuplex(preset.isDuplex);
      setShowSpineMarks(preset.showSpineMarks);
      setAddFirstSheetSlip(preset.addFirstSheetSlip);
      setFirstSheetSlipColor(preset.firstSheetSlipColor);
      setRowOffsetType(preset.rowOffsetType);
      setAlternateRotationType(preset.alternateRotationType);
      setCreepInches(preset.creepInches || DEFAULT_CREEP_INCHES);
    }
  };

  const handleSettingChange = <T,>(setter: React.Dispatch<React.SetStateAction<T>>) => (value: T) => {
      setter(value);
      setActivePresetName('custom');
  };

  const handleSavePreset = () => {
    const nameToSave = newPresetName.trim() || `Preset ${presets.length + 1}`;
    const settings: ImpositionSettings = {
      selectedSheetName, columns, rows, bleedInches, horizontalGutterInches,
      verticalGutterInches, impositionType, sheetOrientation, readingDirection,
      includeInfo, isDuplex, showSpineMarks, addFirstSheetSlip, firstSheetSlipColor,
      rowOffsetType, alternateRotationType, creepInches
    };
    savePreset(nameToSave, settings);
    setActivePresetName(nameToSave);
    setIsSavingPreset(false);
    setNewPresetName("");
  };

  const handleDeletePreset = () => {
    if (activePresetName !== 'custom' && window.confirm(`Are you sure you want to delete the preset "${activePresetName}"?`)) {
      deletePreset(activePresetName);
      setActivePresetName('custom');
    }
  };

  
  const previewPageInfoForChild = pdfInfo ? {
      width: pdfInfo.width,
      height: pdfInfo.height,
      pageCount: pdfInfo.pageCount,
      error: pdfInfoError || undefined,
  } : (pdfInfoError ? {
      width: DEFAULT_PREVIEW_PAGE_WIDTH_POINTS,
      height: DEFAULT_PREVIEW_PAGE_HEIGHT_POINTS,
      pageCount: 0,
      error: pdfInfoError,
  } : null);


  const isBookletMode = impositionType === 'booklet';


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 py-8 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-extrabold text-white sm:text-5xl md:text-6xl">
          MCE Printing <span className="text-indigo-400">Toolkit</span>
        </h1>
        <p className="mt-3 max-w-md mx-auto text-base text-slate-300 sm:text-lg md:mt-5 md:text-xl md:max-w-3xl">
          Advanced PDF layout, job info, cover calculations, box labels, and proofing. Submit all bugs and requests to mike@mceprinting.com.
        </p>
      </header>

      <div className="w-full max-w-7xl mb-8">
        <div className="flex flex-wrap justify-center border-b border-slate-700">
          {(['imposition', 'proofing', 'calculator', 'boxLabel'] as TabKey[]).map((tabKey) => {
            let tabName = '';
            if (tabKey === 'imposition') tabName = 'Imposition Tool';
            else if (tabKey === 'proofing') tabName = 'Proofing Tool';
            else if (tabKey === 'calculator') tabName = 'Book Cover Calculator';
            else if (tabKey === 'boxLabel') tabName = 'Box Label Printer';
            
            return (
              <button
                key={tabKey}
                onClick={() => setActiveTab(tabKey)}
                aria-current={activeTab === tabKey ? 'page' : undefined}
                className={`px-3 sm:px-6 py-3 font-medium text-sm sm:text-lg focus:outline-none whitespace-nowrap ${
                  activeTab === tabKey
                    ? 'border-b-2 border-indigo-400 text-indigo-300'
                    : 'text-slate-400 hover:text-indigo-300 hover:border-b-2 hover:border-slate-500'
                } transition-all duration-150 ease-in-out`}
              >
                {tabName}
              </button>
            );
          })}
        </div>
      </div>

      <main className="w-full max-w-7xl">
        {activeTab === 'imposition' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Imposition Settings Panel */}
            <div className="bg-white shadow-2xl rounded-lg p-6 sm:p-8 space-y-6 lg:order-1">
              <div className="border-b border-gray-200 pb-5">
                <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center">
                  <Icon iconName="settings" className="w-6 h-6 mr-2 text-indigo-600" />
                  Imposition Settings
                </h3>
              </div>
              
              {/* Presets Section */}
              <div className="space-y-3 border-b border-gray-200 pb-4">
                <div className="flex items-end gap-2">
                    <SelectField
                        id="preset"
                        label="Presets"
                        value={activePresetName}
                        options={[{ value: 'custom', label: 'Custom Settings' }, ...presets.map(p => ({ value: p.name, label: p.name }))]}
                        onChange={handleLoadPreset}
                        className="flex-grow"
                    />
                     <Button onClick={() => { setIsSavingPreset(true); setNewPresetName(activePresetName !== 'custom' ? activePresetName : ''); }} variant="secondary" className="h-[38px]" title="Save As Preset" disabled={isLoading}><Icon iconName="save" className="w-5 h-5"/></Button>
                    {activePresetName !== 'custom' && (
                        <Button onClick={handleDeletePreset} variant="danger" className="h-[38px]" title="Delete Preset" disabled={isLoading}><Icon iconName="trash" className="w-5 h-5"/></Button>
                    )}
                </div>
                {isSavingPreset && (
                    <div className="p-3 bg-indigo-50 rounded-md flex items-end gap-2">
                        <TextField id="newPresetName" label="Save as:" value={newPresetName} onChange={setNewPresetName} onKeyPress={(e) => e.key === 'Enter' && handleSavePreset()} placeholder="Enter preset name" className="flex-grow"/>
                        <Button onClick={handleSavePreset} className="h-[38px]">Save</Button>
                        <Button onClick={() => setIsSavingPreset(false)} variant="secondary" className="h-[38px]">Cancel</Button>
                    </div>
                )}
              </div>


              <div>
                <FileUploadButton 
                  onFileSelect={handleFileSelect} 
                  label={inputFile ? `File: ${inputFile.name}` : "Upload PDF Document"}
                  disabled={isLoading}
                />
                {inputFile && (
                    <>
                    {isLargeFile && (
                        <div className="mt-2 p-3 bg-amber-50 border border-amber-300 rounded-md text-sm text-amber-800 flex items-center gap-2">
                            <Icon iconName="alertTriangle" className="w-5 h-5 flex-shrink-0" />
                            <div>
                                <strong>Large File Warning:</strong>
                                {impositionType === 'repeat'
                                  ? ` Based on the input file size and ${columns}x${rows} layout, the estimated output will exceed the browser's 2GB limit.`
                                  : " This PDF file is over 1.9 GB, which exceeds the browser's processing limit."
                                }
                                {" To prevent crashing, the output will be generated and downloaded in multiple parts. You may need to combine them using software like Adobe Acrobat."}
                            </div>
                        </div>
                    )}
                    <p className="mt-2 text-sm text-gray-500">
                        {inputFile.name} ({(inputFile.size / 1024 / 1024).toFixed(2)} MB)
                        {isPdfInfoLoading && " - Loading info..."}
                        {pdfInfo && ` - ${pdfInfo.pageCount} pages`}
                        {isBookletMode && pdfInfo && pdfInfo.pageCount % 4 !== 0 && <span className="text-amber-700"> (will be padded to {Math.ceil(pdfInfo.pageCount / 4) * 4} pages)</span>}
                    </p>
                    </>
                )}
              </div>
              
              {/* Legacy Client Name and Include Info Toggle */}
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                <div className="sm:col-span-1">
                    <label htmlFor="legacyClientName" className="block text-sm font-medium text-gray-700">
                        Quick Client Ref (Optional)
                    </label>
                    <input 
                        type="text"
                        name="legacyClientName"
                        id="legacyClientName"
                        value={legacyClientName}
                        onChange={(e) => setLegacyClientName(e.target.value)}
                        disabled={isLoading}
                        className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm disabled:opacity-50 disabled:bg-gray-100"
                        placeholder="e.g., Acme Corp (Legacy)"
                    />
                </div>
                <div className="sm:col-span-1 flex flex-col space-y-3 items-start justify-end pb-1"> 
                    <ToggleSwitch
                        id="includeInfo"
                        label="Include Job Info on Sheets"
                        checked={includeInfo}
                        onChange={handleSettingChange(setIncludeInfo)}
                        disabled={isLoading}
                    />
                     <ToggleSwitch
                        id="addFirstSheetSlip"
                        label="Mark First Sheet (Slip)"
                        checked={addFirstSheetSlip}
                        onChange={handleSettingChange(setAddFirstSheetSlip)}
                        disabled={isLoading}
                    />
                    {addFirstSheetSlip && (
                       <SelectField
                          id="firstSheetSlipColor"
                          label="Slip Sheet Color"
                          value={firstSheetSlipColor}
                          options={SLIP_SHEET_COLORS.map(c => ({ value: c.name, label: c.name }))}
                          onChange={handleSettingChange(setFirstSheetSlipColor as (val: string) => void)}
                          disabled={isLoading}
                          className="w-full mt-2" 
                        />
                    )}
                </div>
              </div>

              {/* Job Information Form Toggle and Section */}
              <div className="border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={() => setShowJobInfoForm(!showJobInfoForm)}
                  className="flex items-center justify-between w-full text-left text-md font-medium text-indigo-600 hover:text-indigo-800 focus:outline-none"
                  aria-expanded={showJobInfoForm}
                >
                  Job Information Details
                  <Icon iconName={showJobInfoForm ? 'chevronUp' : 'chevronDown'} className="w-5 h-5" />
                </button>
                {showJobInfoForm && (
                  <JobInformationForm 
                    jobInfo={jobInfo}
                    onJobInfoChange={handleJobInfoChange}
                    disabled={isLoading}
                  />
                )}
              </div>
              
               <div className="pt-4 border-t border-gray-200 space-y-4">
                  <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                    <SelectField
                      id="impositionType"
                      label="Imposition Type"
                      value={impositionType}
                      options={IMPOSITION_TYPE_OPTIONS}
                      onChange={handleSettingChange(setImpositionType as (val: string) => void)}
                      disabled={isLoading}
                      className="sm:col-span-1"
                    />
                    <div className="sm:col-span-1 flex flex-col space-y-2 items-start justify-end pb-1">
                        <ToggleSwitch
                            id="isDuplex"
                            label="Duplex Printing"
                            checked={isDuplex}
                            onChange={handleSettingChange(setIsDuplex)}
                            disabled={isLoading || isBookletMode}
                        />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                      <div className="flex items-end space-x-2">
                        <NumberField
                            id="columns"
                            label="Columns (Across)"
                            value={columns}
                            onChange={(v) => handleSettingChange(setColumns)(Math.max(1, Math.floor(v)))}
                            min={1}
                            step={1}
                            disabled={isLoading || !pdfInfo || isBookletMode}
                            className="flex-grow"
                        />
                        <Button onClick={() => getMaxUnitsForCurrentOrientation('width')} disabled={isLoading || !pdfInfo || isBookletMode} className="px-3 py-2 h-[38px] !text-xs" variant="secondary">Max</Button>
                      </div>
                      <div className="flex items-end space-x-2">
                          <NumberField
                              id="rows"
                              label="Rows (Down)"
                              value={rows}
                              onChange={(v) => handleSettingChange(setRows)(Math.max(1, Math.floor(v)))}
                              min={1}
                              step={1}
                              disabled={isLoading || !pdfInfo || isBookletMode}
                              className="flex-grow"
                          />
                          <Button onClick={() => getMaxUnitsForCurrentOrientation('height')} disabled={isLoading || !pdfInfo || isBookletMode} className="px-3 py-2 h-[38px] !text-xs" variant="secondary">Max</Button>
                      </div>
                  </div>
                  {!isBookletMode && (
                    <Button onClick={handleCalculateAbsoluteMax} disabled={isLoading || !pdfInfo} variant="secondary" className="w-full">
                        Calculate Absolute Max Layout
                    </Button>
                  )}
              </div>
              
              <div className="pt-4 border-t border-gray-200 space-y-4">
                <h4 className="text-md font-medium text-gray-700">Step & Repeat Options</h4>
                <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                    <SelectField
                        id="rowOffset"
                        label="Row Offset / Stagger"
                        value={rowOffsetType}
                        options={ROW_OFFSET_OPTIONS}
                        onChange={handleSettingChange(setRowOffsetType as (val:string)=>void)}
                        disabled={isLoading || rows <= 1 || isBookletMode}
                        className={(rows <= 1 || isBookletMode) ? 'opacity-50' : ''}
                    />
                    <SelectField
                        id="alternateRotation"
                        label="Rotation"
                        value={alternateRotationType}
                        options={ALTERNATE_ROTATION_OPTIONS}
                        onChange={handleSettingChange(setAlternateRotationType as (val:string)=>void)}
                        disabled={isLoading || (columns * rows) <= 1 || isBookletMode}
                        className={((columns * rows) <= 1 || isBookletMode) ? 'opacity-50' : ''}
                    />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 space-y-4">
                  <h4 className="text-md font-medium text-gray-700">Binding & Finishing Options</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                      <div>
                          <ToggleSwitch
                              id="showSpineMarks"
                              label="Show Spine/Binding Marks"
                              checked={showSpineMarks}
                              onChange={handleSettingChange(setShowSpineMarks)}
                              disabled={isLoading}
                          />
                      </div>
                      {showSpineMarks && (
                          <SelectField
                              id="readingDirection"
                              label="Spine Direction"
                              value={readingDirection}
                              options={READING_DIRECTION_OPTIONS}
                              onChange={handleSettingChange(setReadingDirection as (val: string) => void)}
                              disabled={isLoading}
                          />
                      )}
                      {isBookletMode && (
                          <NumberField
                              id="creepInches"
                              label="Total Creep (Shingling)"
                              unit="inches"
                              value={creepInches}
                              onChange={handleSettingChange(setCreepInches)}
                              min={0}
                              step={0.001}
                              disabled={isLoading}
                              className="sm:col-span-1"
                          />
                      )}
                  </div>
              </div>


              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-3">
                <NumberField
                  id="bleedInches"
                  label="Bleed Amount"
                  unit="inches"
                  value={bleedInches}
                  onChange={handleSettingChange(setBleedInches)}
                  min={0}
                  step={0.001} 
                  disabled={isLoading}
                  className="sm:col-span-1"
                />
                <SelectField
                  id="sheetSize"
                  label="Paper Size"
                  value={selectedSheetName}
                  options={SHEET_SIZES.map(s => ({ value: s.name, label: s.name }))}
                  onChange={handleSettingChange(setSelectedSheetName as (val: string) => void)}
                  disabled={isLoading}
                  className="sm:col-span-1"
                />
                <SelectField
                  id="sheetOrientation"
                  label="Sheet Orientation"
                  value={sheetOrientation}
                  options={SHEET_ORIENTATION_OPTIONS}
                  onChange={handleSettingChange(setSheetOrientation as (val: string) => void)}
                  disabled={isLoading}
                  className="sm:col-span-1"
                />
              </div>
              
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
                <NumberField
                  id="horizontalGutterInches"
                  label="Horizontal Gutter"
                  unit="inches"
                  value={horizontalGutterInches}
                  onChange={handleSettingChange(setHorizontalGutterInches)}
                  min={0}
                  step={0.001}
                  disabled={isLoading || columns <= 1}
                  className={columns <= 1 ? 'opacity-50 cursor-not-allowed' : ''}
                />
                <NumberField
                  id="verticalGutterInches"
                  label="Vertical Gutter"
                  unit="inches"
                  value={verticalGutterInches}
                  onChange={handleSettingChange(setVerticalGutterInches)}
                  min={0}
                  step={0.001}
                  disabled={isLoading || rows <= 1} 
                  className={rows <= 1 ? 'opacity-50 cursor-not-allowed' : ''}
                />
              </div>

              <div className="pt-5">
                <Button
                  onClick={handleImposeClick}
                  isLoading={isLoading}
                  disabled={!inputFile || isLoading}
                  icon="download"
                  variant="success"
                  className="w-full"
                >
                  {isLoading ? `Imposing... ${impositionProgress}%` : 'Impose PDF & Download'}
                </Button>
                {isLoading && (
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2">
                    <div
                      className="bg-indigo-600 h-2.5 rounded-full transition-all duration-150 ease-out"
                      style={{ width: `${impositionProgress}%` }}
                      role="progressbar"
                      aria-valuenow={impositionProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Imposition progress"
                    ></div>
                  </div>
                )}
                {error && (
                  <p className="mt-2 text-sm text-red-600 flex items-center">
                    <Icon iconName="alertTriangle" className="w-4 h-4 mr-1" /> {error}
                  </p>
                )}
                {message && !error && (
                  <p className="mt-2 text-sm text-green-700 bg-green-50 p-3 rounded-md flex items-center">
                    {message}
                  </p>
                )}
                {outputPdfUrl && !isLoading && !error && (
                  <a
                    href={outputPdfUrl}
                    download={`${jobInfo.fileNameTitle || inputFile?.name.replace(/\.pdf$/i, '') || 'imposed_output'}.pdf`}
                    className="mt-3 inline-flex w-full items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    <Icon iconName="download" className="w-5 h-5 mr-2" />
                    Download Imposed PDF Again
                  </a>
                )}
              </div>
            </div>

            {/* PDF Preview Panel */}
            <div className="bg-white shadow-2xl rounded-lg lg:order-2 h-[720px] max-h-[calc(100vh-200px)] min-h-[400px] flex flex-col overflow-hidden">
                {activeTab === 'imposition' && (
                    <PdfPreview
                        pdfDocProxy={pdfDocProxy}
                        previewPageInfo={previewPageInfoForChild}
                        isPdfJsDocLoading={isPdfInfoLoading}
                        selectedSheet={selectedSheet}
                        columns={columns}
                        rows={rows}
                        bleedInches={debouncedBleedInches}
                        horizontalGutterInches={debouncedHorizontalGutterInches}
                        verticalGutterInches={debouncedVerticalGutterInches}
                        impositionType={impositionType}
                        sheetOrientation={sheetOrientation}
                        isLoadingPdf={isLoading} 
                        includeInfo={includeInfo}
                        isDuplex={isDuplex}
                        jobInfo={debouncedJobInfo} 
                        addFirstSheetSlip={addFirstSheetSlip}
                        firstSheetSlipColor={firstSheetSlipColor}
                        showSpineMarks={showSpineMarks}
                        readingDirection={readingDirection}
                        rowOffsetType={rowOffsetType}
                        alternateRotationType={alternateRotationType}
                    />
                )}
            </div>
          </div>
        )}

        {activeTab === 'proofing' && (
          <ProofingTool />
        )}

        {activeTab === 'calculator' && (
          <BookSpineCalculator />
        )}

        {activeTab === 'boxLabel' && (
            <BoxLabelPrinter 
                jobInfo={jobInfo}
                companyName={companyNameForLabel}
                onCompanyNameChange={setCompanyNameForLabel}
            />
        )}
      </main>
    </div>
  );
};

export default App;
