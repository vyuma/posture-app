import grades from "./characterGrades.json";

// Visual grades are explicit metadata. Legacy common/rare/epic wire values do
// not encode the new five-star design, and character numbers are not thresholds.
export function getCharacterGrade(characterId: string) {
  const stars = (grades.characters as Record<string, number>)[characterId];
  return grades.tiers.find(tier => tier.stars === stars);
}

export function CharacterStars({ characterId }: { characterId: string }) {
  const grade = getCharacterGrade(characterId);
  if (!grade) return null;
  return <span className="character-stars" role="img" aria-label={`${grade.label}、${grade.stars} / 5つ星`}>
    {grades.tiers.map(({ stars }) => <svg key={stars} viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill={stars <= grade.stars ? "#F78000" : "#EAEAEA"}>
      <path d="M10 0L12.2451 6.90983H19.5106L13.6327 11.1803L15.8779 18.0902L10 13.8197L4.12215 18.0902L6.36729 11.1803L0.489435 6.90983H7.75486L10 0Z" />
    </svg>)}
  </span>;
}
