function hashSeed(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return hash;
}

export function buildGradientBanner(seed: string, index = 0): string {
    const hash = hashSeed(`${seed}:${index}`);
    const angle = 20 + (hash % 160);

    const hueA = hash % 360;
    const hueB = (hueA + 45 + ((hash >> 4) % 75)) % 360;
    const hueC = (hueB + 55 + ((hash >> 9) % 85)) % 360;

    const satA = 72 + (hash % 18);
    const satB = 70 + ((hash >> 3) % 20);
    const satC = 74 + ((hash >> 6) % 16);

    const lightA = 56 + ((hash >> 2) % 10);
    const lightB = 48 + ((hash >> 5) % 12);
    const lightC = 60 + ((hash >> 8) % 8);

    return `linear-gradient(${angle}deg, hsl(${hueA} ${satA}% ${lightA}%) 0%, hsl(${hueB} ${satB}% ${lightB}%) 52%, hsl(${hueC} ${satC}% ${lightC}%) 100%)`;
}