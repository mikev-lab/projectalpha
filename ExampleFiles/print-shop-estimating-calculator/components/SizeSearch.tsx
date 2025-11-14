import React, { useState, useMemo, useRef, useEffect } from 'react';
import { commonTrimSizes, TrimSize } from '../constants/trimSizes';

interface SizeSearchProps {
  value: string; // The name of the currently selected size, e.g., "Letter" or "Custom Size"
  onSizeSelect: (size: TrimSize | null) => void;
}

const SizeSearch: React.FC<SizeSearchProps> = ({ value, onSizeSelect }) => {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedSize = useMemo(() => commonTrimSizes.find(s => s.name === value), [value]);

    const filteredSizes = useMemo(() => {
        if (!query) return [];
        const lowerCaseQuery = query.toLowerCase().trim();
        if (!lowerCaseQuery) return [];

        return commonTrimSizes.filter(s =>
            s.group !== 'Custom' && (
                s.name.toLowerCase().includes(lowerCaseQuery) ||
                s.group.toLowerCase().includes(lowerCaseQuery) ||
                `${s.width}" x ${s.height}"`.includes(lowerCaseQuery)
            )
        ).slice(0, 10);
    }, [query]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (size: TrimSize) => {
        onSizeSelect(size);
        setQuery('');
        setIsOpen(false);
    };

    const handleClearOrFocus = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSizeSelect(commonTrimSizes.find(s => s.group === 'Custom')!); // Revert to custom
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    if (selectedSize && selectedSize.group !== 'Custom') {
        return (
            <div className="input-field flex items-center justify-between" onClick={handleClearOrFocus}>
                <span className="text-sm truncate pr-2" title={`${selectedSize.name} (${selectedSize.width}" x ${selectedSize.height}")`}>
                    {selectedSize.name} ({selectedSize.width}" x {selectedSize.height}")
                </span>
                <button
                    type="button"
                    className="flex-shrink-0 text-gray-400 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 rounded-full w-5 h-5 flex items-center justify-center bg-gray-200 dark:bg-slate-600"
                    aria-label="Clear size selection and use custom dimensions"
                >
                    &times;
                </button>
            </div>
        );
    }
    
    return (
        <div className="relative" ref={wrapperRef}>
            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsOpen(true)}
                placeholder="Search common sizes..."
                className="input-field"
                aria-autocomplete="list"
                aria-expanded={isOpen && filteredSizes.length > 0}
            />
            {isOpen && filteredSizes.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredSizes.map(size => (
                        <li key={size.name}>
                            <button
                                type="button"
                                onClick={() => handleSelect(size)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-600"
                                role="option"
                                aria-selected="false"
                            >
                                {size.name}
                                <span className="block text-xs text-gray-500 dark:text-gray-400">{size.group} / {size.width}" x {size.height}"</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SizeSearch;
