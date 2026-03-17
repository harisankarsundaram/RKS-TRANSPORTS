import { useState, useEffect, useRef } from 'react';
import './ScrollReveal.css';

const ScrollReveal = ({ children, className = '', threshold = 0.1, animation = 'fade-up' }) => {
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const element = ref.current;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    // Once visible, we don't need to observe anymore if we want it to stay visible
                    if (element) observer.unobserve(element);
                }
            },
            {
                threshold: threshold,
                rootMargin: '0px 0px -50px 0px' // Slightly offset to trigger before bottom
            }
        );

        if (element) {
            observer.observe(element);
        }

        return () => {
            if (element) {
                observer.unobserve(element);
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
