function cleanMuscleName(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value)
    .trim()
    .replace(/^['"]+/, '')
    .replace(/^\[+/, '')
    .replace(/['"\]]+$/, '')
    .trim();
}

export function parseSecondaryMuscles(input: unknown): string[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.map(cleanMuscleName).filter(Boolean);
  }

  if (typeof input === 'string') {
    let value: unknown = input.trim();

    for (let index = 0; index < 2; index += 1) {
      if (typeof value !== 'string') break;
      const str = value.trim();
      if (!str) return [];

      try {
        value = JSON.parse(str);
        if (Array.isArray(value)) {
          return value.map(cleanMuscleName).filter(Boolean);
        }
      } catch {
        break;
      }
    }

    const str = cleanMuscleName(value);
    if (!str) return [];
    return str.split(',').map(cleanMuscleName).filter(Boolean);
  }

  return [];
}
