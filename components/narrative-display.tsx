interface NarrativeDisplayProps {
  text: string
}

/**
 * Supporting line beneath the gauge. Source Serif, charcoal, editorial
 * register. Not hero-sized — it's a subtitle for the score, not a headline.
 */
export function NarrativeDisplay({ text }: NarrativeDisplayProps) {
  return (
    <p className="font-serif text-lg md:text-xl leading-snug text-foreground/80 max-w-md">
      {text}
    </p>
  )
}
