import { useState, useEffect, useRef } from 'react'

/**
 * Animates a number from 0 to the target value
 * @param {number} end - The target number
 * @param {number} duration - Animation duration in ms
 * @param {string} suffix - Optional string to append (e.g., "+")
 * @param {string} prefix - Optional string to prepend
 */
const CountUp = ({ end, duration = 2000, suffix = '', prefix = '' }) => {
    const [count, setCount] = useState(0)
    const countRef = useRef(null)
    const isVisible = useOnScreen(countRef)
    const hasAnimated = useRef(false)

    useEffect(() => {
        if (isVisible && !hasAnimated.current) {
            hasAnimated.current = true
            const startTime = Date.now()

            const timer = setInterval(() => {
                const timePassed = Date.now() - startTime
                let progress = timePassed / duration

                if (progress > 1) progress = 1

                // Easing function (easeOutQuad)
                const easeOutProgress = 1 - (1 - progress) * (1 - progress)

                const currentCount = Math.floor(easeOutProgress * end)
                setCount(currentCount)

                if (progress === 1) {
                    clearInterval(timer)
                }
            }, 16) // ~60fps

            return () => clearInterval(timer)
        }
    }, [end, duration, isVisible])

    return (
        <span ref={countRef}>
            {prefix}{count}{suffix}
        </span>
    )
}

// Hook to check if element is in viewport
function useOnScreen(ref) {
    const [isIntersecting, setIntersecting] = useState(false)

    useEffect(() => {
        const element = ref.current
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIntersecting(true)
                }
            },
            { threshold: 0.1 }
        )

        if (element) {
            observer.observe(element)
        }

        return () => {
            if (element) {
                observer.unobserve(element)
            }
        }
    }, [ref])

    return isIntersecting
}

export default CountUp
