// Shared motion tokens + variants (see ANIMATIONS.md).
// Centralised so timing/easing stay consistent across the app.

import type { TargetAndTransition, Transition, Variants } from 'framer-motion'

type Bezier = [number, number, number, number]

export const ease: Record<'out' | 'in' | 'spring' | 'standard', Bezier> = {
  out: [0.16, 1, 0.3, 1], // entrances — fast in, gentle settle
  in: [0.4, 0, 1, 1], // exits — accelerate away
  spring: [0.34, 1.56, 0.64, 1], // playful overshoot
  standard: [0.4, 0, 0.2, 1], // neutral tween
}

export const dur = {
  fast: 0.12,
  base: 0.2,
  moderate: 0.3,
  slow: 0.45,
} as const

// Card resize between phases (form ↔ submitting ↔ result).
export const layoutTransition: Transition = {
  duration: dur.moderate,
  ease: ease.standard,
}

// Phase swap content.
export const phaseVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: dur.moderate, ease: ease.out } },
  exit: { opacity: 0, y: -6, scale: 0.99, transition: { duration: dur.base, ease: ease.in } },
}

// Collapsibles in normal flow: field errors, file rows.
export const collapseVariants: Variants = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto', transition: { duration: dur.base, ease: ease.out } },
  exit: { opacity: 0, height: 0, transition: { duration: dur.fast, ease: ease.in } },
}

// Hint popover.
export const popoverVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: dur.base, ease: ease.out } },
  exit: { opacity: 0, scale: 0.97, y: 2, transition: { duration: dur.fast, ease: ease.in } },
}

// Result card: pop in + stagger its children.
export const resultCardVariants: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: dur.moderate,
      ease: ease.spring,
      staggerChildren: 0.06,
      delayChildren: 0.08,
    },
  },
}

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: dur.base, ease: ease.out } },
}

// Celebratory emoji pop.
export const emojiPop: Variants = {
  initial: { opacity: 0, scale: 0 },
  animate: {
    opacity: 1,
    scale: [0, 1.15, 1],
    transition: { duration: dur.slow, ease: ease.spring, times: [0, 0.6, 1] },
  },
}

// Submit button feedback.
export const buttonMotion = {
  whileHover: { y: -1 },
  whileTap: { scale: 0.97 },
  transition: { duration: dur.fast, ease: ease.standard },
} as const

// Shake a field on failed submit (x keyframes; auto-skipped under reduced motion).
export const shakeKeyframes: TargetAndTransition = {
  x: [0, -4, 4, -3, 3, 0],
  transition: { duration: 0.35, ease: ease.standard },
}
