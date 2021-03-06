#!/usr/bin/env bash

pushd `dirname "${BASH_SOURCE[0]}"` > /dev/null
source "./config.sh"

pushd "$ROOT"

git checkout master
git pull origin

TAG=${1:-`git describe --tags --match "v*" --abbrev=0 master`}

echo "TAG=$TAG"

git rev-parse --verify health-check
if [ $? -ne 0 ]; then
  git checkout -b health-check "$TAG"
else
  git checkout health-check
fi

git merge --no-edit -Xtheirs "$TAG"
git commit --allow-empty -m "a health-check of $TAG against current Chromium"

git checkout master
git push --force origin health-check

popd

popd
