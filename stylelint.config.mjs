/**
 * Stylelint enforces AGENTS.md section 11: a component may not declare a raw
 * color, radius, shadow or motion value. The token files are the only place
 * where literal values are legal.
 *
 * Four built-in rules, each with one job:
 *   - color-no-hex                     catches #fff, #6B0F26, #00000080
 *   - function-disallowed-list         catches rgb(), rgba(), hsl(), hsla()
 *   - declaration-property-value-      forces var(--…) on single-value color,
 *     allowed-list                     radius and shadow properties
 *   - declaration-property-value-      catches raw durations and easings inside
 *     disallowed-list                  animation/transition shorthands, which
 *                                      the allowed-list cannot police
 *
 * Shorthands such as `border`, `font` and `animation` legitimately mix a token
 * with keywords, so they are covered by the hex/rgb bans and the duration ban
 * instead of an allowed-list.
 *
 * Note: stylelint-declaration-strict-value was the original plan, but plugin
 * 1.13 cannot register its rule name under stylelint 18. These built-ins give
 * the same guarantee without a plugin that breaks on upgrade.
 */
export default {
  customSyntax: 'postcss-scss',
  rules: {
    'color-no-hex': true,
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla'],

    'declaration-property-value-allowed-list': {
      color: ['/^var\\(--/', 'inherit', 'currentColor'],
      background: ['/^var\\(--/'],
      'background-color': ['/^var\\(--/'],
      'border-color': ['/^var\\(--/'],
      'box-shadow': ['/^var\\(--/'],
      'border-radius': ['/^var\\(--/'],
    },

    'declaration-property-value-disallowed-list': {
      '/^animation/': ['/\\b\\d+(\\.\\d+)?m?s\\b/'],
      '/^transition/': ['/\\b\\d+(\\.\\d+)?m?s\\b/'],
    },
  },
  overrides: [
    {
      files: ['src/styles/tokens/**/*.scss'],
      rules: {
        // The token layer is the one place raw values are legal by design.
        'color-no-hex': null,
        'function-disallowed-list': null,
        'declaration-property-value-allowed-list': null,
        'declaration-property-value-disallowed-list': null,
      },
    },
  ],
};
