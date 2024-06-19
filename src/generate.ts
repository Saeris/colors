import Color from "colorjs.io";
import * as colors from "./colors";

const blendAlpha = (
  foreground: number,
  alpha: number,
  background: number,
  round = true
): number => {
  if (round) {
    return (
      Math.round(background * (1 - alpha)) + Math.round(foreground * alpha)
    );
  }

  return background * (1 - alpha) + foreground * alpha;
};

const getAlphaColor = (
  targetRgb: number[],
  backgroundRgb: number[],
  rgbPrecision: number,
  alphaPrecision: number,
  targetAlpha?: number
): readonly [number, number, number, number] => {
  const [tr, tg, tb] = targetRgb.map((c) => Math.round(c * rgbPrecision));
  const [br, bg, bb] = backgroundRgb.map((c) => Math.round(c * rgbPrecision));

  if (
    typeof tr === `undefined` ||
    typeof tg === `undefined` ||
    typeof tb === `undefined` ||
    typeof br === `undefined` ||
    typeof bg === `undefined` ||
    typeof bb === `undefined`
  ) {
    throw Error(`Color is undefined`);
  }

  // Is the background color lighter, RGB-wise, than target color?
  // Decide whether we want to add as little color or as much color as possible,
  // darkening or lightening the background respectively.
  // If at least one of the bits of the target RGB value
  // is lighter than the background, we want to lighten it.
  let desiredRgb = 0;
  if (tr > br) {
    desiredRgb = rgbPrecision;
  } else if (tg > bg) {
    desiredRgb = rgbPrecision;
  } else if (tb > bb) {
    desiredRgb = rgbPrecision;
  }

  const alphaR = (tr - br) / (desiredRgb - br);
  const alphaG = (tg - bg) / (desiredRgb - bg);
  const alphaB = (tb - bb) / (desiredRgb - bb);

  const isPureGray = [alphaR, alphaG, alphaB].every(
    (alpha) => alpha === alphaR
  );

  // No need for precision gymnastics with pure grays, and we can get cleaner output
  if (!targetAlpha && isPureGray) {
    // Convert back to 0-1 values
    const V = desiredRgb / rgbPrecision;
    return [V, V, V, alphaR] as const;
  }

  const clampRgb = (n: number): number =>
    isNaN(n) ? 0 : Math.min(rgbPrecision, Math.max(0, n));
  const clampA = (n: number): number =>
    isNaN(n) ? 0 : Math.min(alphaPrecision, Math.max(0, n));
  const maxAlpha = targetAlpha ?? Math.max(alphaR, alphaG, alphaB);

  const A = clampA(Math.ceil(maxAlpha * alphaPrecision)) / alphaPrecision;
  let R = clampRgb(((br * (1 - A) - tr) / A) * -1);
  let G = clampRgb(((bg * (1 - A) - tg) / A) * -1);
  let B = clampRgb(((bb * (1 - A) - tb) / A) * -1);

  R = Math.ceil(R);
  G = Math.ceil(G);
  B = Math.ceil(B);

  const blendedR = blendAlpha(R, A, br);
  const blendedG = blendAlpha(G, A, bg);
  const blendedB = blendAlpha(B, A, bb);

  // Correct for rounding errors in light mode
  if (desiredRgb === 0) {
    if (tr <= br && tr !== blendedR) {
      R = tr > blendedR ? R + 1 : R - 1;
    }

    if (tg <= bg && tg !== blendedG) {
      G = tg > blendedG ? G + 1 : G - 1;
    }

    if (tb <= bb && tb !== blendedB) {
      B = tb > blendedB ? B + 1 : B - 1;
    }
  }

  // Correct for rounding errors in dark mode
  if (desiredRgb === rgbPrecision) {
    if (tr >= br && tr !== blendedR) {
      R = tr > blendedR ? R + 1 : R - 1;
    }

    if (tg >= bg && tg !== blendedG) {
      G = tg > blendedG ? G + 1 : G - 1;
    }

    if (tb >= bb && tb !== blendedB) {
      B = tb > blendedB ? B + 1 : B - 1;
    }
  }

  // Convert back to 0-1 values
  R /= rgbPrecision;
  G /= rgbPrecision;
  B /= rgbPrecision;

  return [R, G, B, A] as const;
};

export const getAlphaColorP3 = (
  targetColor: string,
  backgroundColor: string,
  targetAlpha?: number
): Color => {
  const [r, g, b, a] = getAlphaColor(
    new Color(targetColor).to(`p3`).coords,
    new Color(backgroundColor).to(`p3`).coords,
    // Not sure why, but the resulting P3 alpha colors are blended in the browser most precisely when
    // rounded to 255 integers too. Is the browser using 0-255 rather than 0-1 under the hood for P3 too?
    255,
    1000,
    targetAlpha
  );

  return new Color(`p3`, [r, g, b], a);
};

export const generate = (out: string): Array<[file: string, css: string]> => {
  const toCssVar = (c: string, k: string, v: string): string =>
    `--${c}-${k}: ${v};`;
  const mapColors =
    (hash: Record<string, string>) =>
    (fn: (key: string, value: string) => string): string =>
      Object.entries(hash)
        .map(([key, value]) => fn(key, value))
        .join(``);
  const p3 = (clrs: string): string =>
    `@supports (color: color(display-p3 1 1 1)) {@media (color-gamut: p3) {${clrs}}}`;
  const oklch = (c: string, bg: string): string =>
    getAlphaColorP3(c, bg)
      .to(`oklch`)
      .toString({ precision: 4 })
      .replace(`none`, `89.88`);

  return Object.entries(colors).reduce((results, [color, modes]) => {
    const mapLight = mapColors(modes.light);
    const mapDark = mapColors(modes.dark);
    const css = `:root {
            ${mapLight((key, value) => toCssVar(color, key, value))}
            
            ${mapLight((key, value) =>
              toCssVar(color, `a${key}`, oklch(value, `#ffffff`))
            )}
            
            ${p3(
              mapLight((key, value) =>
                toCssVar(
                  color,
                  `a${key}`,
                  getAlphaColorP3(value, `#ffffff`).toString({ precision: 4 })
                )
              )
            )}
            
            &.dark{
                ${mapDark((key, value) => toCssVar(color, key, value))}
                
                ${mapDark((key, value) =>
                  toCssVar(color, `a${key}`, oklch(value, `#111111`))
                )}
                
                ${p3(
                  mapDark((key, value) =>
                    toCssVar(
                      color,
                      `a${key}`,
                      getAlphaColorP3(value, `#111111`).toString({
                        precision: 4
                      })
                    )
                  )
                )}
            }
        }`;
    results.push([`${out}/${color}.css`, css]);
    return results;
  }, []);
};
