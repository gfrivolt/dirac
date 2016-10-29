(ns dirac.test-lib.chrome-browser
  (:require [clojure.core.async :refer [timeout <!!]]
            [clojure.core.async.impl.protocols :refer [closed?]]
            [clojure.tools.logging :as log]
            [clojure.java.shell :refer [sh]]
            [clojure.string :as string]
            [clj-webdriver.taxi :refer :all]
            [clj-webdriver.driver :refer [init-driver]]
            [dirac.settings :refer [get-browser-connection-minimal-cooldown]]
            [dirac.test-lib.chrome-driver :as chrome-driver])
  (:import (java.io ByteArrayOutputStream PrintStream)))

(def connection-cooldown-channel (atom nil))
(def user-data-dir (atom nil))

; -- helpers ----------------------------------------------------------------------------------------------------------------

(defn get-connection-cooldown []
  @connection-cooldown-channel)

(defn set-connection-cooldown! [channel]
  (reset! connection-cooldown-channel channel))

(defn clear-connection-cooldown! []
  (set-connection-cooldown! nil))

(defn get-user-data-dir []
  @user-data-dir)

(defn set-user-data-dir! [dir]
  (reset! user-data-dir dir))

(defn extract-user-data-dir [chrome-info]
  (if-let [m (re-find #"--user-data-dir=(.*) " chrome-info)]
    (second m)))

; -- high-level api ---------------------------------------------------------------------------------------------------------

; https://bugs.chromium.org/p/chromedriver/issues/detail?id=878#c12
;
;  I wanted to implement automated testing of my chrome extension which is using DevTools debugging protocol
;  (it is actually a devtools fork[1]).
;
;  Fact1: it is not possible to use chrome driver AND another thing using debugging protocol simultaneously
;         - this is a limitation of debugging protocol which allows only one client connection.
;         See "Simultaneous protocol clients"[2] But it is possible to use the protocol sequentially in turns. Chrome driver
;         launches chrome, connects to protocol, does some of its work, disconnects but leaves the browser open, then some
;         other client connects, does its work and disconnects, then next client can take turn and so on, last client connects
;         and quits the browser.
;
;  Fact2: it is not possible to specify --remote-debugging-port argument when launching Chrome via chrome driver args.
;         AFAIK The port range is hardcoded[3] and cannot be specified via configuration. If you specify
;         --remote-debugging-port via your own supplied args chrome will use it, but chrome driver won't be aware of it.
;         That is the explanation why chrome driver does not return, because it is trying to talk with launched browser
;         instance on a different port.
;
;  So I used this strategy:
;  1. chrome driver launches chrome with "detach" option (this is important for some reason)
;  2. I retrieve actual remote-debugging-port randomly generated by the driver by using driver connection to scrape
;     chrome://version page (there is a list of all command-line args used during chrome launch)
;  3. Then I disconnect the driver hard way - I cannot call quit on the driver (that would close the browser instance),
;     I call .stop on driver service instance instead. It complains[4] but works.
;  4. Then I'm free to connect with my own debugging protocol client and do my work, then disconnect and leave chrome running
;  5. Then I can reconnect again with chrome driver, but I have to use "debuggerAddress" option instead of "detach", to
;     instruct the driver to connect to existing chrome instance, to construct proper debuggerAddress I use the port from
;     step #2
;
;  The only missing piece so far is quitting chrome with chrome driver connected via "debuggerAddress", it seems that in
;  this mode driver does not allow browser process termination (for some reason).
;
;  [1] https://github.com/binaryage/dirac
;  [2] https://developer.chrome.com/devtools/docs/debugger-protocol
;  [3] https://chromium.googlesource.com/chromium/src.git/+/ab34d708e66ae2b9d32d3536a48de5501e34e98c/chrome/test/chromedriver/server/http_handler.cc#90
;  [4]
;  [2.173][WARNING]: chrome quit unexpectedly, leaving behind temporary directories for debugging:
;  [2.173][SEVERE]: Port leaked: 12980

(defn print-chrome-info! []
  (if-let [chrome-info (chrome-driver/retrieve-chrome-info)]
    (if-let [user-data-dir (extract-user-data-dir chrome-info)]
      (do
        (set-user-data-dir! user-data-dir)
        (log/info (str "== CHROME INFO ============================================================================\n"
                       chrome-info "---")))
      (do
        (log/error "unable to retrieve --user-data-dir from\n" chrome-info)
        (System/exit 3)))
    (do
      (log/error "unable to retrieve chrome info")
      (System/exit 2))))

(defn steal-debugging-port! []
  (if-let [debug-port (chrome-driver/retrieve-remote-debugging-port)]
    (chrome-driver/set-debugging-port! debug-port)
    (do
      (log/error "unable to retrieve-remote-debugging-port")
      (System/exit 1))))

(defn prepare-driver! []
  (let [driver (chrome-driver/prepare-chrome-driver (chrome-driver/prepare-options))]
    (set-driver! driver)))

(defn start-browser! []
  (log/debug "start-browser!")
  (prepare-driver!)
  (steal-debugging-port!)
  (print-chrome-info!))

(defn stop-browser! []
  ; Cannot call driver's quit because it does not work well with our reconnection strategy (when using debuggerAddress option)
  ; Reconnected chrome driver loses ability to quit chrome browser properly for some reason.
  ; Instead we kill all processes which match user-data-dir passed as a command-line parameter.
  ; For this to work we assume that each new chrome browser instance gets an unique directory pointing to some temp folder.
  ; This is at least the case with Chrome Driver 2.21.371459 on Mac.
  (log/debug "stop-browser!")
  (let [user-data-dir (get-user-data-dir)
        command ["-f" user-data-dir]]                                                                                         ; this may be an over kill because we match also Chrome's helper processes
    (assert user-data-dir)
    (log/debug "killing browser instance with " command)
    (log/debug "candidate pids to kill:" (string/join ", " (string/split (:out (apply sh "pgrep" command)) #"\n")))
    (let [result (apply sh "pkill" command)]
      (if-not (empty? (:out result))
        (log/info (:out result)))
      (if-not (empty? (:err result))
        (log/error "shell command: pkill" command "failed to execute:" (:err result))))))

(defn wait-for-reconnection-cooldown! []
  (when-let [cooldown-channel (get-connection-cooldown)]
    (when-not (closed? cooldown-channel)
      (log/info "waiting for connection to cool down...")
      (<!! cooldown-channel))
    (clear-connection-cooldown!)))

(defmacro with-output-silencer [& body]
  `(let [buffer# (ByteArrayOutputStream.)
         stream# (PrintStream. buffer#)
         prev-out# System/out
         prev-err# System/err]
     (try
       (System/setOut stream#)
       (System/setErr stream#)
       ~@body
       (finally
         (System/setOut prev-out#)
         (System/setErr prev-err#)))))

(defn shoot-chromedriver-in-the-back! []
  (let [command ["chromedriver"]
        pids (string/join ", " (string/split (:out (apply sh "pgrep" command)) #"\n"))]
    (log/debug "chromedriver pids to kill:" pids)
    (let [result (apply sh "pkill" command)]
      (if-not (empty? (:out result))
        (log/info (:out result)))
      (if-not (empty? (:err result))
        (log/error "shell command: pkill" command "failed to execute:" (:err result))))))

(defn disconnect-browser! []
  ; stopping service works as well, but it spits in the output
  ; this is quick and silent (when used with-output-silencer)
  (with-output-silencer
    (shoot-chromedriver-in-the-back!))
  (chrome-driver/set-current-chrome-driver-service! nil)
  (set-connection-cooldown! (timeout (get-browser-connection-minimal-cooldown))))

(defn reconnect-browser! []
  (wait-for-reconnection-cooldown!)
  (with-output-silencer
    (let [options (assoc (chrome-driver/prepare-options true) :debugger-port (chrome-driver/get-debugging-port))]
      (set-driver! (chrome-driver/prepare-chrome-driver options)))))

(defn setup-browser! []
  (start-browser!)
  ; initial chromedriver connection is special
  ; we want to disconnect and then reconnect with debuggerAddress so we level paying field for tests to be executed later
  ; otherwise the first test would use this special connection which would be, well, inconsistent and unfair
  (disconnect-browser!)
  (reconnect-browser!))
