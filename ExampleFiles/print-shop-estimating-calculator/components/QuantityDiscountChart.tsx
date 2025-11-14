import React, { useEffect, useRef } from 'react';
import { ChartData } from '../types';

// Let TypeScript know that 'Chart' is available on the global scope from the CDN
declare const Chart: any;

interface ChartProps {
  chartData: ChartData | null;
}

export const QuantityDiscountChart: React.FC<ChartProps> = ({ chartData }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<any | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    // Destroy existing chart instance before drawing a new one or if data is cleared
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    if (!chartData) {
        return; // Exit if there's no data to render
    }

    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const textColor = isDarkMode ? '#cbd5e1' : '#475569';
    
    const datasets = [];
    const hasLaborData = chartData.labor && chartData.labor.some(val => val > 0);

    datasets.push({
      label: 'Expenses (Paper/Clicks)',
      data: chartData.expenses,
      backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.5)', // red-500
      order: 2,
    });

    if (hasLaborData) {
      datasets.push({
        label: 'Labor',
        data: chartData.labor,
        backgroundColor: isDarkMode ? 'rgba(234, 179, 8, 0.7)' : 'rgba(234, 179, 8, 0.5)', // yellow
        order: 2,
      });
    }

    datasets.push({
      label: hasLaborData ? 'Profit (Markup)' : "Owner's Profit",
      data: chartData.profit,
      backgroundColor: isDarkMode ? 'rgba(34, 197, 94, 0.7)' : 'rgba(34, 197, 94, 0.5)', // green
      order: 2,
    });
    
    datasets.push({
      type: 'line',
      label: 'Total Price Per Unit',
      data: chartData.totalPrice,
      borderColor: isDarkMode ? '#a78bfa' : '#8b5cf6', // violet-400 / violet-500
      backgroundColor: 'transparent',
      pointBackgroundColor: isDarkMode ? '#a78bfa' : '#8b5cf6',
      tension: 0.1,
      order: 1,
    });


    const chartConfig = {
      type: 'bar',
      data: {
        labels: chartData.labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Cost Breakdown Per Unit',
            color: textColor,
            font: { size: 16 }
          },
          legend: {
             position: 'bottom' as const,
             labels: {
                color: textColor
             }
          },
          tooltip: {
            mode: 'index' as const,
            intersect: false,
            callbacks: {
              label: function(context: any) {
                let label = context.dataset.label || '';
                if (label) {
                  label += ': ';
                }
                if (context.parsed.y !== null) {
                  label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                }
                return label;
              }
            }
          }
        },
        scales: {
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              color: textColor,
              callback: function(value: any) {
                return '$' + value.toFixed(2);
              }
            },
            grid: {
              color: gridColor,
            }
          },
          x: {
            stacked: true,
            ticks: {
              color: textColor,
            },
            grid: {
              color: gridColor,
            }
          }
        }
      }
    };
    
    chartInstanceRef.current = new Chart(ctx, chartConfig);

    return () => {
      if(chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [chartData]);

  if (!chartData) {
    return (
        <div className="flex items-center justify-center h-full text-center text-gray-500 dark:text-gray-400 p-4">
            <p>Enter a quantity to see discount pricing analysis.</p>
        </div>
    );
  }

  return (
    <div className="relative w-full h-full">
        <canvas ref={canvasRef}></canvas>
    </div>
  );
};