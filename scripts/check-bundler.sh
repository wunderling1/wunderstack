#!/usr/bin/env bash
#
# Bundler guard.
#
# The split is deliberate and asymmetric, which is exactly why it drifts:
#
#   next dev   -> Turbopack (the Next 16 default; NO --webpack flag)
#   next build -> webpack   (--webpack REQUIRED)
#
# Both bundlers work only because our workspace packages import relatively WITHOUT file
# extensions. Turbopack cannot remap a `.js` specifier onto a `.ts` file (vercel/next.js#82945)
# and Next 16.3.4 has no `resolveExtensionAlias` — TurbopackOptions offers only `resolveAlias`
# and `resolveExtensions`, neither of which remaps an extension. Put a `.js` suffix back on a
# relative import and `next dev` dies with "Module not found", app-wide. `tsconfig.base.json`
# is on `moduleResolution: "bundler"` for exactly this reason; do not move it to NodeNext.
#
# Build keeps `--webpack` deliberately: dev and build do not have to share a bundler, and we
# would rather change one variable at a time. The `webpack()` hook is now empty in four apps
# (runtime keeps one, for an unrelated Mastra warning).
#
# The failure mode this guards against: someone (usually a coding agent) sees the `--webpack`
# on the build script, or Next's "webpack is configured while Turbopack is not" warning, and
# "harmonises" dev onto webpack. That hides the real cause — which in September 2026 was the
# `.js` specifiers, not the bundler — and the diff disappears among unrelated work.
#
# Changing this policy means changing this script, .cursor/rules/100-stack.mdc and every
# next.config.mjs in the SAME pull request. Never as a drive-by fix for a failing dev server.
#
# bash 3.2 compatible (macOS default).

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

violations=""

for pkg in apps/*/package.json; do
  app="$(dirname "$pkg")"

  dev="$(node -p "require('./$pkg').scripts?.dev ?? ''")"
  build="$(node -p "require('./$pkg').scripts?.build ?? ''")"

  case "$dev" in
    *"next dev"*)
      case "$dev" in
        *--webpack*)
          violations="${violations}  - ${app}: dev runs webpack (\"${dev}\") — drop --webpack, dev is Turbopack"$'\n'
          ;;
      esac
      ;;
  esac

  case "$build" in
    *"next build"*)
      case "$build" in
        *--webpack*) ;;
        *)
          violations="${violations}  - ${app}: build is missing --webpack (\"${build}\") — build stays on webpack until we move it on purpose"$'\n'
          ;;
      esac
      ;;
  esac
done

# Second guard: the resolution precondition itself. A relative import that carries a `.js`
# suffix resolves under webpack and tsc, but not under Turbopack — so it passes review and
# breaks `next dev` for everyone. Catch it here, where the bundler policy already lives.
specifiers="$(
  grep -rEn "[\"'](\.\.?/[^\"']*)\.js[\"']" packages apps scripts \
    --include='*.ts' --include='*.tsx' --include='*.mts' 2>/dev/null \
    | grep -v node_modules | grep -v '/\.next/' | grep -v '/dist/' || true
)"

if [ -n "$specifiers" ]; then
  echo "check-bundler: relative imports with a .js suffix (Turbopack cannot resolve these):" >&2
  printf '%s\n' "$specifiers" >&2
  echo "" >&2
  echo "Drop the extension: './foo.js' -> './foo'. See .cursor/rules/100-stack.mdc -> 'Bundler'." >&2
  exit 1
fi

if [ -n "$violations" ]; then
  echo "check-bundler: bundler flags have drifted:" >&2
  printf '%s' "$violations" >&2
  echo "" >&2
  echo "Policy: 'next dev' on Turbopack (no flag), 'next build --webpack'." >&2
  echo "See .cursor/rules/100-stack.mdc -> 'Bundler (vastgelegd)'." >&2
  exit 1
fi

echo "check-bundler: ok — dev on Turbopack, build on webpack in every app."
