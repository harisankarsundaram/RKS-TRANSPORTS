import React from 'react';
import { Link } from 'react-router-dom';
import './Button.css';

/**
 * Reusable Button component
 * @param {string} variant - 'primary', 'secondary', 'accent', 'outline', 'ghost'
 * @param {string} size - 'sm', 'md', 'lg', 'block'
 * @param {string} to - Optional: render as React Router Link
 * @param {string} href - Optional: render as native anchor
 * @param {boolean} disabled
 * @param {boolean} isLoading
 * @param {React.ReactNode} leftIcon
 * @param {React.ReactNode} rightIcon
 */
const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  to,
  href,
  disabled,
  isLoading,
  leftIcon,
  rightIcon,
  ...props
}) => {
  const baseClass = `btn btn-${variant} btn-${size} ${isLoading ? 'btn-loading' : ''} ${className}`;

  const content = (
    <>
      {isLoading && <span className="btn-spinner"></span>}
      {!isLoading && leftIcon && <span className="btn-icon-left">{leftIcon}</span>}
      <span className="btn-text">{children}</span>
      {!isLoading && rightIcon && <span className="btn-icon-right">{rightIcon}</span>}
    </>
  );

  if (to && !disabled) {
    return (
      <Link to={to} className={baseClass} {...props}>
        {content}
      </Link>
    );
  }

  if (href && !disabled) {
    return (
      <a href={href} className={baseClass} {...props}>
        {content}
      </a>
    );
  }

  return (
    <button
      className={baseClass}
      disabled={disabled || isLoading}
      {...props}
    >
      {content}
    </button>
  );
};

export default Button;
