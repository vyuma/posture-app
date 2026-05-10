import type {
  CharacterDefinition,
  CharacterExpression,
} from "../../../characters/types";
import { getCharacterImageSrc } from "../../../characters/characterCatalog";

type CharacterFigureProps = {
  character: CharacterDefinition | null;
  className: string;
  expression?: CharacterExpression;
};

export function CharacterFigure({
  character,
  className,
  expression,
}: CharacterFigureProps) {
  if (!character) {
    return <div className={`${className} character-empty`} aria-hidden="true" />;
  }

  return (
    <img
      className={`${className} character-figure ${character.toneClass ?? ""}`}
      src={getCharacterImageSrc(character, expression)}
      alt=""
      draggable={false}
    />
  );
}
