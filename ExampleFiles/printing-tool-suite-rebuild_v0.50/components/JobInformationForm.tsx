import React from 'react';
import { JobInfoState, PrintColorType, PaperQuickType, FinishType, BindingType } from '../types';
import { TextField } from './TextField';
import { NumberField } from './NumberField';
import { SelectField } from './SelectField';
import { 
    PRINT_COLOR_OPTIONS, INTERIOR_PAPER_QUICK_OPTIONS, 
    COVER_PAPER_QUICK_OPTIONS, FINISH_TYPE_OPTIONS, BINDING_TYPE_OPTIONS
} from '../constants';

interface JobInformationFormProps {
  jobInfo: JobInfoState;
  onJobInfoChange: <K extends keyof JobInfoState>(key: K, value: JobInfoState[K]) => void;
  disabled?: boolean;
}

export const JobInformationForm: React.FC<JobInformationFormProps> = ({ jobInfo, onJobInfoChange, disabled }) => {
  
  const handleChange = (key: keyof JobInfoState, value: any) => {
    onJobInfoChange(key, value);
  };

  return (
    <div className="space-y-6 pt-4">
      {/* General Information */}
      <section className="space-y-4">
        <h4 className="text-md font-semibold text-gray-700 border-b pb-1">General</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
          <TextField id="jobIdName" label="Job ID / Name" value={jobInfo.jobIdName} onChange={(val) => handleChange('jobIdName', val)} disabled={disabled} placeholder="e.g., Project X, Order 12345"/>
          <TextField id="customerName" label="Customer" value={jobInfo.customerName} onChange={(val) => handleChange('customerName', val)} disabled={disabled} placeholder="Customer company or name"/>
          <TextField id="contactInfo" label="Contact (Email/Phone)" value={jobInfo.contactInfo} onChange={(val) => handleChange('contactInfo', val)} disabled={disabled} placeholder="john.doe@example.com / 555-1234"/>
          <TextField id="fileNameTitle" label="File Name Title (for slug)" value={jobInfo.fileNameTitle || (disabled ? 'Using PDF name' : '')} onChange={(val) => handleChange('fileNameTitle', val)} disabled={disabled} placeholder="Defaults to uploaded PDF name if empty"/>
          <TextField id="quantity" label="Quantity" value={jobInfo.quantity} onChange={(val) => handleChange('quantity', val)} disabled={disabled} placeholder="e.g., 500"/>
          <TextField id="dueDate" label="Due Date" type="date" value={jobInfo.dueDate} onChange={(val) => handleChange('dueDate', val)} disabled={disabled} placeholder="MM/DD/YY"/>
        </div>
      </section>

      {/* Specifications */}
      <section className="space-y-4">
        <h4 className="text-md font-semibold text-gray-700 border-b pb-1">Specifications</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
          <TextField id="finalTrimWidth" label="Final Trim Width" value={jobInfo.finalTrimWidth} onChange={(val) => handleChange('finalTrimWidth', val)} disabled={disabled} placeholder="e.g., 6 (inches)" />
          <TextField id="finalTrimHeight" label="Final Trim Height" value={jobInfo.finalTrimHeight} onChange={(val) => handleChange('finalTrimHeight', val)} disabled={disabled} placeholder="e.g., 9 (inches)" />
        </div>
      </section>

      {/* Interior Specs */}
      <section className="space-y-4">
        <h4 className="text-md font-semibold text-gray-700 border-b pb-1">Interior</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4">
          <SelectField id="interiorPrintType" label="Interior Print" value={jobInfo.interiorPrintType} options={PRINT_COLOR_OPTIONS} onChange={(val) => handleChange('interiorPrintType', val as PrintColorType)} disabled={disabled} />
          <SelectField id="interiorPaperQuick" label="Paper Type (Quick)" value={jobInfo.interiorPaperQuick} options={INTERIOR_PAPER_QUICK_OPTIONS} onChange={(val) => handleChange('interiorPaperQuick', val as PaperQuickType)} disabled={disabled} />
          <TextField id="interiorPaperWeight" label="Paper Weight (Approx. lb/gsm)" value={jobInfo.interiorPaperWeight} onChange={(val) => handleChange('interiorPaperWeight', val)} disabled={disabled} placeholder="e.g., 60lb / 90gsm"/>
        </div>
      </section>

      {/* Cover Specs */}
      <section className="space-y-4">
        <h4 className="text-md font-semibold text-gray-700 border-b pb-1">Cover</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4">
          <SelectField id="coverPrintType" label="Cover Print" value={jobInfo.coverPrintType} options={PRINT_COLOR_OPTIONS} onChange={(val) => handleChange('coverPrintType', val as PrintColorType)} disabled={disabled} />
          <SelectField id="coverPaperQuick" label="Paper Type (Quick)" value={jobInfo.coverPaperQuick} options={COVER_PAPER_QUICK_OPTIONS} onChange={(val) => handleChange('coverPaperQuick', val as PaperQuickType)} disabled={disabled} />
          <TextField id="coverPaperWeight" label="Cover Weight (Approx. lb/gsm)" value={jobInfo.coverPaperWeight} onChange={(val) => handleChange('coverPaperWeight', val)} disabled={disabled} placeholder="e.g., 100lb / 270gsm"/>
        </div>
      </section>

      {/* Finishing & Binding */}
      <section className="space-y-4">
        <h4 className="text-md font-semibold text-gray-700 border-b pb-1">Finishing & Binding</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
          <SelectField id="finishType" label="Finish" value={jobInfo.finishType} options={FINISH_TYPE_OPTIONS} onChange={(val) => handleChange('finishType', val as FinishType)} disabled={disabled} />
          <SelectField id="bindingType" label="Binding" value={jobInfo.bindingType} options={BINDING_TYPE_OPTIONS} onChange={(val) => handleChange('bindingType', val as BindingType)} disabled={disabled} />
        </div>
      </section>

      {/* Urgent Notes */}
      <section>
        <h4 className="text-md font-semibold text-gray-700 border-b pb-1">Notes</h4>
        <TextField 
            id="urgentNotes" 
            label="Urgent Notes / Flags" 
            value={jobInfo.urgentNotes} 
            onChange={(val) => handleChange('urgentNotes', val)} 
            disabled={disabled} 
            isTextArea={true} 
            rows={3}
            placeholder="e.g., RUSH, Match Sample Attached, Special Instructions..."
        />
      </section>
    </div>
  );
};