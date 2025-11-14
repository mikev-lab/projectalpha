import React, { useState, useMemo, useRef, useEffect } from 'react';
import { paperData } from '../constants/paperData';
import { PaperStock } from '../types';

interface PaperSearchProps {
  name: string;
  value: string | null;
  onPaperSelect: (name: string, sku: string | null) => void;
}

const PaperSearch: React.FC<PaperSearchProps> = ({ name, value, onPaperSelect }) => {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedPaper = useMemo(() => paperData.find(p => p.sku === value), [value]);

    const filteredPapers = useMemo(() => {
        if (!query) return [];
        const lowerCaseQuery = query.toLowerCase().trim();
        if (!lowerCaseQuery) return [];

        return paperData.filter(p =>
            p.name.toLowerCase().includes(lowerCaseQuery) ||
            p.finish.toLowerCase().includes(lowerCaseQuery) ||
            p.type.toLowerCase().includes(lowerCaseQuery) ||
            p.gsm.toString().includes(lowerCaseQuery)
        ).slice(0, 10); // Limit results for performance
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

    const handleSelectPaper = (paper: PaperStock) => {
        onPaperSelect(name, paper.sku);
        setQuery('');
        setIsOpen(false);
    };

    const handleClearSelection = (e: React.MouseEvent) => {
        e.stopPropagation();
        onPaperSelect(name, null);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    if (selectedPaper) {
        return (
            <div className="input-field flex items-center justify-between">
                <span className="text-sm truncate pr-2" title={selectedPaper.name}>{selectedPaper.name}</span>
                <button
                    type="button"
                    onClick={handleClearSelection}
                    className="flex-shrink-0 text-gray-400 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 rounded-full w-5 h-5 flex items-center justify-center bg-gray-200 dark:bg-slate-600"
                    aria-label="Clear paper selection"
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
                placeholder="Search by name, finish, gsm..."
                className="input-field"
                aria-autocomplete="list"
                aria-expanded={isOpen && filteredPapers.length > 0}
            />
            {isOpen && filteredPapers.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredPapers.map(paper => (
                        <li key={paper.sku}>
                            <button
                                type="button"
                                onClick={() => handleSelectPaper(paper)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-600"
                                role="option"
                                aria-selected="false"
                            >
                                {paper.name}
                                <span className="block text-xs text-gray-500 dark:text-gray-400">{paper.type} / {paper.finish} / {paper.gsm}gsm</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default PaperSearch;
