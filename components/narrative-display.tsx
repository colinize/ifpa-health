interface NarrativeDisplayProps {
  text: string
}

export function NarrativeDisplay({ text }: NarrativeDisplayProps) {
  return (
    <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto">
      {text}
    </p>
  )
}
