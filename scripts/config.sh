#!/usr/bin/env bash

pushd () {
    command pushd "$@" > /dev/null
}

popd () {
    command popd "$@" > /dev/null
}

# http://stackoverflow.com/a/4025065/84283
vercomp () {
    if [[ $1 == $2 ]]
    then
        return 0
    fi
    local IFS=.
    local i ver1=($1) ver2=($2)
    # fill empty fields in ver1 with zeros
    for ((i=${#ver1[@]}; i<${#ver2[@]}; i++))
    do
        ver1[i]=0
    done
    for ((i=0; i<${#ver1[@]}; i++))
    do
        if [[ -z ${ver2[i]} ]]
        then
            # fill empty fields in ver2 with zeros
            ver2[i]=0
        fi
        if ((10#${ver1[i]} > 10#${ver2[i]}))
        then
            return 1
        fi
        if ((10#${ver1[i]} < 10#${ver2[i]}))
        then
            return 2
        fi
    done
    return 0
}

# http://stackoverflow.com/a/18443300/84283
realpath() {
  OURPWD=$PWD
  cd "$(dirname "$1")"
  LINK=$(readlink "$(basename "$1")")
  while [ "$LINK" ]; do
    cd "$(dirname "$LINK")"
    LINK=$(readlink "$(basename "$1")")
  done
  REALPATH="$PWD/$(basename "$1")"
  cd "$OURPWD"
  echo "$REALPATH"
}

pushd `dirname "${BASH_SOURCE[0]}"`

source "./export-windows-layout.sh"

cd ..

ROOT=`pwd`
CHROMIUM_MIRROR_DIR=${CHROMIUM_MIRROR_DIR:-"$ROOT/../chromium-mirror"}
DEVTOOLS_BRANCH="devtools"
DIFF_BRANCH="devtools-diff"
DEVTOOLS_CHROMIUM_PREFIX="third_party/WebKit/Source/devtools"
CHROMIUM_MIRROR_DEVTOOLS_DIR="$CHROMIUM_MIRROR_DIR/$DEVTOOLS_CHROMIUM_PREFIX"
CHROMIUM_MIRROR_WEBKIT_SOURCE_DIR="$CHROMIUM_MIRROR_DIR/third_party/WebKit/Source"
CHROMIUM_MIRROR_WEBKIT_SOURCE_BUILD_DIR="$CHROMIUM_MIRROR_WEBKIT_SOURCE_DIR/_build"
DEVTOOLS_DIRAC_PREFIX="resources/unpacked/devtools"
DEVTOOLS_ROOT="$ROOT/$DEVTOOLS_DIRAC_PREFIX"
DEVTOOLS_SCRIPTS="$DEVTOOLS_ROOT/scripts"
DIRAC_USER_PROFILE=${DIRAC_USER_PROFILE:-".profiles/dirac"}
DIRAC_BROWSER_TESTS_USER_PROFILE=".profiles/dirac-browser-tests"
DIRAC_BROWSER_SAMPLE_USER_PROFILE=".profiles/dirac-sample"
DIRAC_SAMPLE_DIR="$ROOT/../dirac-sample"
DEVSERVER_ROOT="$DEVTOOLS_ROOT"
DEVSERVER_PORT=9000
RELEASES="$ROOT/releases"
RELEASE_BUILD="$ROOT/resources/release"
RELEASE_BUILD_COMPILED_BACKGROUND_JS="$RELEASE_BUILD/background.js"
RELEASE_BUILD_COMPILED_OPTIONS_JS="$RELEASE_BUILD/options.js"
RELEASE_BUILD_DEVTOOLS="$RELEASE_BUILD/devtools"
RELEASE_BUILD_DEVTOOLS_FRONTEND="$RELEASE_BUILD_DEVTOOLS/front_end"
CSS_PROPERTIES_SOURCE="$CHROMIUM_MIRROR_DEVTOOLS_DIR/../core/css/CSSProperties.in"
CSS_PROPERTIES_OUTPUT_FILE="$DEVTOOLS_ROOT/front_end/SupportedCSSProperties.js"
INSPECTOR_BACKEND_COMMANDS_OUTPUT_FILE="$DEVTOOLS_ROOT/front_end/InspectorBackendCommands.js"
SCRIPTS="$ROOT/scripts"
DIFF_WORK_DIR="$ROOT/../diff-upstream"
PROJECT_VERSION_FILE="src/project/dirac/project.clj"
UNPACKED_MANIFEST_FILE="resources/unpacked/manifest.json"
RELEASE_MANIFEST_FILE="resources/release/manifest.json"
PROJECT_FILE="project.clj"
DEVTOOLS_WORKTREE="$ROOT/../devtools"
DEV_FIXTURES_SERVER_ROOT="$ROOT/test/browser/fixtures/resources"
DEV_FIXTURES_SERVER_PORT="9080"
DEV_DIRAC_EXTENSION_PATH="$ROOT/resources/unpacked"
DEV_MARION_EXTENSION_PATH="$ROOT/test/marion/resources/unpacked"
TMP_DIR="/tmp/dirac-tmp"
TEST_CANARY_FLAG_FILE="$TMP_DIR/canary-flag"
NOTIFY_DIR="$ROOT/.notify"
PROTOCOL_JSON_FILE="$CHROMIUM_MIRROR_WEBKIT_SOURCE_BUILD_DIR/gen/blink/core/inspector/protocol.json"
#PROTOCOL_EXTERNS_OUTPUT_FILE="$DEVTOOLS_ROOT/front_end/protocol_externs.js" ! compile_frontend.py will delete this file
PROTOCOL_EXTERNS_OUTPUT_FILE="$DEVTOOLS_ROOT/front_end/generated_protocol_externs.js" # filename must differ from protocol_externs.js
BROWSER_PROTOCOL_JSON_FILE="$CHROMIUM_MIRROR_WEBKIT_SOURCE_DIR/core/inspector/browser_protocol.json"
V8_PROTOCOL_JSON_FILE="$CHROMIUM_MIRROR_DIR/v8/src/inspector/js_protocol.json"
PEON_DIR="$SCRIPTS/peon"
DIRAC_USE_CHROME=${DIRAC_USE_CHROME}
DIRAC_USE_CHROMIUM=${DIRAC_USE_CHROMIUM}
DIRAC_USE_CUSTOM_CHROME=${DIRAC_USE_CUSTOM_CHROME}
DIRAC_AGENT_PORT=${DIRAC_AGENT_PORT}
DIRAC_TEST_STAGE_DIR=${DIRAC_TEST_STAGE_DIR:-"$ROOT/../_test_stage"}
DIRAC_TEST_STAGE_RSYNC_EXCLUDE_FILE="$ROOT/.test-stage-excludes"
ACTUAL_TRANSCRIPTS_PATH="test/browser/transcripts/_actual_"
EXPECTED_TRANSCRIPTS_PATH="test/browser/transcripts/expected"

popd
