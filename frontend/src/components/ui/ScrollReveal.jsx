import { useState, useEffect, useRef } from 'react';
import './ScrollReveal.css';

const ScrollReveal = ({ children, className = '', threshold = 0.1, animation = 'fade-up' }) => {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    // Once visible, we don't need to observe anymore if we want it to stay visible
                    if (ref.current) observer.unobserve(ref.current);
                }
            },
            {
                threshold: threshold,
                rootMargin: '0px 0px -50px 0px' // Slightly offset to trigger before bottom
            }
        );

        if (ref.current) {
            observer.observe(ref.current);
        }

        return () => {
            if (ref.current) {
                observer.unobserve(ref.current);
            }
        };
    }, [threshold]);

    return (
        <div
            ref={ref}
            className={`scroll-reveal ${animation} ${isVisible ? 'is-visible' : ''} ${className}`}
        >
            {children}
        </div>
    );
};

export default ScrollReveal;
