import { motion, useIsPresent } from 'motion/react'

export function Overlay({ className, onDismiss, children }: { className?: string; onDismiss: (event: React.MouseEvent<HTMLDivElement>) => void; children: React.ReactNode }): React.JSX.Element {
  const present = useIsPresent()
  return (
    <motion.div
      className={className ? `overlay ${className}` : 'overlay'}
      data-closing={present ? undefined : ''}
      inert={!present}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      onMouseDown={present ? onDismiss : undefined}
    >
      {children}
    </motion.div>
  )
}
