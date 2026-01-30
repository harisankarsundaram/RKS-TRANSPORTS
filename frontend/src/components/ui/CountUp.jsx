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
            let start = 0
            // if end is very large, step accordingly?
            // For simple linear easing:
            const stepTime = Math.abs(Math.floor(duration / end))

            // If end is small (like 24 or 60), simple interval works.
            // If it's large, we might need a better logic, but for 60/40 it's fine.
            // Better approach: use requestAnimationFrame or calculation based on time

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
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIntersecting(true)
                }
            },
            { threshold: 0.1 }
        )

        if (ref.current) {
            observer.observe(ref.current)
        }

        return () => {
            if (ref.current) {
                observer.unobserve(ref.current)
            }
        }
    }, [ref])

    return isIntersecting
}

export default CountUp
