import React from 'react';
import { Check } from 'lucide-react';

interface StepperProps {
  currentStep: number;
  steps: { id: number; title: string; desc?: string }[];
  onSelectStep?: (stepId: number) => void;
  maxAccessibleStep: number;
}

export const BulkUpdateStepper: React.FC<StepperProps> = ({
  currentStep,
  steps,
  onSelectStep,
  maxAccessibleStep,
}) => {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm mb-6">
      <nav aria-label="Progress">
        <ol className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {steps.map((step) => {
            const isCompleted = step.id < currentStep;
            const isCurrent = step.id === currentStep;
            const isClickable = step.id <= maxAccessibleStep;

            return (
              <li key={step.id} className="relative">
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => isClickable && onSelectStep && onSelectStep(step.id)}
                  className={`w-full flex items-center space-x-2.5 p-2 rounded-lg text-left transition-all ${
                    isCurrent
                      ? 'bg-blue-50 border border-blue-200 text-[#1E3A8A] font-semibold'
                      : isCompleted
                      ? 'text-emerald-700 hover:bg-gray-50'
                      : isClickable
                      ? 'text-gray-700 hover:bg-gray-50'
                      : 'text-gray-400 cursor-not-allowed opacity-60'
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      isCurrent
                        ? 'bg-[#1E3A8A] text-white shadow-sm'
                        : isCompleted
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {isCompleted ? <Check className="w-4 h-4" /> : step.id}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{step.title}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
};
