import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

const toastTypes = {
  success: {
    icon: CheckCircleIcon,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    iconColor: 'text-green-600',
    textColor: 'text-green-800'
  },
  error: {
    icon: XCircleIcon,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    iconColor: 'text-red-600',
    textColor: 'text-red-800'
  },
  warning: {
    icon: ExclamationTriangleIcon,
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    iconColor: 'text-yellow-600',
    textColor: 'text-yellow-800'
  },
  info: {
    icon: InformationCircleIcon,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconColor: 'text-blue-600',
    textColor: 'text-blue-800'
  }
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const toast = {
    success: (message, duration) => addToast(message, 'success', duration),
    error: (message, duration) => addToast(message, 'error', duration),
    warning: (message, duration) => addToast(message, 'warning', duration),
    info: (message, duration) => addToast(message, 'info', duration)
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
        {toasts.map(({ id, message, type }) => {
          const config = toastTypes[type];
          const Icon = config.icon;
          
          return (
            <div
              key={id}
              className={`${config.bgColor} ${config.borderColor} border-l-4 rounded-lg shadow-lg p-4 flex items-start gap-3 animate-slide-in`}
            >
              <Icon className={`${config.iconColor} w-5 h-5 flex-shrink-0 mt-0.5`} />
              <p className={`${config.textColor} text-sm font-medium flex-1`}>
                {message}
              </p>
              <button
                onClick={() => removeToast(id)}
                className={`${config.textColor} hover:opacity-70 transition-opacity`}
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// CSS için tailwind config'e eklenecek animation
// tailwind.config.js içinde:
// animation: {
//   'slide-in': 'slideIn 0.3s ease-out'
// },
// keyframes: {
//   slideIn: {
//     '0%': { transform: 'translateX(100%)', opacity: '0' },
//     '100%': { transform: 'translateX(0)', opacity: '1' }
//   }
// }
