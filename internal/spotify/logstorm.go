// logstorm.go: keeps a track-skip storm from flushing the speaker's log.
//
// When Spotify refuses the audio key for a whole playlist, go-librespot logs
// every track it skips ("failed retrieving aes key", "skipping track ...") and
// races through 50 of them in a few seconds. Forwarded one by one, that storm
// flushed the 32 KB NAND log ring and took the minutes before it, the part a
// diagnosis actually needs, with it (#1077: 51 consecutive unplayable tracks).
// The first few lines of a run still go out verbatim, so the cause stays
// visible; the rest are counted and reported as one summary line.

package spotify

import (
	"log/slog"
	"strings"
	"sync"
	"time"
)

const (
	// skipStormVerbatim is how many lines of one run are logged as they are.
	skipStormVerbatim = 4
	// skipStormGap ends a run: a skip line this long after the previous one
	// starts a new run, logged verbatim again.
	skipStormGap = 30 * time.Second
	// skipStormQuiet is how long after the last skip line any other engine
	// line closes the run with its summary.
	skipStormQuiet = 2 * time.Second
)

// skipStormLimiter decides which go-librespot lines reach the log. Safe for
// concurrent use.
type skipStormLimiter struct {
	logger *slog.Logger
	now    func() time.Time

	mu         sync.Mutex
	run        int // skip lines in the current run
	suppressed int // of those, not logged yet
	lastSkipAt time.Time
}

func newSkipStormLimiter(l *slog.Logger) *skipStormLimiter {
	return &skipStormLimiter{logger: l, now: time.Now}
}

// isSkipStormLine matches the per-track lines of a skip run.
func isSkipStormLine(lc string) bool {
	return strings.Contains(lc, "skipping track") ||
		strings.Contains(lc, "failed retrieving aes key") ||
		strings.Contains(lc, "failed retrieving audio key")
}

// allow reports whether line should be logged. It logs the run's summary
// itself when the run is over: on the engine's own "consecutive unplayable
// tracks" line, on the first other line after skipStormQuiet, or when a new
// run starts after skipStormGap.
func (s *skipStormLimiter) allow(line string) bool {
	lc := strings.ToLower(line)
	now := s.now()
	s.mu.Lock()
	defer s.mu.Unlock()
	if isSkipStormLine(lc) {
		if !s.lastSkipAt.IsZero() && now.Sub(s.lastSkipAt) > skipStormGap {
			s.summaryLocked()
			s.run = 0
		}
		s.lastSkipAt = now
		s.run++
		if s.run > skipStormVerbatim {
			s.suppressed++
			return false
		}
		return true
	}
	if s.suppressed > 0 && (strings.Contains(lc, "consecutive unplayable tracks") || now.Sub(s.lastSkipAt) > skipStormQuiet) {
		s.summaryLocked()
		s.run = 0
	}
	return true
}

// summaryLocked logs how many lines of the run were held back. Caller holds mu.
func (s *skipStormLimiter) summaryLocked() {
	if s.suppressed == 0 {
		return
	}
	s.logger.Info("go-librespot: track-skip lines held back to protect the log",
		"suppressed", s.suppressed, "runLines", s.run)
	s.suppressed = 0
}

// lineLimiter lets one log line through per window and counts the ones it
// held back, so the next line that goes out can say how many were skipped.
// The zero value is ready to use and safe for concurrent use. Used for lines
// that a misbehaving speaker can make the agent repeat in a tight loop (#1065:
// the per-track boundary line while the engine raced through tracks with no
// box attached); the first line of a burst always goes out, so the cause stays
// visible in the NAND log tail.
type lineLimiter struct {
	mu         sync.Mutex
	last       time.Time
	suppressed int
}

// allow reports whether a line is due at now, and how many lines were held
// back since the last one that was let through.
func (l *lineLimiter) allow(now time.Time, window time.Duration) (ok bool, suppressed int) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if !l.last.IsZero() && now.Sub(l.last) < window {
		l.suppressed++
		return false, 0
	}
	l.last = now
	suppressed, l.suppressed = l.suppressed, 0
	return true, suppressed
}
