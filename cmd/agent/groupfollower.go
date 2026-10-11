package main

// Whether this speaker currently follows a group or stereo pair, for the
// preset reconcile (#1077). A follower's firmware refuses every AddPreset
// while it is in GroupSlave, so writing presets into it is wasted NAND writes
// and, worse, a log that claims keys were healed when nothing was stored.

import "strings"

// groupFollowerFn is wired in main: the stereo-pair record STR keeps in marge
// first (a pair formed through STR leaves the zone store empty), the speaker's
// own zone second. nil (tests, early start) means "not a follower".
var groupFollowerFn func() (bool, string)

// presetWriteGroupFollower reports whether the preset writes must be skipped
// because this speaker follows a group, and why.
func presetWriteGroupFollower() (bool, string) {
	if groupFollowerFn == nil {
		return false, ""
	}
	return groupFollowerFn()
}

// pairRole reads the stereo-pair record: decided is false when it says
// nothing (no pair, or this speaker's own id is not known yet), in which case
// the caller asks the zone instead of guessing.
func pairRole(master, self string, pairOK bool) (decided, follower bool) {
	if !pairOK || strings.TrimSpace(master) == "" || strings.TrimSpace(self) == "" {
		return false, false
	}
	return true, !strings.EqualFold(master, self)
}
