
import React from 'react';
import { Icon } from './Icon'; // Assuming Icon component can render a spinner

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success';
type IconName = 'upload' | 'download' | 'settings' | 'spinner' | 'alertTriangle';


interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  isLoading = false,
  icon,
  iconPosition = 'left',
  className = '',
  ...props
}) => {
  const baseStyle = "inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  
  let variantStyle = '';
  switch (variant) {
    case 'primary':
      variantStyle = 'text-white bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500';
      break;
    case 'secondary':
      variantStyle = 'text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:ring-indigo-500';
      break;
    case 'danger':
      variantStyle = 'text-white bg-red-600 hover:bg-red-700 focus:ring-red-500';
      break;
    case 'success':
        variantStyle = 'text-white bg-green-600 hover:bg-green-700 focus:ring-green-500';
        break;
  }

  const renderIcon = (isSpinner = false) => {
    const iconName = isSpinner ? 'spinner' : icon;
    if (!iconName) return null;
    
    const iconClasses = `w-4 h-4 ${iconPosition === 'left' ? 'mr-2 -ml-1' : 'ml-2 -mr-1'}`;
    return <Icon iconName={iconName} className={iconClasses} />;
  };

  return (
    <button
      type="button"
      className={`${baseStyle} ${variantStyle} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && iconPosition === 'left' && renderIcon(true)}
      {!isLoading && icon && iconPosition === 'left' && renderIcon()}
      {children}
      {isLoading && iconPosition === 'right' && renderIcon(true)}
      {!isLoading && icon && iconPosition === 'right' && renderIcon()}
    </button>
  );
};
