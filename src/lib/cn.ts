/**
 * Concatenador de clases. Se prefiere esto a `clsx` para no sumar una
 * dependencia por 8 lineas de codigo.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
