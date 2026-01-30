import React from 'react';
import './Card.css';

const Card = ({ children, className = '', padding = 'md', hover = false, ...props }) => {
    return (
        <div
            className={`card card-padding-${padding} ${hover ? 'card-hover' : ''} ${className}`}
            {...props}
        >
            {children}
        </div>
    );
};

export const CardHeader = ({ children, className = '', ...props }) => (
    <div className={`card-header ${className}`} {...props}>{children}</div>
);

export const CardBody = ({ children, className = '', ...props }) => (
    <div className={`card-body ${className}`} {...props}>{children}</div>
);

export const CardFooter = ({ children, className = '', ...props }) => (
    <div className={`card-footer ${className}`} {...props}>{children}</div>
);

export default Card;
