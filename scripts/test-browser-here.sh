#!/usr/bin/env bash

# this will run browser tests against fully optimized dirac extension (release build)

set -e

pushd `dirname "${BASH_SOURCE[0]}"` > /dev/null
source "./config.sh"

pushd "$ROOT"

# we want to prevent clashes between:
#   *  chrome instance for developing tests (port 9333)
#   *  chrome instance for automated tests (port 9444)
#   *  and ad-hoc chrome instances with default (port 9222)
SETUP="\
DIRAC_SETUP_CHROME_REMOTE_DEBUGGING_PORT=9444 \
DIRAC_SETUP_NREPL_SERVER_PORT=13040 \
DIRAC_AGENT/NREPL_SERVER/PORT=13040 \
DIRAC_AGENT/NREPL_TUNNEL/PORT=13041 \
DIRAC_RUNTIME/AGENT_PORT=13041 \
DIRAC_NREPL/WEASEL_PORT=13042"

export CHROME_DRIVER_LOG_PATH="$ROOT/target/chromedriver.log"
export DIRAC_CHROME_DRIVER_VERBOSE=1

env ${SETUP} lein compile-browser-tests
env ${SETUP} lein compile-marion
env ${SETUP} ./scripts/release.sh
env ${SETUP} lein run-browser-tests # = compile-dirac and devtools plus some cleanup, see scripts/release.sh

popd

popd
