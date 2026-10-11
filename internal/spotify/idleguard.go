// idleguard.go: stops STR from re-arming the Spotify engine for a speaker that
// never takes the audio (#1065).
//
// Three paths keep go-librespot playing with no box attached, on purpose: a
// recall mark (SetRecalling) and a re-point (armRepoint) arm engineHotUntil so
// the drain does not pause the engine while the box flaps its source, and the
// auto-switch (maybeActivate) pushes the stream URI to the box whenever the
// engine reports playback. On a wedged speaker (transport accepts the URI but
// never fetches the stream, field bundle v1.0.12 ST10) the three fed each
// other: every track the engine finished produced a "playing" event, that
// fired the auto-switch, the recall retries re-armed the hot window, and the
// engine never paused. Spotify then refused the audio keys and rate-limited
// the account (429 for over ten minutes).
//
// The guard counts those activations since the box last RECEIVED audio. The
// first two pass unchanged, which covers every legitimate flow seen in the
// field (a recall plus the hardware verify re-point; an app tap plus one
// retry). From the third on, the engine is no longer kept hot and the
// auto-switch stands down, with one WARN per trip.
//
// It resets when audio actually reaches a box (forward, first audio page of an
// attachment), NOT on a bare attach: in #1065 the speaker attached and
// detached with forwardedKB=0, and resetting on those would have kept the
// storm alive. It also resets after idleGuardQuiet without any activation, so
// a listener who fixes the speaker (or simply tries again later) is not locked
// out until the next successful play.

package spotify

import "time"

const (
	// idleGuardMax is how many activations without delivered audio are
	// allowed to keep the engine hot / switch the box over.
	idleGuardMax = 2
	// idleGuardCoalesce merges activations that belong to one user action:
	// an app recall calls SetRecalling from the web UI and again from Play,
	// a hardware press from the gabbo handler and again from Play.
	idleGuardCoalesce = 3 * time.Second
	// idleGuardQuiet resets the count after this long without any activation.
	idleGuardQuiet = 2 * time.Minute
)

// admitActivationLocked counts one activation at now and reports whether it may
// arm the engine. warn is true exactly once per trip, for the caller to log
// after releasing mu. Caller holds m.mu.
func (m *Manager) admitActivationLocked(now time.Time) (ok, warn bool) {
	if !m.idleActivationAt.IsZero() {
		since := now.Sub(m.idleActivationAt)
		if since > idleGuardQuiet {
			m.idleActivations, m.idleGuardWarned = 0, false
		} else if since >= 0 && since < idleGuardCoalesce && m.idleActivations > 0 {
			// Same user action as the last counted activation: same verdict.
			return m.idleActivations <= idleGuardMax, false
		}
	}
	// A refused attempt also stamps the time, so a storm that keeps knocking
	// keeps the guard closed instead of waiting out idleGuardQuiet.
	m.idleActivationAt = now
	m.idleActivations++
	if m.idleActivations <= idleGuardMax {
		return true, false
	}
	if !m.idleGuardWarned {
		m.idleGuardWarned = true
		return false, true
	}
	return false, false
}

// noteAudioDeliveredLocked resets the guard: a box has just received audio.
// It reports whether the guard had tripped, so the caller can say it lifted.
// Caller holds m.mu.
func (m *Manager) noteAudioDeliveredLocked() (wasTripped bool) {
	wasTripped = m.idleActivations > idleGuardMax
	m.idleActivations, m.idleActivationAt, m.idleGuardWarned = 0, time.Time{}, false
	return wasTripped
}

// warnIdleGuard is the one line per trip. It names the counts so a bundle shows
// how far the loop got before the guard closed it.
func (m *Manager) warnIdleGuard(what string) {
	m.logger.Warn("spotify: the speaker has not taken any audio after repeated attempts, so STR stops keeping the Spotify engine playing and stops switching the speaker over until it does (or two quiet minutes pass)",
		"blocked", what, "attempts", idleGuardMax+1)
}
