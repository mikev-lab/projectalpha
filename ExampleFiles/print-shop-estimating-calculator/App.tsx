
import React from 'react';
import Calculator from './components/Calculator';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900 text-gray-900 dark:text-gray-100 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600 mb-2">
            Print Shop Estimator
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Instantly calculate costs for your print jobs.
          </p>
        </header>
        <main>
          <Calculator />
        </main>
        <footer className="text-center mt-12 text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} Print Shop Estimator. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
