#!/usr/bin/env bash
# 发版脚本：bump version + commit + tag + push（触发 GitHub Actions）
#
# 用法：
#   ./release.sh 0.1.0     # 指定版本号
#   ./release.sh patch     # 0.1.0 → 0.1.1
#   ./release.sh minor     # 0.1.0 → 0.2.0
#   ./release.sh major     # 0.1.0 → 1.0.0

set -euo pipefail
cd "$(dirname "$0")"

VERSION_ARG="${1:-}"
if [[ -z "$VERSION_ARG" ]]; then
    cat <<EOF
Usage: $0 <version|patch|minor|major>

Examples:
  $0 0.2.0       set specific version
  $0 patch       bump patch (0.1.0 → 0.1.1)
  $0 minor       bump minor (0.1.0 → 0.2.0)
  $0 major       bump major (0.1.0 → 1.0.0)
EOF
    exit 1
fi

# ─── 1. 安全检查 ────────────────────────────────────────────
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "❌ not a git repo"
    exit 1
fi

if ! git diff-index --quiet HEAD --; then
    echo "❌ working tree has uncommitted changes"
    echo "   git status:"
    git status --short
    exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
    echo "⚠️  current branch is '$BRANCH' (typically 'main')"
    read -p "   continue anyway? [y/N] " yn
    [[ "$yn" =~ ^[Yy] ]] || exit 1
fi

CURRENT=$(node -p "require('./package.json').version")
echo "current version: $CURRENT"

# ─── 2. 计算新版本号 ────────────────────────────────────────
# 如果传的就是当前版本号 → 跳过 bump（直接给当前 HEAD 打 tag）
# 否则交给 pnpm version 处理（支持 patch/minor/major + 具体 semver 字符串）
if [[ "$VERSION_ARG" == "$CURRENT" ]]; then
    echo "(version unchanged — skip bump, will tag current HEAD)"
    NEW="$CURRENT"
else
    pnpm version "$VERSION_ARG" --no-git-tag-version >/dev/null
    NEW=$(node -p "require('./package.json').version")
fi

TAG="v${NEW}"
echo "new version:     $NEW (tag: $TAG)"

# ─── 3. tag 重名检查 ────────────────────────────────────────
rollback_bump() {
    if ! git diff --quiet package.json 2>/dev/null; then
        git checkout -- package.json
    fi
}

if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "❌ tag $TAG already exists locally"
    rollback_bump
    exit 1
fi
if git ls-remote --tags origin 2>/dev/null | grep -q "refs/tags/${TAG}$"; then
    echo "❌ tag $TAG already exists on remote"
    rollback_bump
    exit 1
fi

# ─── 4. commit（仅在有改动时） + tag ────────────────────────
if ! git diff --quiet package.json 2>/dev/null; then
    git add package.json
    git commit -m "chore: release $TAG"
else
    echo "(no package.json change, skipping bump commit)"
fi
git tag -a "$TAG" -m "Release $TAG"

echo ""
echo "ready:"
echo "  • commit: $(git log -1 --oneline)"
echo "  • tag:    $TAG"
echo ""

# ─── 5. push ────────────────────────────────────────────────
read -p "push to origin and trigger GitHub Actions? [y/N] " yn
if [[ "$yn" =~ ^[Yy] ]]; then
    git push origin "$BRANCH"
    git push origin "$TAG"
    echo ""
    echo "✓ pushed"
    REMOTE=$(git remote get-url origin 2>/dev/null | sed 's|git@github.com:|https://github.com/|; s|\.git$||')
    if [[ -n "$REMOTE" ]]; then
        echo "  GitHub Actions: $REMOTE/actions"
        echo "  Release page:   $REMOTE/releases"
    fi
else
    echo "skipped push. To push manually later:"
    echo "  git push origin $BRANCH"
    echo "  git push origin $TAG"
    echo ""
    echo "To undo the commit/tag if you change your mind:"
    echo "  git tag -d $TAG"
    echo "  git reset --hard HEAD^"
fi
